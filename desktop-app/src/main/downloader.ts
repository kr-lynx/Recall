import { ipcMain, app, BrowserWindow } from 'electron'
import { join } from 'path'
import { existsSync } from 'fs'
import { mkdir, writeFile } from 'fs/promises'
import https from 'https'
import http from 'http'
import { spawn } from 'child_process'
import { getSettings, setSetting } from './settings'

const MODEL_DIR = join(app.getPath('userData'), 'models')

// ── Whisper models ──────────────────────────────────────────────────────────

const HF = 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main'

export type WhisperModel = {
  id: string
  name: string
  size: string
  quality: string
  engine: 'whisper'
  filename: string
  url: string
  recommended?: boolean
}

const mkw = (id: string, name: string, size: string, quality: string, recommended?: boolean): WhisperModel => ({
  id, name, size, quality, engine: 'whisper',
  filename: `${id}.bin`,
  url: `${HF}/${id}.bin`,
  ...(recommended ? { recommended } : {})
})

const WHISPER_MODELS: WhisperModel[] = [
  mkw('ggml-large-v3-turbo', 'Whisper Large V3 Turbo', '~1.5 GB', 'Best balance of accuracy & speed', true),
  mkw('ggml-large-v3', 'Whisper Large V3', '~2.9 GB', 'Highest accuracy, slower'),
  mkw('ggml-large-v3-turbo-q5_0', 'Large V3 Turbo (compact)', '~550 MB', 'Turbo accuracy, quantized & lighter'),
  mkw('ggml-medium', 'Whisper Medium', '~1.5 GB', 'Balanced speed & accuracy'),
  mkw('ggml-small', 'Whisper Small', '~466 MB', 'Fast, decent accuracy'),
  mkw('ggml-base', 'Whisper Base', '~142 MB', 'Very fast, basic accuracy'),
  mkw('ggml-tiny', 'Whisper Tiny', '~75 MB', 'Fastest, lowest accuracy'),
]

// ── Sherpa-ONNX models ───────────────────────────────────────────────────────

const ASR = 'https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models'

export type SherpaModelType = 'nemo-ctc' | 'sense-voice' | 'moonshine' | 'canary'

export type SherpaModel = {
  id: string
  name: string
  size: string
  quality: string
  engine: 'sherpa'
  sherpaType: SherpaModelType
  tarUrl: string
  dir: string          // directory name after tarball extraction
  recommended?: boolean
}

const SHERPA_MODELS: SherpaModel[] = [
  {
    id: 'sherpa-gigaam-v2-ru',
    name: 'GigaAM v2 (Russian)',
    size: '~167 MB',
    quality: 'Optimised for Russian speech — priority model',
    engine: 'sherpa',
    sherpaType: 'nemo-ctc',
    tarUrl: `${ASR}/sherpa-onnx-nemo-ctc-giga-am-v2-russian-2025-04-19.tar.bz2`,
    dir: 'sherpa-onnx-nemo-ctc-giga-am-v2-russian-2025-04-19',
    recommended: true,
  },
  {
    id: 'sherpa-sense-voice',
    name: 'SenseVoice (multilingual)',
    size: '~163 MB',
    quality: 'Fast multilingual — ZH/EN/JA/KO/YUE (int8)',
    engine: 'sherpa',
    sherpaType: 'sense-voice',
    tarUrl: `${ASR}/sherpa-onnx-sense-voice-zh-en-ja-ko-yue-int8-2024-07-17.tar.bz2`,
    dir: 'sherpa-onnx-sense-voice-zh-en-ja-ko-yue-int8-2024-07-17',
  },
  {
    id: 'sherpa-parakeet-ctc',
    name: 'Parakeet CTC 110M (English)',
    size: '~104 MB',
    quality: 'NeMo CTC — English, fast & compact (int8)',
    engine: 'sherpa',
    sherpaType: 'nemo-ctc',
    tarUrl: `${ASR}/sherpa-onnx-nemo-parakeet_tdt_ctc_110m-en-36000-int8.tar.bz2`,
    dir: 'sherpa-onnx-nemo-parakeet_tdt_ctc_110m-en-36000-int8',
  },
  {
    id: 'sherpa-moonshine-tiny',
    name: 'Moonshine Tiny (English)',
    size: '~108 MB',
    quality: 'Ultra-fast English transcription (int8)',
    engine: 'sherpa',
    sherpaType: 'moonshine',
    tarUrl: `${ASR}/sherpa-onnx-moonshine-tiny-en-int8.tar.bz2`,
    dir: 'sherpa-onnx-moonshine-tiny-en-int8',
  },
  {
    id: 'sherpa-canary-180m',
    name: 'Canary 180M (EN/ES/DE/FR)',
    size: '~154 MB',
    quality: 'NeMo multilingual — English/Spanish/German/French (int8)',
    engine: 'sherpa',
    sherpaType: 'canary',
    tarUrl: `${ASR}/sherpa-onnx-nemo-canary-180m-flash-en-es-de-fr-int8.tar.bz2`,
    dir: 'sherpa-onnx-nemo-canary-180m-flash-en-es-de-fr-int8',
  },
]

