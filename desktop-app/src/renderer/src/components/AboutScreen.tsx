import { useState, useEffect } from 'react'
import type { ReactNode } from 'react'
import { recallLogo } from '../lib/logo'

const REPO = 'https://github.com/kr-lynx/Recall'

export function AboutScreen() {
  const [version, setVersion] = useState('')
  const [userData, setUserData] = useState('')
  const [logDir, setLogDir] = useState('')

  useEffect(() => {
    window.api.getAppVersion().then(setVersion)
    window.api.getAppPaths().then((p) => setUserData(p.userData))
    window.api.getLogDir().then(setLogDir)
  }, [])

  const Row = ({ label, children }: { label: string; children: ReactNode }) => (
    <div className="flex items-center justify-between gap-4 px-4 py-3.5">
      <p className="text-sm font-medium flex-shrink-0">{label}</p>
      <div className="min-w-0 flex items-center gap-2">{children}</div>
    </div>
  )
  const OpenBtn = ({ onClick }: { onClick: () => void }) => (
    <button onClick={onClick} className="no-drag text-sm font-medium text-accent px-3 py-1.5 rounded-lg bg-accent/10 hover:bg-accent/20 transition-colors cursor-pointer flex-shrink-0">
      Open
    </button>
  )
  const pathCls = 'text-xs text-fg/40 truncate max-w-[260px] font-mono'

  return (
    <div className="h-full overflow-y-auto px-8 py-7 animate-fade-in">
      <div className="flex items-center gap-3 mb-6">
        <img src={recallLogo} alt="Recall" className="w-[40px] h-[40px] rounded-[9px]" />
        <div>
          <h1 className="text-2xl font-bold tracking-tight leading-none">Recall</h1>
          <p className="text-sm text-fg/40 mt-1">Record the call. Recall it all.</p>
        </div>
      </div>

      <div className="max-w-2xl space-y-7">
        <div className="rounded-2xl border border-border bg-muted/40 divide-y divide-border">
          <Row label="Version"><span className="text-sm text-fg/50">v{version || '…'}</span></Row>
          <Row label="Source code">
            <button onClick={() => window.api.openExternal(REPO)} className="no-drag text-sm font-medium text-accent px-3 py-1.5 rounded-lg bg-accent/10 hover:bg-accent/20 transition-colors cursor-pointer">
              View on GitHub
            </button>
          </Row>
          <Row label="App data"><span className={pathCls}>{userData}</span><OpenBtn onClick={() => window.api.openPath(userData)} /></Row>
          <Row label="Logs"><span className={pathCls}>{logDir}</span><OpenBtn onClick={() => window.api.openPath(logDir)} /></Row>
        </div>

        <div>
          <p className="text-[11px] uppercase tracking-[0.16em] text-fg/35 font-semibold mb-2.5 px-1">Acknowledgments</p>
          <div className="rounded-2xl border border-border bg-muted/40 px-4 py-3.5">
            <p className="text-sm font-medium">whisper.cpp</p>
            <p className="text-xs text-fg/40 mt-1 leading-relaxed">
              Recall uses whisper.cpp for fast, local speech-to-text. Thanks to Georgi Gerganov and contributors.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
