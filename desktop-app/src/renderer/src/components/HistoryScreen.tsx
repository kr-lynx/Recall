import { useState, useEffect, useMemo } from 'react'
import type { RecordingMeta } from '../lib/types.d'

interface Props {
  onBack:       () => void
  onOpen:       (id: string) => void
  onTranscribe: (id: string) => void
  notice?:      string | null
}

interface Line { speaker: string; time: string; text: string; isMe: boolean }

function parseTranscript(markdown: string): Line[] {
  return markdown
    .split('\n')
    .map((line) => {
      const m = line.match(/\*\*(.+?)\*\*\s*\((.+?)\):\s*(.+)/)
      if (!m) return null
      const [, speaker, time, text] = m
      return { speaker, time, text, isMe: speaker === 'Me' }
    })
    .filter((l): l is Line => l !== null)
}

function fmtDuration(ms: number): string {
  const total = Math.floor(ms / 1000)
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60).toString().padStart(2, '0')
  const s = (total % 60).toString().padStart(2, '0')
  return h > 0 ? `${h}:${m}:${s}` : `${m}:${s}`
}

function fmtDate(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' })
}

export function HistoryScreen({ onBack, onOpen, onTranscribe, notice }: Props) {
  const [recordings, setRecordings] = useState<RecordingMeta[]>([])
  const [deleting,   setDeleting]   = useState<string | null>(null)
  const [query,      setQuery]      = useState('')
  const [allView,    setAllView]    = useState(false)
  const [copied,     setCopied]     = useState(false)

  useEffect(() => {
    window.api.listRecordings().then(setRecordings)
  }, [])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return recordings
    return recordings.filter((rec) => {
      const haystack = `${rec.title} ${rec.markdown ?? ''}`.toLowerCase()
      return haystack.includes(q)
    })
  }, [recordings, query])

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    setDeleting(id)
    await window.api.deleteRecording(id)
    setRecordings((prev) => prev.filter((r) => r.id !== id))
    setDeleting(null)
  }

  // ── Combined "all transcripts" view ──────────────────────────────────────
  const transcribed = useMemo(
    () => recordings.filter((r) => r.transcribed !== false && (r.markdown ?? '').trim()),
    [recordings]
  )

  const combinedMarkdown = useMemo(
    () => transcribed.map((r) => (r.markdown ?? '').trim()).join('\n\n\n'),
    [transcribed]
  )

  const handleCopyAll = async () => {
    await navigator.clipboard.writeText(combinedMarkdown)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleExportAll = async () => {
    const date = new Date().toISOString().slice(0, 10)
    const filePath = await window.api.openSaveDialog(`recall_all_transcripts_${date}.md`)
    if (filePath) await window.api.writeFile(filePath, combinedMarkdown)
  }

  if (allView) {
    return (
      <div className="flex flex-col h-full animate-fade-in">
        {/* Header */}
        <div className="flex-shrink-0 px-5 py-4 border-b border-border flex items-center gap-3">
          <button
            onClick={() => setAllView(false)}
            aria-label="Back to list"
            className="no-drag p-1.5 rounded-lg hover:bg-muted transition-colors cursor-pointer"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 12H5M12 5l-7 7 7 7"/>
            </svg>
          </button>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold">All Transcripts</p>
            <p className="text-xs text-fg/40">
              {transcribed.length} transcribed session{transcribed.length !== 1 ? 's' : ''}
            </p>
          </div>
          {transcribed.length > 0 && (
            <div className="flex items-center gap-2 flex-shrink-0">
              <button
                onClick={handleCopyAll}
                className="no-drag text-xs font-medium px-3 py-1.5 rounded-lg bg-muted hover:bg-border border border-border transition-colors cursor-pointer"
              >
                {copied ? 'Copied!' : 'Copy all'}
              </button>
              <button
                onClick={handleExportAll}
                className="no-drag text-xs font-semibold px-3 py-1.5 rounded-lg bg-accent hover:bg-accent/90 text-white transition-colors cursor-pointer"
              >
                Export .md
              </button>
            </div>
          )}
        </div>

        {/* All transcripts, stacked */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {transcribed.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full gap-3 text-fg/30">
              <p className="text-sm">No transcripts yet</p>
            </div>
          ) : (
            <div className="space-y-8 max-w-2xl mx-auto">
              {transcribed.map((rec) => {
                const lines = parseTranscript(rec.markdown ?? '')
                return (
                  <section key={rec.id}>
                    <div className="sticky top-0 -mx-6 px-6 py-2 bg-bg/90 backdrop-blur-sm border-b border-border/60 mb-3">
                      <p className="text-sm font-semibold truncate">{rec.title || 'Untitled'}</p>
                      <p className="text-xs text-fg/40">{fmtDate(rec.date)} · {fmtDuration(rec.durationMs)}</p>
                    </div>
                    {lines.length > 0 ? (
                      <div className="space-y-2.5">
                        {lines.map((line, i) => (
                          <div key={i} className={`flex gap-3 ${line.isMe ? 'flex-row-reverse' : ''}`}>
                            <div className={`max-w-[80%] rounded-xl px-3.5 py-2 text-xs leading-snug ${
                              line.isMe
                                ? 'bg-accent/15 text-accent border border-accent/20'
                                : 'bg-muted border border-border'
                            }`}>
                              <p className="text-fg/90">{line.text}</p>
                              <p className={`text-[10px] mt-1 ${line.isMe ? 'text-accent/60 text-right' : 'text-fg/30'}`}>
                                {line.time}
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-fg/40 text-xs whitespace-pre-wrap">{(rec.markdown ?? '').trim()}</p>
                    )}
                  </section>
                )
              })}
            </div>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full animate-fade-in">

      {/* Header */}
      <div className="flex-shrink-0 px-5 py-4 border-b border-border flex items-center gap-3">
        <button
          onClick={onBack}
          aria-label="Back"
          className="no-drag p-1.5 rounded-lg hover:bg-muted transition-colors cursor-pointer"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 12H5M12 5l-7 7 7 7"/>
          </svg>
        </button>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold">Past Sessions</p>
          <p className="text-xs text-fg/40">
            {query.trim()
              ? `${filtered.length} of ${recordings.length} recording${recordings.length !== 1 ? 's' : ''}`
              : `${recordings.length} recording${recordings.length !== 1 ? 's' : ''}`}
          </p>
        </div>
        {transcribed.length > 0 && (
          <button
            onClick={() => setAllView(true)}
            className="no-drag flex items-center gap-1.5 text-xs font-semibold text-accent
                       px-3 py-1.5 rounded-lg bg-accent/10 hover:bg-accent/20 transition-colors cursor-pointer flex-shrink-0"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/>
              <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>
            </svg>
            All transcripts
          </button>
        )}
      </div>

      {/* Notice (e.g. transcription failed → recording saved) */}
      {notice && (
        <div className="flex-shrink-0 mx-5 mt-3 px-3.5 py-2.5 rounded-xl bg-destructive/10 border border-destructive/30">
          <p className="text-xs text-destructive leading-snug">{notice}</p>
        </div>
      )}

      {/* Search */}
      {recordings.length > 0 && (
        <div className="flex-shrink-0 px-5 py-3 border-b border-border">
          <div className="relative">
            <svg
              className="absolute left-3.5 top-1/2 -translate-y-1/2 text-fg/30 pointer-events-none"
              width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
            >
              <circle cx="11" cy="11" r="8"/>
              <line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by words…"
              className="no-drag w-full bg-muted border border-border rounded-xl pl-10 pr-4 py-2.5 text-sm
                         text-fg placeholder-fg/30 outline-none focus:border-accent/60
                         transition-colors duration-150"
            />
          </div>
        </div>
      )}

      {/* List */}
      <div className="flex-1 overflow-y-auto py-2">
        {recordings.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-fg/30">
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z"/>
              <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
              <line x1="12" y1="19" x2="12" y2="22"/>
            </svg>
            <p className="text-sm">No recordings yet</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-fg/30 px-8 text-center">
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8"/>
              <line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
            <p className="text-sm">No results for “{query.trim()}”</p>
          </div>
        ) : (
          filtered.map((rec) => {
            const needsTranscribe = rec.transcribed === false
            return (
            <button
              key={rec.id}
              onClick={() => (needsTranscribe ? onTranscribe(rec.id) : onOpen(rec.id))}
              className="no-drag w-full text-left px-5 py-3.5 border-b border-border/50
                         hover:bg-muted/60 transition-colors duration-100 flex items-center gap-4 cursor-pointer"
            >
              {/* Icon */}
              <div className="w-9 h-9 rounded-xl bg-accent/10 border border-accent/20 flex items-center justify-center flex-shrink-0">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#5AAAD7" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z"/>
                  <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
                </svg>
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{rec.title || 'Untitled'}</p>
                <p className="text-xs text-fg/40 mt-0.5 flex items-center gap-1.5">
                  <span>{fmtDate(rec.date)} · {fmtDuration(rec.durationMs)}</span>
                  {needsTranscribe && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-accent/15 text-accent font-medium">
                      Not transcribed
                    </span>
                  )}
                </p>
              </div>

              {/* Transcribe (only when not yet transcribed) */}
              {needsTranscribe && (
                <span
                  className="no-drag flex items-center gap-1.5 text-xs font-semibold text-accent
                             px-2.5 py-1.5 rounded-lg bg-accent/10 hover:bg-accent/20
                             transition-colors duration-150 flex-shrink-0"
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/>
                    <path d="M3 3v5h5"/>
                  </svg>
                  Transcribe
                </span>
              )}

              {/* Delete */}
              <button
                onClick={(e) => handleDelete(rec.id, e)}
                disabled={deleting === rec.id}
                aria-label="Delete"
                className="no-drag p-1.5 rounded-lg text-fg/30 hover:text-destructive hover:bg-destructive/10
                           transition-colors duration-150 flex-shrink-0 cursor-pointer"
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="3 6 5 6 21 6"/>
                  <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
                  <path d="M10 11v6M14 11v6"/>
                  <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
                </svg>
              </button>
            </button>
            )
          })
        )}
      </div>
    </div>
  )
}
