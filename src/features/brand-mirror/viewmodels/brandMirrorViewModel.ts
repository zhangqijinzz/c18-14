import { clampTokenValues, cloneTokens, contrastRatio, normalizeColor, themeTokens, validateTokens } from '../domain/brandRules'
import type { BrandRepository } from '../repositories/brandRepository'
import type { BrandGuidelinesExporter } from '../services/exportService'
import { INITIAL_TOKENS, type BrandDocument, type BrandMirrorSnapshot, type BrandTheme, type SavedVersion } from '../models/brandMirrorModels'

type Listener = () => void

const SAVE_FAILED_MESSAGE = '自动保存失败：无法写入本地工作区，可能是浏览器存储受限或空间不足。当前编辑仍保留在本页，但尚未持久化；请不要刷新或关闭页面，稍后继续编辑触发重试，或先复制内容备份。'
const VERSION_SAVE_FAILED_MESSAGE = '版本保存失败：无法写入本地工作区，可能是浏览器存储受限或空间不足。版本尚未记录，但当前编辑仍保留在本页；请不要刷新或关闭页面，稍后重试或先复制内容备份。'
const EXPORT_FAILED_MESSAGE = '导出失败：未能生成品牌规范文件，可能是浏览器下载权限受限或导出服务暂时不可用。编辑内容仍保存在本地工作区，请检查下载权限或稍后重新导出。'
const EXPORT_FAILED_WHILE_SAVE_UNAVAILABLE_MESSAGE = '导出失败：未能生成品牌规范文件，可能是浏览器下载权限受限或导出服务暂时不可用。当前页面中的编辑未受影响，但本地保存仍失败；请先按保存提示备份内容，再重新导出。'

export class BrandMirrorViewModel {
  private snapshot: BrandMirrorSnapshot = this.makeSnapshot({ tokens: INITIAL_TOKENS, theme: 'studio', versions: [] })
  private readonly listeners = new Set<Listener>()
  private readonly repository: BrandRepository
  private readonly exporter?: BrandGuidelinesExporter

