import type { BrandMirrorViewModel } from '../viewmodels/brandMirrorViewModel'
import { useBrandMirrorViewModel } from '../hooks/useBrandMirrorViewModel'
import { ComponentGallery } from '../preview-gallery/ComponentGallery'
import { PageGallery } from '../preview-gallery/PageGallery'
import { TokenControls } from '../token-editor/TokenControls'
import { TokenExplorer } from '../token-search/TokenExplorer'
import { VersionCompare } from '../versioning/VersionCompare'
import type { NoticeTone } from '../models/brandMirrorModels'

const SAVE_LABEL: Record<'safe' | 'failed', string> = {
  safe: '所有更改已保存',
  failed: '本地保存失败',
}

const TOAST_ICON: Record<NoticeTone, string> = {
  info: '✦',
  success: '✓',
  error: '!',
}

export function BrandMirrorPage({ viewModel }: { viewModel: BrandMirrorViewModel }) {
  const snapshot = useBrandMirrorViewModel(viewModel)
  const saveFailed = snapshot.status === 'error'
  const notice = snapshot.notice
  return <div className="app-shell"><header className="topbar"><div className="brand-lockup"><span className="brand-mark">✦</span><span>BrandMirror</span><span className="brand-subtitle">品牌视觉实验室</span></div><div className="topbar-right"><span className={`save-state${saveFailed ? ' is-error' : ''}`} title={saveFailed ? notice.message : '更改已自动保存到本地工作区'}><span className="live-dot" />{saveFailed ? SAVE_LABEL.failed : SAVE_LABEL.safe}</span><span className="avatar-small">M</span></div></header><main className="workspace"><div><TokenControls snapshot={snapshot} onThemeChange={(theme) => viewModel.selectTheme(theme)} onColorChange={(field, value) => viewModel.updateColor(field, value)} onScaleChange={(field, index, value) => viewModel.updateScale(field, index, value)} onReset={() => viewModel.reset()} /><TokenExplorer tokens={snapshot.tokens} /></div><div className="preview-area"><div className="hero-heading"><div><span className="eyebrow">BRAND SYSTEM / 2024</span><h1>一套令牌，<em>无限可能。</em></h1><p>调整左侧令牌，观察它们如何在不同组件和页面中保持一致。</p></div><div className={`feedback-toast tone-${notice.tone}`} role="status"><span className="toast-icon">{TOAST_ICON[notice.tone]}</span><span><strong>{notice.message || '准备开始探索'}</strong>{notice.detail ? <small>{notice.detail}</small> : null}</span></div></div><ComponentGallery tokens={snapshot.tokens} /><PageGallery tokens={snapshot.tokens} /><VersionCompare snapshot={snapshot} onSave={() => viewModel.saveVersion()} onToggle={() => viewModel.toggleCompare()} onExport={() => viewModel.exportBrandGuidelines()} /></div></main><footer className="bottom-status"><span><span className="live-dot" />已连接到本地工作区</span><span>BrandMirror v0.1 <span className="footer-sep">·</span> 本地优先</span></footer></div>
}
