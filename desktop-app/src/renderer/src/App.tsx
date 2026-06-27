import { useState, useEffect } from 'react'
import { IdleScreen }        from './components/IdleScreen'
import { RecordingScreen }   from './components/RecordingScreen'
import { TranscribeScreen }  from './components/TranscribeScreen'
import { ResultScreen }      from './components/ResultScreen'
import { SetupScreen }       from './components/SetupScreen'
import { HistoryScreen }     from './components/HistoryScreen'
import { ModelsScreen }      from './components/ModelsScreen'
import { SettingsScreen }    from './components/SettingsScreen'
import { AboutScreen }       from './components/AboutScreen'
import { Sidebar }           from './components/Sidebar'
import type { Section }      from './components/Sidebar'
import { useRecorder }       from './lib/useRecorder'
import type { Recording }    from './lib/types.d'

export type Screen = 'idle' | 'recording' | 'transcribing' | 'result'

export interface TranscribeResult {
  markdown: string
  questions: string[]
}

export type Theme = 'dark' | 'light'

export default function App() {
  const [theme,     setTheme]     = useState<Theme>(() => (localStorage.getItem('theme') as Theme) || 'dark')
  const [section,   setSection]   = useState<Section>('record')
  const [screen,    setScreen]    = useState<Screen>('idle')
  const [title,     setTitle]     = useState('')
  const [language,  setLanguage]  = useState(() => localStorage.getItem('recall.defaultLanguage') || 'en')
  const [version,   setVersion]   = useState('')
  const [modelOk,   setModelOk]   = useState<boolean | null>(null)
  const [whisperOk, setWhisperOk] = useState<boolean | null>(null)
  const [transcribeProgress, setTranscribeProgress] = useState({ stage: '', progress: 0 })
  const [result,    setResult]    = useState<TranscribeResult | null>(null)
  const [transcribeError, setTranscribeError] = useState<string | null>(null)
  const [finalDurationMs, setFinalDurationMs] = useState(0)
  const [historyView, setHistoryView] = useState<Recording | null>(null)

  const recorder = useRecorder()

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    localStorage.setItem('theme', theme)
  }, [theme])

  useEffect(() => {
    window.api.checkModel().then(setModelOk)
    window.api.checkWhisper().then(setWhisperOk)
    window.api.getAppVersion().then(setVersion)
    window.api.initTray(localStorage.getItem('recall.tray') === '1')
  }, [])

  useEffect(() => {
    const off = window.api.onTranscribeProgress((data) =>
      setTranscribeProgress({ stage: data.stage, progress: data.progress })
    )
    return off
  }, [])

  useEffect(() => {
    const off = window.api.onNavigate((s) => setSection(s as Section))
    return off
  }, [])

  const handleStart = async () => {
    setTranscribeError(null)
    const micId = localStorage.getItem('recall.micId') || undefined
    const systemDeviceId = localStorage.getItem('recall.systemDeviceId') || undefined
    await recorder.start(title, micId, systemDeviceId)
    // No manual device override → capture system audio natively (macOS ScreenCaptureKit;
    // no-op on other platforms). The mic is recorded in the renderer; the two are merged
    // when the recording is saved.
    if (!systemDeviceId) await window.api.systemCaptureStart()
    setScreen('recording')
  }

  const handleStop = () => {
    setFinalDurationMs(recorder.durationMs)
    recorder.stop()
    setScreen('transcribing')
  }

  useEffect(() => {
    if (screen === 'transcribing' && recorder.audioBlob) transcribe(recorder.audioBlob)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screen, recorder.audioBlob])

  const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e))

  const transcribe = async (blob: Blob) => {
    const buffer = await blob.arrayBuffer()
    const date = new Date().toISOString().slice(0, 10)

    // 1. Persist raw audio + create record FIRST — safe even if transcription fails.
    let rec
    try {
      rec = await window.api.saveRecording(
        { title: title || 'Untitled', date, durationMs: finalDurationMs, language },
        buffer
      )
    } catch (e) {
      console.error(e)
      setTranscribeError(`Failed to save recording: ${errMsg(e)}`)
      setScreen('idle')
      return
    }
    recorder.reset() // audio is on disk now; release the in-memory blob

    // 1b. Merge the natively-captured system audio into the saved file (macOS; no-op on
    //     other platforms or when a manual device was used). Best-effort: a failure here
    //     just leaves a mic-only recording.
    try {
      await window.api.systemCaptureStop(rec.id)
    } catch (e) {
      console.warn('system audio merge failed:', e)
    }

    // 2. Transcribe by id. On failure the recording stays in History to retry.
    try {
      const res = await window.api.transcribeRecording(rec.id)
      setResult(res)
      setHistoryView(null)
      setScreen('result')
    } catch (e) {
      console.error(e)
      setTranscribeError(
        `Transcription failed — your recording is saved. Open History and tap “Transcribe” to retry. (${errMsg(e)})`
      )
      setScreen('idle')
      setSection('history')
    }
  }

  const handleTranscribeFromHistory = async (id: string) => {
    setTranscribeError(null)
    setSection('record')
    setScreen('transcribing')
    try {
      const res = await window.api.transcribeRecording(id)
      const rec = await window.api.getRecording(id)
      setHistoryView(rec)
      setResult(res)
      setScreen('result')
    } catch (e) {
      console.error(e)
      setScreen('idle')
      setTranscribeError(`Transcription failed: ${errMsg(e)}`)
      setSection('history')
    }
  }

  const handleReset = () => {
    recorder.reset()
    setResult(null)
    setHistoryView(null)
    setTranscribeProgress({ stage: '', progress: 0 })
    setFinalDurationMs(0)
    setScreen('idle')
    setSection('record')
  }

  const handleOpenFromHistory = async (id: string) => {
    const rec = await window.api.getRecording(id)
    if (!rec) return
    setHistoryView(rec)
    setSection('record')
    setScreen('result')
  }

  if (modelOk === false || whisperOk === false) {
    return (
      <SetupScreen
        modelOk={modelOk ?? false}
        whisperOk={whisperOk ?? false}
        onDone={() => {
          window.api.checkModel().then(setModelOk)
          window.api.checkWhisper().then(setWhisperOk)
        }}
      />
    )
  }

  const recordFlow = (
    <>
      {screen === 'idle' && (
        <IdleScreen
          title={title}
          setTitle={setTitle}
          language={language}
          setLanguage={setLanguage}
          onStart={handleStart}
          onHistory={() => setSection('history')}
          error={transcribeError ?? recorder.error}
        />
      )}
      {screen === 'recording' && (
        <RecordingScreen durationMs={recorder.durationMs} analyser={recorder.analyser} onStop={handleStop} />
      )}
      {screen === 'transcribing' && (
        <TranscribeScreen stage={transcribeProgress.stage} progress={transcribeProgress.progress} />
      )}
      {screen === 'result' && (
        <ResultScreen
          result={historyView ?? result!}
          title={historyView?.title ?? title}
          durationMs={historyView?.durationMs ?? finalDurationMs}
          onReset={handleReset}
          onBack={historyView ? () => setSection('history') : undefined}
        />
      )}
    </>
  )

  return (
    <div className="flex h-screen bg-bg text-fg">
      <Sidebar section={section} setSection={setSection} theme={theme} setTheme={setTheme} version={version} />

      <main className="flex-1 flex flex-col overflow-hidden">
        <div className="drag h-9 flex-shrink-0" />
        <div className="flex-1 overflow-hidden">
          {section === 'record'   && recordFlow}
          {section === 'history'  && (
            <HistoryScreen
              onBack={() => { setSection('record'); setScreen('idle') }}
              onOpen={handleOpenFromHistory}
              onTranscribe={handleTranscribeFromHistory}
              notice={transcribeError}
            />
          )}
          {section === 'models'   && <ModelsScreen />}
          {section === 'settings' && <SettingsScreen theme={theme} setTheme={setTheme} />}
          {section === 'about'    && <AboutScreen />}
        </div>
      </main>
    </div>
  )
}
