import { useState, useRef, useCallback } from 'react'

export type RecorderState = 'idle' | 'requesting' | 'recording' | 'stopped'

export interface RecorderResult {
  state: RecorderState
  durationMs: number
  audioBlob: Blob | null
  analyser: AnalyserNode | null
  start: (title: string, micId?: string, systemDeviceId?: string) => Promise<void>
  stop: () => void
  reset: () => void
  error: string | null
}

export function useRecorder(): RecorderResult {
  const [state, setState] = useState<RecorderState>('idle')
  const [durationMs, setDurationMs] = useState(0)
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null)
  const [error, setError] = useState<string | null>(null)

  const recorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const audioCtxRef = useRef<AudioContext | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const [analyser, setAnalyser] = useState<AnalyserNode | null>(null)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const startTimeRef = useRef<number>(0)
  const streamsRef = useRef<MediaStream[]>([])

  // Stop every captured track so the OS releases the mic and clears the macOS
  // "screen is being recorded" indicator left by the system-audio capture.
  const stopStreams = useCallback(() => {
    streamsRef.current.forEach((s) => s.getTracks().forEach((t) => t.stop()))
    streamsRef.current = []
  }, [])

  const stop = useCallback(() => {
    if (recorderRef.current && recorderRef.current.state !== 'inactive') {
      recorderRef.current.stop()
    }
    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
    stopStreams()
  }, [stopStreams])

  const reset = useCallback(() => {
    stop()
    audioCtxRef.current?.close()
    audioCtxRef.current = null
    analyserRef.current = null
    setAnalyser(null)
    recorderRef.current = null
    chunksRef.current = []
    setState('idle')
    setDurationMs(0)
    setAudioBlob(null)
    setError(null)
  }, [stop])

  const start = useCallback(async (_title: string, micId?: string, systemDeviceId?: string) => {
    setError(null)
    setState('requesting')
    chunksRef.current = []

    try {
      // 1. System audio — the other side of the call.
      //    • A manual input device (e.g. BlackHole) picked in Settings → getUserMedia.
      //    • Otherwise, macOS captures it natively in the main process (ScreenCaptureKit)
      //      and merges it on save, so there's nothing to do in the renderer here.
      //    • Windows/Linux fall back to getDisplayMedia loopback.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const isMac = (window as any).electron?.process?.platform === 'darwin'
      let systemStream: MediaStream | null = null
      try {
        if (systemDeviceId) {
          systemStream = await navigator.mediaDevices.getUserMedia({
            audio: {
              deviceId: { exact: systemDeviceId },
              echoCancellation: false,
              noiseSuppression: false,
              autoGainControl: false
            }
          })
        } else if (!isMac) {
          const display = await navigator.mediaDevices.getDisplayMedia({
            audio: true,
            video: true,
            // @ts-ignore - systemAudio is a valid constraint, missing from lib.dom
            systemAudio: 'include'
          })
          display.getVideoTracks().forEach((t) => {
            t.stop()
            display.removeTrack(t)
          })
          if (display.getAudioTracks().length > 0) systemStream = display
        }
      } catch (e) {
        // Device missing / picker dismissed / platform can't capture system audio →
        // fall back to mic-only rather than failing the whole recording.
        console.warn('[recall] System audio unavailable, recording mic only:', e)
      }

      // 2. Mic stream (optionally a specific input device)
      const micStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          deviceId: micId ? { exact: micId } : undefined,
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false
        }
      })

      streamsRef.current = systemStream ? [systemStream, micStream] : [micStream]

      // 3. Mix into stereo: system audio (L), mic (R)
      const ctx = new AudioContext()
      audioCtxRef.current = ctx
      const dest = ctx.createMediaStreamDestination()
      const merger = ctx.createChannelMerger(2)

      if (systemStream) {
        const sysSource = ctx.createMediaStreamSource(systemStream)
        sysSource.connect(merger, 0, 0) // system → L
      }

      const micSource = ctx.createMediaStreamSource(micStream)
      micSource.connect(merger, 0, 1) // mic → R

      // Note: we don't monitor systemStream back to ctx.destination — the user already
      // hears the call natively, and re-playing the loopback would create an echo loop.

      const analyserNode = ctx.createAnalyser()
      analyserNode.fftSize = 64
      merger.connect(analyserNode)
      analyserNode.connect(dest)
      analyserRef.current = analyserNode
      setAnalyser(analyserNode)

      // 4. Record
      const recorder = new MediaRecorder(dest.stream, {
        mimeType: 'audio/webm;codecs=opus'
      })
      recorderRef.current = recorder

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data)
      }

      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' })
        setAudioBlob(blob)
        setState('stopped')
        audioCtxRef.current?.close()
        audioCtxRef.current = null
      }

      recorder.start(1000) // collect chunks every second
      setState('recording')

      startTimeRef.current = Date.now()
      timerRef.current = setInterval(() => {
        setDurationMs(Date.now() - startTimeRef.current)
      }, 500)
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      setError(msg)
      setState('idle')
    }
  }, [])

  return { state, durationMs, audioBlob, analyser, start, stop, reset, error }
}
