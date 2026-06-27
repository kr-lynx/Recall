import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

const api = {
  // Permissions
  requestPermissions: () => ipcRenderer.invoke('request-permissions'),
  getPermissions: () => ipcRenderer.invoke('get-permissions'),

  // Model
  modelExists: () => ipcRenderer.invoke('model-exists'),
  modelPath: () => ipcRenderer.invoke('model-path'),
  getModels: () => ipcRenderer.invoke('get-models'),
  getActiveModel: () => ipcRenderer.invoke('get-active-model'),
  getActiveModelId: () => ipcRenderer.invoke('get-active-model-id'),
  setActiveModel: (modelId: string) => ipcRenderer.invoke('set-active-model', modelId),
  downloadModel: (modelId: string) => ipcRenderer.invoke('download-model', modelId),
  deleteModel: (modelId: string) => ipcRenderer.invoke('delete-model', modelId),
  onDownloadProgress: (cb: (data: DownloadProgress) => void) => {
    ipcRenderer.on('download-progress', (_e, data) => cb(data))
    return () => ipcRenderer.removeAllListeners('download-progress')
  },

  // Transcription
  checkModel: () => ipcRenderer.invoke('check-model'),
  checkWhisper: () => ipcRenderer.invoke('check-whisper'),
  transcribe: (opts: { audioBuffer: ArrayBuffer; title: string; language: string }) =>
    ipcRenderer.invoke('transcribe', opts),
  transcribeRecording: (id: string) => ipcRenderer.invoke('transcribe-recording', id),

  // Native macOS system-audio capture (ScreenCaptureKit helper)
  systemCaptureStart: (): Promise<{ started: boolean }> => ipcRenderer.invoke('system-capture-start'),
  systemCaptureStop: (recId: string): Promise<{ merged: boolean; empty?: boolean }> =>
    ipcRenderer.invoke('system-capture-stop', recId),
  onTranscribeProgress: (cb: (data: TranscribeProgress) => void) => {
    ipcRenderer.on('transcribe-progress', (_e, data) => cb(data))
    return () => ipcRenderer.removeAllListeners('transcribe-progress')
  },

  // File
  openSaveDialog: (defaultName: string) => ipcRenderer.invoke('open-save-dialog', defaultName),
  writeFile: (filePath: string, content: string) =>
    ipcRenderer.invoke('write-file', filePath, content),
  getAppPaths: () => ipcRenderer.invoke('get-app-paths'),

  // App / settings
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),
  getLogDir: () => ipcRenderer.invoke('get-log-dir'),
  openPath: (p: string) => ipcRenderer.invoke('open-path', p),
  openRecordingsFolder: () => ipcRenderer.invoke('open-recordings-folder'),
  openExternal: (url: string) => ipcRenderer.invoke('open-external', url),
  getLaunchOnStartup: () => ipcRenderer.invoke('get-launch-on-startup'),
  setLaunchOnStartup: (enabled: boolean) => ipcRenderer.invoke('set-launch-on-startup', enabled),
  setTray: (enabled: boolean) => ipcRenderer.invoke('set-tray', enabled),
  initTray: (enabled: boolean) => ipcRenderer.invoke('init-tray', enabled),
  onNavigate: (cb: (section: string) => void) => {
    ipcRenderer.on('navigate', (_e, section) => cb(section))
    return () => ipcRenderer.removeAllListeners('navigate')
  },
  onModelsChanged: (cb: () => void) => {
    ipcRenderer.on('models-changed', () => cb())
    return () => ipcRenderer.removeAllListeners('models-changed')
  },

  // Recordings history
  listRecordings: () => ipcRenderer.invoke('list-recordings'),
  getRecording: (id: string) => ipcRenderer.invoke('get-recording', id),
  addRecording: (rec: RecordingInput) => ipcRenderer.invoke('add-recording', rec),
  saveRecording: (input: { title: string; date: string; durationMs: number; language: string }, audioBuffer: ArrayBuffer) =>
    ipcRenderer.invoke('save-recording', { ...input, audioBuffer }),
  deleteRecording: (id: string) => ipcRenderer.invoke('delete-recording', id),
}

export type DownloadProgress = {
  stage: 'starting' | 'downloading' | 'done' | 'error'
  progress: number
  received?: number
  total?: number
}

export type TranscribeProgress = {
  stage: string
  progress: number
}

export type RecordingInput = {
  title: string
  date: string
  durationMs: number
  language: string
  markdown: string
  questions: string[]
}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (e) {
    console.error(e)
  }
} else {
  // @ts-ignore
  window.electron = electronAPI
  // @ts-ignore
  window.api = api
}