export type AppModel = WhisperModel | SherpaModel
export const MODELS: AppModel[] = [...WHISPER_MODELS, ...SHERPA_MODELS]

// ── Existence checks ──────────────────────────────────────────────────────────

function findWhisperModel(filename: string): string | null {
  const candidates = [
    join(MODEL_DIR, filename),
    join('/opt/homebrew/share/whisper.cpp/models', filename),
    join('/usr/local/share/whisper.cpp/models', filename),
  ]
  return candidates.find(existsSync) ?? null
}

function isSherpaDownloaded(m: SherpaModel): boolean {
  return existsSync(join(MODEL_DIR, m.dir))
}

function isModelDownloaded(m: AppModel): boolean {
  if (m.engine === 'whisper') return !!findWhisperModel(m.filename)
  return isSherpaDownloaded(m)
}

// ── Active model resolution ────────────────────────────────────────────────

export type ActiveModelInfo = {
  id: string
  engine: 'whisper' | 'sherpa'
  // whisper
  whisperModelPath?: string
  // sherpa
  sherpaType?: SherpaModelType
  sherpaModelDir?: string
}

export function getActiveModelInfo(): ActiveModelInfo | null {
  const chosen = getSettings().activeModelId
  if (chosen) {
    const m = MODELS.find((x) => x.id === chosen)
    if (m && isModelDownloaded(m)) {
      if (m.engine === 'whisper') {
        return { id: m.id, engine: 'whisper', whisperModelPath: findWhisperModel(m.filename) ?? undefined }
      } else {
        return {
          id: m.id, engine: 'sherpa',
          sherpaType: m.sherpaType,
          sherpaModelDir: join(MODEL_DIR, m.dir),
        }
      }
    }
  }
  // fall back to first downloaded model (whisper preferred for legacy)
  for (const m of WHISPER_MODELS) {
    const p = findWhisperModel(m.filename)
    if (p) return { id: m.id, engine: 'whisper', whisperModelPath: p }
  }
  for (const m of SHERPA_MODELS) {
    if (isSherpaDownloaded(m)) {
      return { id: m.id, engine: 'sherpa', sherpaType: m.sherpaType, sherpaModelDir: join(MODEL_DIR, m.dir) }
    }
  }
  return null
}

// Kept for compatibility with existing whisper path in transcriber.ts
export function getActiveModelPath(): string | null {
  const info = getActiveModelInfo()
  return info?.engine === 'whisper' ? (info.whisperModelPath ?? null) : null
}

export function getActiveModelId(): string | null {
  const info = getActiveModelInfo()
  return info?.id ?? null
}

export function listDownloadedModels(): { id: string; name: string; active: boolean }[] {
  const activeId = getActiveModelId()
  return MODELS.filter(isModelDownloaded).map((m) => ({
    id: m.id,
    name: m.name,
    active: m.id === activeId,
  }))
}

export function setActiveModel(id: string): void {
  setSetting('activeModelId', id)
}

// ── Download utilities ────────────────────────────────────────────────────────

function downloadFile(
  url: string,
  destPath: string,
  onProgress: (received: number, total: number) => void
): Promise<void> {
  return new Promise((resolve, reject) => {
    const get = url.startsWith('https') ? https.get : http.get
    const request = get(url, { headers: { 'User-Agent': 'recall/0.1' } }, (res) => {
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        downloadFile(res.headers.location, destPath, onProgress).then(resolve).catch(reject)
        return
      }
      if (res.statusCode !== 200) { reject(new Error(`HTTP ${res.statusCode}`)); return }

      const total = parseInt(res.headers['content-length'] || '0', 10)
      let received = 0
      const chunks: Buffer[] = []

      res.on('data', (chunk: Buffer) => {
        received += chunk.length
        chunks.push(chunk)
        onProgress(received, total)
      })
      res.on('end', async () => {
        try { await writeFile(destPath, Buffer.concat(chunks)); resolve() }
        catch (e) { reject(e) }
      })
      res.on('error', reject)
    })
    request.on('error', reject)
  })
}

