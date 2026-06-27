import type { DownloadProgress, TranscribeProgress, RecordingInput } from '../../../preload/index'

export interface Recording {
  id: string
  title: string
  date: string
  durationMs: number
  language: string
  markdown: string
  questions: string[]
  audioPath?: string
  transcribed?: boolean
}

// List items now carry the full markdown transcript so History can search by words.
export type RecordingMeta = Recording

declare global {
  interface Window {
    electron: {
      desktopCapturer: {
        getSources: (opts: { types: string[] }) => Promise<Array<{ id: string; name: string }>>
      }
    }
    api: {
      requestPermissions: () => Promise<{ mic: string; screen: string }>
      getPermissions: () => Promise<{ mic: string; screen: string }>

      modelExists: () => Promise<boolean>
      modelPath:   () => Promise<string>
      getModels: () => Promise<Array<{ id: string; name: string; size: string; quality: string; downloaded: boolean; recommended?: boolean; engine: 'whisper' | 'sherpa' }>>
      getActiveModel: () => Promise<string | null>
      getActiveModelId: () => Promise<string | null>
      setActiveModel: (modelId: string) => Promise<string>
      downloadModel: (modelId: string) => Promise<{ success: boolean; error?: string }>
      deleteModel: (modelId: string) => Promise<{ success: boolean; error?: string }>
      onDownloadProgress: (cb: (data: DownloadProgress) => void) => () => void

      checkModel:   () => Promise<boolean>
      checkWhisper: () => Promise<boolean>
      transcribe: (opts: { audioBuffer: ArrayBuffer; title: string; language: string }) => Promise<{ markdown: string; questions: string[] }>
      transcribeRecording: (id: string) => Promise<{ markdown: string; questions: string[] }>
      onTranscribeProgress: (cb: (data: TranscribeProgress) => void) => () => void

      systemCaptureStart: () => Promise<{ started: boolean }>
      systemCaptureStop: (recId: string) => Promise<{ merged: boolean; empty?: boolean }>

      openSaveDialog: (defaultName: string) => Promise<string | undefined>
      writeFile:      (filePath: string, content: string) => Promise<boolean>
      getAppPaths:    () => Promise<{ userData: string; home: string; desktop: string; downloads: string }>

      getAppVersion:        () => Promise<string>
      getLogDir:            () => Promise<string>
      openPath:             (p: string) => Promise<string>
      openRecordingsFolder: () => Promise<string>
      openExternal:         (url: string) => Promise<void>
      getLaunchOnStartup:   () => Promise<boolean>
      setLaunchOnStartup:   (enabled: boolean) => Promise<boolean>
      setTray:              (enabled: boolean) => Promise<boolean>
      initTray:             (enabled: boolean) => Promise<boolean>
      onNavigate:           (cb: (section: string) => void) => () => void
      onModelsChanged:      (cb: () => void) => () => void

      listRecordings:  () => Promise<RecordingMeta[]>
      getRecording:    (id: string) => Promise<Recording | null>
      addRecording:    (rec: RecordingInput) => Promise<Recording>
      saveRecording:   (input: { title: string; date: string; durationMs: number; language: string }, audioBuffer: ArrayBuffer) => Promise<Recording>
      deleteRecording: (id: string) => Promise<void>
    }
  }
}
