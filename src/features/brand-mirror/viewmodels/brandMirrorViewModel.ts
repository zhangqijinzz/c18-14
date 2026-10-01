import { clampTokenValues, cloneTokens, contrastRatio, normalizeColor, themeTokens, validateTokens } from '../domain/brandRules'
import type { BrandRepository } from '../repositories/brandRepository'
import type { BrandGuidelinesExporter } from '../services/exportService'
import { INITIAL_TOKENS, type BrandDocument, type BrandMirrorSnapshot, type BrandTheme, type ExportStatus, type FeedbackNotice, type SavedVersion } from '../models/brandMirrorModels'

type Listener = () => void

const AUTO_SAVE_DETAIL = '更改会自动保存到本地。'

export class BrandMirrorViewModel {
  private snapshot: BrandMirrorSnapshot = this.makeSnapshot(
    { tokens: INITIAL_TOKENS, theme: 'studio', versions: [] },
    { message: '准备开始探索', detail: '正在加载本地工作区…', tone: 'info' },
  )
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
      this.snapshot = this.makeSnapshot(stored, {
        message: '已恢复最近一次工作状态',
        detail: '上次编辑的令牌与版本已从本地工作区恢复。',
        tone: 'success',
      })
    } else {
      this.snapshot = this.makeSnapshot(
        { tokens: INITIAL_TOKENS, theme: 'studio', versions: [] },
        { message: '从 Studio warm 开始探索', detail: AUTO_SAVE_DETAIL, tone: 'info' },
      )
    }
    this.emit()
  }

  selectTheme(theme: BrandTheme): void {
    this.update({ tokens: themeTokens(theme), theme }, { message: '已切换基础主题', detail: AUTO_SAVE_DETAIL, tone: 'info' })
  }

  updateColor(field: 'primary' | 'secondary', value: string): void {
    const color = normalizeColor(value)
    this.update({ tokens: { ...this.snapshot.tokens, [field]: color } }, { message: '令牌已更新', detail: AUTO_SAVE_DETAIL, tone: 'info' })
  }

  updateScale(field: 'radiusScale' | 'spacingScale' | 'typeScale', index: number, value: number): void {
    const values = [...this.snapshot.tokens[field]]
    values[index] = Number.isFinite(value) ? value : values[index]
    this.update(
      { tokens: clampTokenValues({ ...this.snapshot.tokens, [field]: values }) },
      { message: '令牌已更新', detail: AUTO_SAVE_DETAIL, tone: 'info' },
    )
  }

  reset(): void {
    this.update(
      { tokens: cloneTokens(INITIAL_TOKENS), theme: 'studio' },
      { message: '已恢复默认令牌', detail: AUTO_SAVE_DETAIL, tone: 'info' },
    )
  }

  saveVersion(): void {
    const validationError = validateTokens(this.snapshot.tokens)
    if (validationError) {
      // 校验未过是「保存动作被拒绝」，给出真实原因和修正方式；编辑内容并未丢失。
      this.snapshot = {
        ...this.snapshot,
        exportStatus: 'idle',
        notice: {
          message: '版本未保存：令牌未通过校验',
          detail: `${validationError} 请按提示修正后再保存版本；当前编辑仍保留在页面中。`,
          tone: 'error',
        },
      }
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
    this.persist(
      { tokens: this.snapshot.tokens, theme: this.snapshot.theme, versions },
      { message: '版本已保存', detail: `${nextVersion.label} 已存入本地，可用于版本对比。`, tone: 'success' },
      {
        message: '版本保存失败，当前编辑仍在页面中',
        detail: '写入本地时出错，可能是浏览器存储已满或不可用。请保持页面打开，稍后重试“保存当前版本”。',
        tone: 'error',
      },
    )
  }

  toggleCompare(): void {
    const compareMode = !this.snapshot.compareMode
    this.snapshot = {
      ...this.snapshot,
      compareMode,
      exportStatus: 'idle',
      notice: {
        message: compareMode ? '正在对比最近两个版本' : '已退出对比模式',
        detail: compareMode ? '对比仅用于查看，不影响已保存内容。' : '返回正常编辑视图。',
        tone: 'info',
      },
    }
    this.emit()
  }

  exportBrandGuidelines(): void {
    if (!this.exporter) return
    try {
      this.exporter.export(this.snapshot)
      // 导出是独立通道：成功与否都不写入 status，避免污染本地保存状态。
      this.snapshot = {
        ...this.snapshot,
        exportStatus: 'success',
        notice: {
          message: '品牌规范已导出',
          detail: 'Markdown 文件已开始下载，本地编辑与已保存版本未受影响，无需重新保存。',
          tone: 'success',
        },
      }
    } catch {
      this.snapshot = {
        ...this.snapshot,
        exportStatus: 'error',
        notice: {
          message: '导出失败，本地内容仍是安全的',
          detail: '生成或下载品牌规范文件时出错，可能是浏览器拦截了下载。编辑和已保存版本都未受影响，请检查下载权限后重试导出，无需重新保存。',
          tone: 'error',
        },
      }
    }
    this.emit()
  }

  private update(partial: Partial<Pick<BrandDocument, 'tokens' | 'theme'>>, notice: FeedbackNotice): void {
    const tokens = partial.tokens ?? this.snapshot.tokens
    this.snapshot = this.makeSnapshot({ tokens, theme: partial.theme ?? this.snapshot.theme, versions: this.snapshot.versions }, notice, 'editing')
    this.persistCurrent()
  }

  private persistCurrent(): void {
    try {
      this.repository.save({ version: 1, tokens: this.snapshot.tokens, theme: this.snapshot.theme, versions: this.snapshot.versions })
    } catch {
      // 只有这里（自动保存确实失败）才允许把 status 置为 error。
      this.snapshot = {
        ...this.snapshot,
        status: 'error',
        exportStatus: 'idle',
        notice: {
          message: '本地保存失败，但编辑没有丢失',
          detail: '自动保存到本地时被拒绝，可能是浏览器存储已满或不可用。当前编辑仍保留在页面中，请保持页面打开，稍后重试或手动保存版本。',
          tone: 'error',
        },
      }
    }
    this.emit()
  }

  private persist(document: Omit<BrandDocument, 'version'>, successNotice: FeedbackNotice, failureNotice: FeedbackNotice): void {
    try {
      this.repository.save({ version: 1, ...document })
      this.snapshot = this.makeSnapshot(document, successNotice, 'ready')
    } catch {
      this.snapshot = { ...this.snapshot, status: 'error', exportStatus: 'idle', notice: failureNotice }
    }
    this.emit()
  }

  private makeSnapshot(
    document: Omit<BrandDocument, 'version'>,
    notice: FeedbackNotice = { message: '', detail: '', tone: 'info' },
    status: BrandMirrorSnapshot['status'] = 'ready',
    exportStatus: ExportStatus = 'idle',
    compareMode = false,
  ): BrandMirrorSnapshot {
    const ratio = contrastRatio(document.tokens.primary, document.tokens.secondary)
    const latestVersion = document.versions[document.versions.length - 1]
    return {
      status,
      tokens: cloneTokens(document.tokens),
      theme: document.theme,
      versions: document.versions,
      compareMode,
      activeVersionId: latestVersion?.id ?? null,
      contrastRatio: ratio,
      contrastWarning: ratio < 3,
      notice,
      exportStatus,
    }
  }

  private emit(): void {
    this.listeners.forEach((listener) => listener())
  }
}
