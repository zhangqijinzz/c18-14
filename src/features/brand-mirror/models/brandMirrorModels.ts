export type BrandTheme = 'studio' | 'editorial' | 'night'
// status 只表达「本地保存」状态：error 仅在本地持久化确实失败/被拒绝时出现，
// 导出失败不得写入这里，否则顶栏会把导出问题误报成数据安全问题。
export type MirrorStatus = 'loading' | 'ready' | 'editing' | 'error'
// 导出是独立通道：它的成败不影响本地保存状态。
export type ExportStatus = 'idle' | 'success' | 'error'
export type NoticeTone = 'info' | 'success' | 'error'

export interface FeedbackNotice {
  /** 一句话结论，顶栏/提示条标题 */
  message: string
  /** 真实原因与用户可以采取的处理方式 */
  detail: string
  tone: NoticeTone
}

export interface BrandTokens {
  primary: string
  secondary: string
  radiusScale: number[]
  spacingScale: number[]
  typeScale: number[]
}

export interface SavedVersion {
  id: string
  label: string
  tokens: BrandTokens
  createdAt: string
}

export interface BrandDocument {
  version: 1
  tokens: BrandTokens
  theme: BrandTheme
  versions: SavedVersion[]
}

export interface BrandMirrorSnapshot {
  status: MirrorStatus
  tokens: BrandTokens
  theme: BrandTheme
  versions: SavedVersion[]
  compareMode: boolean
  activeVersionId: string | null
  contrastRatio: number
  contrastWarning: boolean
  notice: FeedbackNotice
  exportStatus: ExportStatus
}

export const INITIAL_TOKENS: BrandTokens = {
  primary: '#F15A47',
  secondary: '#24324A',
  radiusScale: [8, 12, 18, 28],
  spacingScale: [4, 8, 12, 20, 32],
  typeScale: [12, 14, 16, 20, 28, 40],
}

export const THEME_PRESETS: Record<BrandTheme, { label: string; tokens: BrandTokens }> = {
  studio: {
    label: 'Studio warm',
    tokens: INITIAL_TOKENS,
  },
  editorial: {
    label: 'Editorial green',
    tokens: {
      primary: '#238B73', secondary: '#173C35', radiusScale: [4, 8, 12, 18], spacingScale: [4, 8, 16, 24, 40], typeScale: [12, 14, 16, 22, 30, 44],
    },
  },
  night: {
    label: 'Night signal',
    tokens: {
      primary: '#A98BFF', secondary: '#191829', radiusScale: [6, 10, 14, 22], spacingScale: [4, 8, 12, 18, 28], typeScale: [12, 14, 16, 20, 28, 38],
    },
  },
}
