import { useState } from 'react'
import type { TranscribeResult } from '../App'

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

interface Props {
  result:      TranscribeResult
  title:       string
  durationMs?: number
  onReset:     () => void
  onBack?:     () => void
}

function fmtDuration(ms: number): string {
  const total = Math.floor(ms / 1000)
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60).toString().padStart(2, '0')
  const s = (total % 60).toString().padStart(2, '0')
  return h > 0 ? `${h}:${m}:${s}` : `${m}:${s}`
}

export function ResultScreen({ result, title, durationMs, onReset, onBack }: Props) {
  const [copied, setCopied] = useState(false)
  const [saved,  setSaved]  = useState(false)
  const lines = parseTranscript(result.markdown)

  const handleCopy = async () => {
    await navigator.clipboard.writeText(result.markdown)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleSave = async () => {
    const date = new Date().toISOString().slice(0, 10)
    const safe = (title || 'interview').replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '_').slice(0, 40)
    const defaultName = `interview_${date}_${safe}.md`
    const filePath = await window.api.openSaveDialog(defaultName)
    if (filePath) {
      await window.api.writeFile(filePath, result.markdown)
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    }
  }

  return (
    <div className="flex flex-col h-full animate-slide-up">

      {/* Header */}
      <div className="flex-shrink-0 px-6 py-4 border-b border-border flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold truncate max-w-[180px]">{title || 'Interview'}</p>
          <p className="text-xs text-fg/40">
            {durationMs ? fmtDuration(durationMs) + ' · ' : ''}Transcript ready
          </p>
        </div>
        <div className="flex items-center gap-2">
          {onBack && (
            <button
              onClick={onBack}
              aria-label="Back to history"
              className="no-drag p-1.5 rounded-lg text-fg/40 hover:text-fg hover:bg-muted
                         transition-colors duration-150 cursor-pointer"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M19 12H5M12 5l-7 7 7 7"/>
              </svg>
            </button>
          )}
          <button
            onClick={onReset}
            aria-label="New recording"
            className="no-drag flex items-center gap-1.5 text-xs text-fg/50 hover:text-fg
                       transition-colors duration-150 cursor-pointer"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/>
              <path d="M3 3v5h5"/>
            </svg>
            New
          </button>
        </div>
      </div>

      {/* Full transcript */}
      <div className="flex-1 overflow-y-auto px-6 py-4 text-sm leading-relaxed">
        {lines.length > 0 ? (
          <div className="space-y-3">
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
          <p className="text-fg/30 text-center mt-8 whitespace-pre-wrap">{result.markdown}</p>
        )}
      </div>

      {/* Actions */}
      <div className="flex-shrink-0 px-6 py-4 border-t border-border flex gap-3">
        <button
          onClick={handleSave}
          className="no-drag flex-1 py-2.5 bg-accent hover:bg-accent/90 text-white
                     text-sm font-semibold rounded-xl transition-colors duration-150 cursor-pointer"
        >
          {saved ? 'Saved!' : 'Save .md'}
        </button>
        <button
          onClick={handleCopy}
          className="no-drag px-5 py-2.5 bg-muted hover:bg-border border border-border
                     text-sm font-medium rounded-xl transition-colors duration-150 cursor-pointer"
        >
          {copied ? 'Copied!' : 'Copy'}
        </button>
      </div>
    </div>
  )
}
