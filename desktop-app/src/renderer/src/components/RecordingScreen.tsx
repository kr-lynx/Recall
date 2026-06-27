import { useEffect, useRef } from 'react'

interface Props {
  durationMs: number
  analyser:   AnalyserNode | null
  onStop:     () => void
}

function fmt(ms: number) {
  const total = Math.floor(ms / 1000)
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60).toString().padStart(2, '0')
  const s = (total % 60).toString().padStart(2, '0')
  return h > 0 ? `${h}:${m}:${s}` : `${m}:${s}`
}

export function RecordingScreen({ durationMs, analyser, onStop }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const animRef   = useRef<number>(0)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')!
    const W = canvas.width
    const H = canvas.height
    const BAR_COUNT = 28
    const barW = 3
    const gap = (W - BAR_COUNT * barW) / (BAR_COUNT + 1)

    const dataArr = analyser ? new Uint8Array(analyser.frequencyBinCount) : null
    let frame = 0

    const draw = () => {
      ctx.clearRect(0, 0, W, H)

      let amplitudes: number[]
      if (analyser && dataArr) {
        analyser.getByteFrequencyData(dataArr)
        // Map FFT bins to BAR_COUNT bars (use lower half of spectrum = voice range)
        const usable = Math.floor(dataArr.length * 0.6)
        amplitudes = Array.from({ length: BAR_COUNT }, (_, i) => {
          const idx = Math.floor((i / BAR_COUNT) * usable)
          return dataArr[idx] / 255
        })
      } else {
        // Fallback idle animation
        amplitudes = Array.from({ length: BAR_COUNT }, (_, i) => {
          const t = frame * 0.04 + i * 0.4
          return (Math.sin(t) * 0.5 + 0.5) * 0.7 + 0.15
        })
      }

      for (let i = 0; i < BAR_COUNT; i++) {
        const amp = amplitudes[i]
        const x   = gap + i * (barW + gap)
        const bh  = Math.max(4, H * amp)
        const y   = (H - bh) / 2
        ctx.fillStyle = `rgba(90,170,215,${0.4 + amp * 0.5})`
        ctx.beginPath()
        ctx.roundRect(x, y, barW, bh, 2)
        ctx.fill()
      }
      frame++
      animRef.current = requestAnimationFrame(draw)
    }

    draw()
    return () => cancelAnimationFrame(animRef.current)
  }, [analyser])

  return (
    <div className="flex flex-col h-full items-center justify-center gap-10 animate-fade-in">

      {/* Recording badge */}
      <div className="flex items-center gap-2">
        <span className="w-2 h-2 rounded-full bg-destructive animate-pulse" />
        <span className="text-xs uppercase tracking-widest text-fg/50 font-mono">Recording</span>
      </div>

      {/* Timer */}
      <p className="font-mono text-6xl font-bold tracking-tight tabular-nums">
        {fmt(durationMs)}
      </p>

      {/* Waveform */}
      <canvas
        ref={canvasRef}
        width={260}
        height={60}
        className="opacity-80"
      />

      {/* Stop button */}
      <button
        onClick={onStop}
        aria-label="Stop recording"
        className="no-drag w-16 h-16 rounded-full bg-muted border border-border
                   hover:border-destructive/60 hover:bg-destructive/10
                   flex items-center justify-center
                   transition-all duration-150 active:scale-95 cursor-pointer"
      >
        {/* Stop square icon */}
        <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
          <rect x="4" y="4" width="16" height="16" rx="2"/>
        </svg>
      </button>

      <p className="text-xs text-fg/25">Click to stop and transcribe</p>
    </div>
  )
}