  constructor(repository: BrandRepository, exporter?: BrandGuidelinesExporter) {
    this.repository = repository
    this.exporter = exporter
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  getSnapshot(): BrandMirrorSnapshot {
    return this.snapshot
  }

  initialize(): void {
    const stored = this.repository.load()
    if (stored) {
      this.snapshot = this.makeSnapshot(stored, '已恢复最近一次工作状态')
    } else {
      this.snapshot = this.makeSnapshot({ tokens: INITIAL_TOKENS, theme: 'studio', versions: [] }, '从 Studio warm 开始探索')
    }
    this.emit()
  }

  selectTheme(theme: BrandTheme): void {
    this.update({ tokens: themeTokens(theme), theme }, '已切换基础主题')
  }

  updateColor(field: 'primary' | 'secondary', value: string): void {
    const color = normalizeColor(value)
    this.update({ tokens: { ...this.snapshot.tokens, [field]: color } }, '令牌已更新')
  }

  updateScale(field: 'radiusScale' | 'spacingScale' | 'typeScale', index: number, value: number): void {
    const values = [...this.snapshot.tokens[field]]
    values[index] = Number.isFinite(value) ? value : values[index]
    this.update({ tokens: clampTokenValues({ ...this.snapshot.tokens, [field]: values }) }, '令牌已更新')
  }

  reset(): void {
    this.update({ tokens: cloneTokens(INITIAL_TOKENS), theme: 'studio' }, '已恢复默认令牌')
  }

  saveVersion(): void {
    const validationError = validateTokens(this.snapshot.tokens)
    if (validationError) {
      this.snapshot = { ...this.snapshot, status: 'error', message: validationError }
      this.emit()
      return
    }
    const nextVersion: SavedVersion = {
      id: `version-${Date.now()}`,
      label: this.snapshot.versions.length === 0 ? 'Version A' : `Version ${String.fromCharCode(65 + this.snapshot.versions.length)}`,
      tokens: cloneTokens(this.snapshot.tokens),
      createdAt: new Date().toISOString(),
    }
    const versions = [...this.snapshot.versions, nextVersion]
    this.persist({ tokens: this.snapshot.tokens, theme: this.snapshot.theme, versions }, '版本已保存', VERSION_SAVE_FAILED_MESSAGE)
  }

  toggleCompare(): void {
    this.snapshot = { ...this.snapshot, compareMode: !this.snapshot.compareMode, message: this.snapshot.compareMode ? '已退出对比模式' : '正在对比最近两个版本' }
    this.emit()
  }

  exportBrandGuidelines(): void {
    if (!this.exporter) return
    try {
      this.exporter.export(this.snapshot)
      this.snapshot = {
        ...this.snapshot,
        message: '品牌规范文件已导出，请在下载位置查看。',
        exportStatus: 'success',
        exportMessage: '品牌规范已导出；如未看到文件，请检查浏览器的下载位置或拦截提示。',
      }
    } catch {
      const exportMessage = this.snapshot.saveStatus === 'error'
        ? EXPORT_FAILED_WHILE_SAVE_UNAVAILABLE_MESSAGE
        : EXPORT_FAILED_MESSAGE
      this.snapshot = {
        ...this.snapshot,
        message: exportMessage,
        exportStatus: 'error',
        exportMessage,
      }
    }
    this.emit()
  }

  private update(partial: Partial<Pick<BrandDocument, 'tokens' | 'theme'>>, message: string): void {
    const tokens = partial.tokens ?? this.snapshot.tokens
    this.snapshot = this.makeSnapshot({ tokens, theme: partial.theme ?? this.snapshot.theme, versions: this.snapshot.versions }, message, 'editing')
    this.persistCurrent()
  }

  private persistCurrent(): void {
    try {
      this.repository.save({ version: 1, tokens: this.snapshot.tokens, theme: this.snapshot.theme, versions: this.snapshot.versions })
      this.snapshot = {
        ...this.snapshot,
        status: 'ready',
        saveStatus: 'ready',
        saveMessage: '所有更改已保存到本地工作区。',
      }
    } catch {
      this.snapshot = {
        ...this.snapshot,
        status: 'error',
        saveStatus: 'error',
        saveMessage: SAVE_FAILED_MESSAGE,
        message: SAVE_FAILED_MESSAGE,
      }
    }
    this.emit()
  }

  private persist(document: Omit<BrandDocument, 'version'>, message: string, saveErrorMessage: string): void {
    try {
      this.repository.save({ version: 1, ...document })
      this.snapshot = this.makeSnapshot(document, message, 'ready')
    } catch {
      this.snapshot = {
        ...this.snapshot,
        status: 'error',
        saveStatus: 'error',
        saveMessage: saveErrorMessage,
        message: saveErrorMessage,
      }
    }
    this.emit()
  }

  private makeSnapshot(document: Omit<BrandDocument, 'version'>, message = '', status: Exclude<BrandMirrorSnapshot['status'], 'loading'> = 'ready'): BrandMirrorSnapshot {
    const ratio = contrastRatio(document.tokens.primary, document.tokens.secondary)
    const latestVersion = document.versions[document.versions.length - 1]
    const previous = this.snapshot
    return {
      status,
      saveStatus: status === 'editing' ? 'ready' : status,
      saveMessage: status === 'error'
        ? previous?.saveMessage ?? SAVE_FAILED_MESSAGE
        : '所有更改已保存到本地工作区。',
      exportStatus: 'idle',
      exportMessage: '',
      tokens: cloneTokens(document.tokens),
      theme: document.theme,
      versions: document.versions,
      compareMode: false,
      activeVersionId: latestVersion?.id ?? null,
      contrastRatio: ratio,
      contrastWarning: ratio < 3,
      message,
    }
  }

  private emit(): void {
    this.listeners.forEach((listener) => listener())
  }
}
