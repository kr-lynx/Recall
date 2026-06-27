import { useState, useEffect } from 'react'

interface ModelInfo {
  id: string
  name: string
  size: string
  quality: string
  downloaded: boolean
  recommended?: boolean
}

interface Props {
  modelOk: boolean
  whisperOk: boolean
  onDone: () => void
}

export function SetupScreen({ whisperOk, onDone }: Props) {
  const [models,      setModels]      = useState<ModelInfo[]>([])
  const [selected,    setSelected]    = useState<string>('ggml-large-v3-turbo')
  const [downloading, setDownloading] = useState(false)
  const [dlProgress,  setDlProgress]  = useState(0)
  const [dlStage,     setDlStage]     = useState('')
  const [error,       setError]       = useState('')

  useEffect(() => {
    window.api.getModels().then((ms) => {
      setModels(ms)
      // auto-select first already-downloaded, or default
      const downloaded = ms.find((m) => m.downloaded)
      if (downloaded) setSelected(downloaded.id)
    })
  }, [])

  useEffect(() => {
    const off = window.api.onDownloadProgress((data) => {
      setDlProgress(data.progress)
      setDlStage(data.stage)
      if (data.stage === 'done') {
        setDownloading(false)
        onDone()
      }
      if (data.stage === 'error') {
        setDownloading(false)
        setError('Download failed. Check internet and try again.')
      }
    })
    return off
  }, [onDone])

  const selectedModel = models.find((m) => m.id === selected)
  const alreadyDownloaded = selectedModel?.downloaded

  const handleAction = async () => {
    if (alreadyDownloaded) { onDone(); return }
    setError('')
    setDownloading(true)
    await window.api.downloadModel(selected)
  }

  return (
    <div className="flex flex-col h-screen bg-bg text-fg">
      <div className="drag h-9 flex-shrink-0" />

      <div className="flex-1 overflow-y-auto px-6 py-4">
        <div className="min-h-full flex flex-col items-center justify-center gap-6 animate-slide-up">

          {/* Header */}
          <div className="text-center">
            <p className="text-2xl font-semibold tracking-tight">Setup</p>
            <p className="text-xs text-fg/40 mt-1">One-time setup to enable transcription</p>
          </div>

          <div className="w-full max-w-xs space-y-3">
            {/* whisper-cli status */}
            <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-muted border border-border">
              <span className={`w-2 h-2 rounded-full flex-shrink-0 ${whisperOk ? 'bg-success' : 'bg-destructive'}`} />
              <div>
                <p className="text-sm font-medium">whisper-cli</p>
                <p className="text-xs text-fg/40">
                  {whisperOk ? 'Installed' : 'Run: brew install whisper-cpp'}
                </p>
              </div>
            </div>

            {/* Model selection */}
            <p className="text-xs text-fg/50 font-medium pt-1">Choose model</p>
            {models.map((m) => (
              <button
                key={m.id}
                onClick={() => !downloading && setSelected(m.id)}
                disabled={!whisperOk || downloading}
                className={`no-drag w-full text-left px-4 py-3 rounded-xl border transition-all duration-150 cursor-pointer
                  ${selected === m.id
                    ? 'border-accent/60 bg-accent/5'
                    : 'border-border bg-muted hover:border-border/80'}
                  ${(!whisperOk || downloading) ? 'opacity-50 cursor-default' : ''}`}
              >
                <div className="flex items-start gap-3">
                  <div className={`mt-0.5 w-4 h-4 rounded-full border-2 flex-shrink-0 flex items-center justify-center transition-colors
                    ${selected === m.id ? 'border-accent' : 'border-fg/30'}`}>
                    {selected === m.id && <div className="w-2 h-2 rounded-full bg-accent" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium">{m.name}</p>
                      {m.recommended && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-accent/20 text-accent font-medium">
                          recommended
                        </span>
                      )}
                      {m.downloaded && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-success/20 text-success font-medium">
                          ready
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-fg/40 mt-0.5">{m.size} · {m.quality}</p>
                  </div>
                </div>
              </button>
            ))}
          </div>

          {/* Progress */}
          {downloading && (
            <div className="w-full max-w-xs space-y-2 animate-fade-in">
              <div className="flex justify-between text-xs text-fg/40">
                <span className="capitalize">{dlStage.replace(/-/g, ' ')}</span>
                <span>{dlProgress}%</span>
              </div>
              <div className="h-1 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full bg-accent rounded-full transition-all duration-300"
                  style={{ width: `${dlProgress}%` }}
                />
              </div>
            </div>
          )}

          {error && <p className="text-xs text-destructive text-center max-w-xs">{error}</p>}

          {/* CTA */}
          {whisperOk && !downloading && (
            <button
              onClick={handleAction}
              className="no-drag w-full max-w-xs py-3 bg-accent hover:bg-accent/90 text-white
                         font-semibold rounded-xl transition-colors duration-150 cursor-pointer text-sm"
            >
              {alreadyDownloaded ? 'Use this model →' : `Download ${selectedModel?.size ?? ''}`}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
