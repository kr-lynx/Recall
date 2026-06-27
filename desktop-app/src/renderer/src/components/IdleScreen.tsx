import { COMMON_LANGUAGES, ALL_LANGUAGES } from '../lib/languages'

interface Props {
  title:       string
  setTitle:    (v: string) => void
  language:    string
  setLanguage: (v: string) => void
  onStart:     () => Promise<void>
  onHistory:   () => void
  error:       string | null
}



export function IdleScreen({ title, setTitle, language, setLanguage, onStart, onHistory, error }: Props) {
  return (
    <div className="flex flex-col h-full items-center justify-center px-8 gap-10 animate-slide-up relative">

      {/* Header */}
      <div className="text-center">
        <p className="text-xs uppercase tracking-[0.2em] text-accent/70 font-semibold mb-2">Recall</p>
        <h1 className="text-4xl font-bold tracking-tight">Ready to record</h1>
      </div>

      {/* Form */}
      <div className="w-full max-w-xs space-y-3">
        <div>
          <label htmlFor="title" className="block text-xs text-fg/50 mb-1.5 font-medium">
            Session title
          </label>
          <input
            id="title"
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Company name / role"
            className="no-drag w-full bg-muted border border-border rounded-xl px-4 py-2.5 text-sm
                       text-fg placeholder-fg/30 outline-none focus:border-accent/60
                       transition-colors duration-150"
          />
        </div>

        <div>
          <label htmlFor="lang" className="block text-xs text-fg/50 mb-1.5 font-medium">
            Language
          </label>
          <select
            id="lang"
            value={language}
            onChange={(e) => setLanguage(e.target.value)}
            className="no-drag w-full bg-muted border border-border rounded-xl px-4 py-2.5 text-sm
                       text-fg outline-none focus:border-accent/60 transition-colors duration-150
                       cursor-pointer appearance-none"
          >
            <optgroup label="Common">
              {COMMON_LANGUAGES.map((l) => (
                <option key={l.value} value={l.value}>{l.label}</option>
              ))}
            </optgroup>
            <optgroup label="All languages">
              {ALL_LANGUAGES.map((l) => (
                <option key={l.value} value={l.value}>{l.label}</option>
              ))}
            </optgroup>
          </select>
        </div>
      </div>

      {/* Record button */}
      <div className="relative flex items-center justify-center no-drag">
        {/* Pulse ring */}
        <span className="absolute w-20 h-20 rounded-full bg-accent/20 animate-pulse-ring" />
        <button
          onClick={onStart}
          aria-label="Start recording"
          className="relative w-20 h-20 rounded-full bg-accent hover:bg-accent/90
                     flex items-center justify-center shadow-lg shadow-accent/30
                     transition-all duration-150 active:scale-95 cursor-pointer"
        >
          {/* Mic icon */}
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z"/>
            <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
            <line x1="12" y1="19" x2="12" y2="22"/>
            <line x1="8" y1="22" x2="16" y2="22"/>
          </svg>
        </button>
      </div>

      {error && (
        <p className="text-xs text-destructive text-center max-w-xs animate-fade-in">{error}</p>
      )}

      <p className="text-xs text-fg/25 text-center">
        Records system audio + microphone simultaneously
      </p>

      {/* History link */}
      <button
        onClick={onHistory}
        className="no-drag absolute bottom-5 right-5 flex items-center gap-1.5 text-xs text-fg/30
                   hover:text-fg/60 transition-colors duration-150 cursor-pointer"
      >
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10"/>
          <polyline points="12 6 12 12 16 14"/>
        </svg>
        History
      </button>
    </div>
  )
}
