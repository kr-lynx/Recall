import { useState, useEffect } from 'react'

type Model = {
  id: string
  name: string
  size: string
  quality: string
  downloaded: boolean
  recommended?: boolean
  engine: 'whisper' | 'sherpa'
}

export function ModelsScreen() {
  const [models, setModels]     = useState<Model[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [busy, setBusy]         = useState<string | null>(null)
  const [prog, setProg]         = useState(0)
  const [stage, setStage]       = useState('')

  const refresh = () => {
    window.api.getModels().then((ms: Model[]) => setModels(ms))
    window.api.getActiveModelId().then(setActiveId)
  }

  useEffect(() => {
    refresh()
    const offProg = window.api.onDownloadProgress((d) => {
      setProg(d.progress)
      if (d.stage) setStage(d.stage)
    })
    const offModels = window.api.onModelsChanged(() => refresh())
    return () => { offProg(); offModels() }
  }, [])

  const download = async (id: string) => {
    setBusy(id); setProg(0); setStage('starting')
    await window.api.downloadModel(id)
    setBusy(null); setStage('')
    refresh()
  }

  const use = async (id: string) => {
    await window.api.setActiveModel(id)
    refresh()
  }

  const del = async (m: Model) => {
    const ok = window.confirm(`Delete “${m.name}”? You can download it again later.`)
    if (!ok) return
    setBusy(m.id)
    await window.api.deleteModel(m.id)
    setBusy(null)
    refresh()
  }

  const whisperModels = models.filter((m) => m.engine === 'whisper')
  const sherpaModels  = models.filter((m) => m.engine === 'sherpa')

  const isActive = (m: Model) => activeId === m.id

  const stageLabel: Record<string, string> = {
    starting: 'Starting…',
    downloading: `${prog}%`,
    extracting: 'Extracting…',
    done: 'Done',
    error: 'Error',
  }

  const ModelCard = ({ m }: { m: Model }) => (
    <div
      className={`rounded-2xl border p-4 transition-colors ${
        isActive(m) ? 'border-accent bg-accent/5' : 'border-border bg-muted/40'
      }`}
    >
      <div className="flex items-center gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-semibold">{m.name}</p>
            {isActive(m) && (
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-accent text-white font-medium">Active</span>
            )}
            {m.recommended && !isActive(m) && (
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-accent/15 text-accent font-medium">Recommended</span>
            )}
          </div>
          <p className="text-xs text-fg/40 mt-1">{m.quality} · {m.size}</p>
        </div>

        {m.downloaded ? (
          <div className="flex items-center gap-1.5 shrink-0">
            {isActive(m) ? (
              <span className="text-xs text-fg/40 flex items-center gap-1.5">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                In use
              </span>
            ) : (
              <button
                onClick={() => use(m.id)}
                className="no-drag text-xs font-semibold text-accent px-3 py-1.5 rounded-lg bg-accent/10 hover:bg-accent/20 transition-colors cursor-pointer"
              >
                Use
              </button>
            )}
            <button
              onClick={() => del(m)}
              disabled={busy === m.id}
              aria-label="Delete model"
              title="Delete model"
              className="no-drag p-1.5 rounded-lg text-fg/30 hover:text-destructive hover:bg-destructive/10 transition-colors cursor-pointer disabled:opacity-40"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="3 6 5 6 21 6"/>
                <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
                <path d="M10 11v6M14 11v6"/>
                <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
              </svg>
            </button>
          </div>
        ) : busy === m.id ? (
          <div className="w-28 flex flex-col items-end gap-1 shrink-0">
            <div className="w-full h-1.5 rounded-full bg-border overflow-hidden">
              <div
                className="h-full bg-accent transition-all"
                style={{ width: stage === 'extracting' ? '99%' : `${prog}%` }}
              />
            </div>
            <span className="text-[10px] text-fg/40">{stageLabel[stage] ?? `${prog}%`}</span>
          </div>
        ) : (
          <button
            onClick={() => download(m.id)}
            disabled={!!busy}
            className="no-drag text-xs font-semibold text-accent px-3 py-1.5 rounded-lg bg-accent/10 hover:bg-accent/20 transition-colors cursor-pointer disabled:opacity-40 shrink-0"
          >
            Download
          </button>
        )}
      </div>
    </div>
  )

  return (
    <div className="h-full overflow-y-auto px-8 py-7 animate-fade-in">
      <h1 className="text-2xl font-bold tracking-tight">Transcription Models</h1>
      <p className="text-sm text-fg/50 mt-1.5 mb-7 max-w-lg">
        Choose a model or download more. Models are stored locally — no internet needed for transcription.
      </p>

      {/* Whisper section */}
      <section className="mb-8 max-w-2xl">
        <div className="flex items-center gap-2 mb-3">
          <h2 className="text-xs font-semibold text-fg/40 uppercase tracking-widest">Whisper (OpenAI)</h2>
          <div className="flex-1 h-px bg-border" />
        </div>
        <div className="space-y-3">
          {whisperModels.map((m) => <ModelCard key={m.id} m={m} />)}
        </div>
      </section>

      {/* Sherpa section */}
      <section className="max-w-2xl">
        <div className="flex items-center gap-2 mb-3">
          <h2 className="text-xs font-semibold text-fg/40 uppercase tracking-widest">Alternative (sherpa-onnx)</h2>
          <div className="flex-1 h-px bg-border" />
        </div>
        <p className="text-xs text-fg/40 mb-3">
          ONNX-based models — great for Russian, Chinese, and specialised use-cases.
        </p>
        <div className="space-y-3">
          {sherpaModels.map((m) => <ModelCard key={m.id} m={m} />)}
        </div>
      </section>

      {models.length === 0 && <p className="text-sm text-fg/30 mt-4">Loading models…</p>}
    </div>
  )
}