function extractTarball(tarPath: string, destDir: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn('tar', ['xjf', tarPath, '-C', destDir])
    let stderr = ''
    proc.stderr.on('data', (d) => (stderr += d))
    proc.on('error', (e) => reject(new Error(`tar failed: ${e.message}`)))
    proc.on('close', (code) =>
      code === 0 ? resolve() : reject(new Error(`tar exit ${code}: ${stderr.slice(-200)}`))
    )
  })
}

// ── IPC handlers ──────────────────────────────────────────────────────────────

export function setupDownloadHandlers(win: BrowserWindow): void {
  const send = (payload: object) => win.webContents.send('download-progress', payload)

  ipcMain.handle('get-models', () =>
    MODELS.map((m) => ({
      ...m,
      downloaded: isModelDownloaded(m),
      // legacy field for whisper models
      ...(m.engine === 'whisper' ? { localPath: findWhisperModel(m.filename) } : {}),
    }))
  )

  ipcMain.handle('get-active-model', () => getActiveModelPath())
  ipcMain.handle('get-active-model-id', () => getActiveModelId())
  ipcMain.handle('model-exists', () => !!getActiveModelInfo())

  ipcMain.handle('delete-model', async (_event, modelId: string) => {
    const model = MODELS.find((m) => m.id === modelId)
    if (!model) return { success: false, error: 'Unknown model' }
    const fs = await import('fs/promises')
    try {
      // Only ever remove copies we manage in MODEL_DIR — never system whisper.cpp models.
      if (model.engine === 'whisper') {
        const p = join(MODEL_DIR, model.filename)
        if (existsSync(p)) await fs.rm(p, { force: true })
      } else {
        const p = join(MODEL_DIR, model.dir)
        if (existsSync(p)) await fs.rm(p, { recursive: true, force: true })
      }
      // If the deleted model was active, clear it so the app falls back to another.
      if (getSettings().activeModelId === modelId) setSetting('activeModelId', '')
      send({ stage: 'done', progress: 100 })
      return { success: true }
    } catch (err) {
      return { success: false, error: String(err) }
    }
  })

  ipcMain.handle('download-model', async (_event, modelId: string) => {
    const model = MODELS.find((m) => m.id === modelId)
    if (!model) return { success: false, error: 'Unknown model' }
    if (isModelDownloaded(model)) {
      send({ stage: 'done', progress: 100 })
      return { success: true }
    }

    await mkdir(MODEL_DIR, { recursive: true })

    if (model.engine === 'whisper') {
      const destPath = join(MODEL_DIR, model.filename)
      send({ stage: 'starting', progress: 0, received: 0, total: 0 })
      try {
        await downloadFile(model.url, destPath, (received, total) => {
          send({ stage: 'downloading', progress: total > 0 ? Math.round((received / total) * 100) : 0, received, total })
        })
        send({ stage: 'done', progress: 100 })
        return { success: true, path: destPath }
      } catch (err) {
        if (existsSync(destPath)) await import('fs/promises').then((fs) => fs.unlink(destPath).catch(() => {}))
        send({ stage: 'error', progress: 0 })
        return { success: false, error: String(err) }
      }
    } else {
      // Sherpa: download tarball then extract
      const tmpTar = join(MODEL_DIR, `_tmp_${model.id}.tar.bz2`)
      send({ stage: 'starting', progress: 0, received: 0, total: 0 })
      try {
        await downloadFile(model.tarUrl, tmpTar, (received, total) => {
          send({ stage: 'downloading', progress: total > 0 ? Math.round((received / total) * 100) : 0, received, total })
        })
        send({ stage: 'extracting', progress: 99 })
        await extractTarball(tmpTar, MODEL_DIR)
        await import('fs/promises').then((fs) => fs.unlink(tmpTar).catch(() => {}))
        send({ stage: 'done', progress: 100 })
        return { success: true }
      } catch (err) {
        await import('fs/promises').then((fs) => fs.unlink(tmpTar).catch(() => {}))
        send({ stage: 'error', progress: 0 })
        return { success: false, error: String(err) }
      }
    }
  })
}
