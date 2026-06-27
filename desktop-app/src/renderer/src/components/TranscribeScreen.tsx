const STAGES: Record<string, { label: string; step: number }> = {
  preparing:              { label: 'Preparing audio…',           step: 1 },
  splitting:              { label: 'Splitting channels…',        step: 2 },
  'transcribing-recruiter':{ label: 'Transcribing interviewer…', step: 3 },
  'transcribing-me':      { label: 'Transcribing your voice…',  step: 4 },
  building:               { label: 'Building transcript…',       step: 5 },
  done:                   { label: 'Done!',                      step: 6 },
}

interface Props {
  stage:    string
  progress: number
}

export function TranscribeScreen({ stage, progress }: Props) {
  const info = STAGES[stage] ?? { label: 'Processing…', step: 1 }

  return (
    <div className="flex flex-col h-full items-center justify-center gap-8 px-8 animate-fade-in">

      {/* Spinner */}
      <div className="relative w-16 h-16">
        <svg className="animate-spin w-16 h-16" viewBox="0 0 64 64" fill="none">
          <circle cx="32" cy="32" r="28" className="stroke-border" strokeWidth="4"/>
          <path
            d="M32 4a28 28 0 0 1 28 28"
            stroke="#5AAAD7"
            strokeWidth="4"
            strokeLinecap="round"
          />
        </svg>
        <span className="absolute inset-0 flex items-center justify-center font-mono text-sm font-medium">
          {progress}%
        </span>
      </div>

      <div className="text-center space-y-1">
        <p className="text-lg font-semibold">{info.label}</p>
        <p className="text-xs text-fg/40">
          {info.step <= 5 ? `Step ${info.step} of 5 · This may take a few minutes` : 'Finalizing…'}
        </p>
      </div>

      {/* Progress bar */}
      <div className="w-full max-w-xs">
        <div className="h-1 bg-muted rounded-full overflow-hidden">
          <div
            className="h-full bg-accent rounded-full transition-all duration-500 ease-out"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {/* Steps */}
      <div className="flex gap-2">
        {[1,2,3,4,5].map((n) => (
          <div
            key={n}
            className={`w-1.5 h-1.5 rounded-full transition-all duration-300 ${
              n < info.step  ? 'bg-accent' :
              n === info.step? 'bg-accent/60 scale-125' :
                               'bg-border'
            }`}
          />
        ))}
      </div>
    </div>
  )
}
