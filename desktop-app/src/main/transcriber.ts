import { ipcMain, app, BrowserWindow } from 'electron'
import { spawn } from 'child_process'
import { join } from 'path'
import { existsSync } from 'fs'
import { writeFile, mkdir } from 'fs/promises'
import { tmpdir } from 'os'
import { buildMarkdown, mergeSegments, extractQuestions } from './transcriptBuilder'
import { getRecording, updateRecording, audioFilePath } from './storage'
import { getActiveModelInfo } from './downloader'
import { transcribeWithSherpa } from './sherpa'

// ── Binary path resolution ────────────────────────────────────────────────────
// Packaged app:  <app>.app/Contents/Resources/bin/whisper-cli
// Dev:           system Homebrew install

export function getBundledBin(name: string): string {
  const inResources = join(process.resourcesPath, 'bin', name)
  if (existsSync(inResources)) return inResources
  // dev fallback — out/main is two levels below project root
  const inDev = join(__dirname, '../../resources/bin', name)
  if (existsSync(inDev)) return inDev
  return ''
}

function getWhisperBinary(): string {
  const bundled = getBundledBin(process.platform === 'win32' ? 'whisper-cli.exe' : 'whisper-cli')
  if (bundled) return bundled
  if (existsSync('/opt/homebrew/bin/whisper-cli')) return '/opt/homebrew/bin/whisper-cli'
  if (existsSync('/usr/local/bin/whisper-cli')) return '/usr/local/bin/whisper-cli'
  return 'whisper-cli'
}

export function getFfmpegBinary(): string {
  const bundled = getBundledBin(process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg')
  if (bundled) return bundled
  const systemCandidates = ['/opt/homebrew/bin/ffmpeg', '/usr/local/bin/ffmpeg']
  return systemCandidates.find(existsSync) ?? 'ffmpeg'
}

// ── Audio utilities ────────────────────────────────────────────────────────────

async function splitChannels(src: string, outDir: string): Promise<{ recruiter: string; me: string }> {
  const recruiter = join(outDir, 'recruiter.wav')
  const me = join(outDir, 'me.wav')
  const ffmpegBin = getFfmpegBinary()

  const ffmpeg = (af: string, out: string) =>
    new Promise<void>((resolve, reject) => {
      const proc = spawn(ffmpegBin, ['-y', '-i', src, '-ar', '16000', '-ac', '1', '-af', af, out])
      let stderr = ''
      proc.stderr.on('data', (d) => (stderr += d))
      proc.on('error', (err) =>
        reject(new Error(`ffmpeg failed to start (${ffmpegBin}): ${err.message}. Is ffmpeg installed?`))
      )
      proc.on('close', (code) =>
        code === 0 ? resolve() : reject(new Error(`ffmpeg exit ${code}: ${stderr.slice(-300)}`))
      )
    })

  await ffmpeg('pan=mono|c0=FL', recruiter)
  await ffmpeg('pan=mono|c0=FR', me)
  return { recruiter, me }
}

// Measure peak/mean loudness (dBFS) of a wav via ffmpeg volumedetect.
async function measureLoudness(wav: string): Promise<{ max: number; mean: number }> {
  const ffmpegBin = getFfmpegBinary()
  return new Promise((resolve) => {
    const proc = spawn(ffmpegBin, ['-i', wav, '-af', 'volumedetect', '-f', 'null', '-'])
    let stderr = ''
    proc.stderr.on('data', (d) => (stderr += d))
    const num = (re: RegExp): number => parseFloat(stderr.match(re)?.[1] ?? '-99')
    proc.on('error', () => resolve({ max: -99, mean: -99 }))
    proc.on('close', () =>
      resolve({
        max: num(/max_volume:\s*(-?\d+(?:\.\d+)?)\s*dB/),
        mean: num(/mean_volume:\s*(-?\d+(?:\.\d+)?)\s*dB/)
      })
    )
  })
}

// Prepare a channel for transcription: skip it entirely if it's essentially silent
// (e.g. the system-audio channel when loopback capture never engaged — feeding digital
// silence to whisper produces a storm of "Играет музыка"-style hallucinations), and
// otherwise loudness-normalize so faint mic speech is loud enough to be transcribed.
// Returns the path to feed whisper, or null when the channel should be skipped.
const SILENCE_MAX_DBFS = -50

async function prepareChannel(wav: string): Promise<string | null> {
  const { max } = await measureLoudness(wav)
  if (max < SILENCE_MAX_DBFS) return null

  const out = wav.replace(/\.wav$/, '.norm.wav')
  const ffmpegBin = getFfmpegBinary()
  await new Promise<void>((resolve, reject) => {
    const proc = spawn(ffmpegBin, [
      '-y', '-i', wav, '-ar', '16000', '-ac', '1',
      '-af', 'highpass=f=80,loudnorm=I=-18:TP=-2:LRA=11',
      out
    ])
    let stderr = ''
    proc.stderr.on('data', (d) => (stderr += d))
    proc.on('error', reject)
    proc.on('close', (code) =>
      code === 0 ? resolve() : reject(new Error(`ffmpeg normalize exit ${code}: ${stderr.slice(-200)}`))
    )
  })
  return out
}

// ── Whisper transcription ─────────────────────────────────────────────────────

type Segment = [number, number, string]

function transcribeWav(wavPath: string, modelPath: string, language: string): Promise<Segment[]> {
  return new Promise((resolve, reject) => {
    const binary = getWhisperBinary()
    const args = [
      '--model', modelPath,
      '--language', language,
      // ROOT-CAUSE FIX for the "lost recording" bug: on a long call with stretches of
      // near-silence between speech, whisper.cpp's default behaviour (--max-context -1)
      // carries decoded tokens forward as the prompt for the next 30 s window. Once it
      // hallucinates a stock phrase over silence ("Продолжение следует"), that phrase
      // becomes the prompt and self-repeats for the rest of the file, burying the real
      // speech. Disabling cross-window context (0) decodes each window fresh and breaks
      // the loop; residual per-window hallucinations are stripped in transcriptBuilder.
      '--max-context', '0',
      // Reject decoder degeneration (repetition loops) more aggressively than the
      // default 2.40 — a stuck loop has low entropy and should trigger a fallback.
      '--entropy-thold', '2.8',
      '--output-json',
      '--no-prints',
      '--file', wavPath,
    ]

    const proc = spawn(binary, args)
    let stdout = ''
    let stderr = ''
    proc.stdout.on('data', (d) => (stdout += d))
    proc.stderr.on('data', (d) => (stderr += d))
    proc.on('error', (err) =>
      reject(new Error(`whisper failed to start (${binary}): ${err.message}`))
    )
    proc.on('close', (code, signal) => {
      if (code !== 0) {
        if (code === null && (signal === 'SIGKILL' || signal === 'SIGABRT')) {
          reject(
            new Error(
              `Transcription engine was killed by macOS (${signal}). The whisper-cli ` +
                `binary has an invalid code signature or is blocked by Gatekeeper. ` +
                `Reinstall the app, or switch to a Sherpa model in Models.`
            )
          )
          return
        }
        reject(new Error(`whisper exit ${code ?? signal}: ${stderr.slice(0, 300)}`))
        return
      }
      try {
        const jsonPath = wavPath + '.json'
        const fs = require('fs')
        const raw = fs.readFileSync(jsonPath, 'utf-8')
        const parsed = JSON.parse(raw)
        const segments: Segment[] = (parsed.transcription || []).map(
          (s: { offsets: { from: number; to: number }; text: string }) => [
            s.offsets.from / 1000,
            s.offsets.to / 1000,
            s.text,
          ]
        )
        resolve(segments)
      } catch {
        const lines = stdout.split('\n')
        const segments: Segment[] = []
        for (const line of lines) {
          const m = line.match(/\[(\d+:\d+\.\d+)\s*-->\s*(\d+:\d+\.\d+)\]\s*(.+)/)
          if (m) {
            const parseTime = (t: string) => {
              const [min, sec] = t.split(':').map(Number)
              return min * 60 + sec
            }
            segments.push([parseTime(m[1]), parseTime(m[2]), m[3].trim()])
          }
        }
        resolve(segments)
      }
    })
  })
}

// ── Core pipeline ─────────────────────────────────────────────────────────────

async function runPipeline(
  srcPath: string,
  language: string,
  meta: { date: string; title: string },
  send: (p: object) => void
): Promise<{ markdown: string; questions: string[] }> {
  const modelInfo = getActiveModelInfo()
  if (!modelInfo) throw new Error('No transcription model installed. Download one in Models.')

  const tmpDir = join(tmpdir(), `ir-split-${Date.now()}`)
  await mkdir(tmpDir, { recursive: true })

  try {
    send({ stage: 'splitting', progress: 10 })
    const { recruiter, me } = await splitChannels(srcPath, tmpDir)

    let recruiterSegs: Segment[]
    let meSegs: Segment[]

    send({ stage: 'transcribing-recruiter', progress: 20 })
    const recruiterPrep = await prepareChannel(recruiter)
    send({ stage: 'transcribing-me', progress: 40 })
    const mePrep = await prepareChannel(me)

    if (modelInfo.engine === 'sherpa') {
      send({ stage: 'transcribing-recruiter', progress: 50 })
      const result = await transcribeWithSherpa(
        modelInfo,
        recruiterPrep ?? recruiter,
        mePrep ?? me,
        language
      )
      recruiterSegs = recruiterPrep ? result.recruiterSegs : []
      meSegs = mePrep ? result.meSegs : []
      send({ stage: 'building', progress: 90 })
    } else {
      const modelPath = modelInfo.whisperModelPath!
      send({ stage: 'transcribing-recruiter', progress: 50 })
      recruiterSegs = recruiterPrep ? await transcribeWav(recruiterPrep, modelPath, language) : []
      send({ stage: 'transcribing-me', progress: 70 })
      meSegs = mePrep ? await transcribeWav(mePrep, modelPath, language) : []
      send({ stage: 'building', progress: 90 })
    }

    const merged = mergeSegments(recruiterSegs, meSegs)
    const questions = extractQuestions(recruiterSegs)
    const markdown = buildMarkdown(
      { date: meta.date, source: 'recording.webm', title: meta.title || 'Interview' },
      merged,
      questions
    )
    send({ stage: 'done', progress: 100 })
    return { markdown, questions }
  } finally {
    const { rm } = await import('fs/promises')
    await rm(tmpDir, { recursive: true, force: true })
  }
}

// ── IPC handlers ──────────────────────────────────────────────────────────────

export function setupTranscribeHandlers(): void {
  ipcMain.handle('transcribe-recording', async (event, id: string) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    const send = (payload: object) => win?.webContents.send('transcribe-progress', payload)
    send({ stage: 'preparing', progress: 0 })

    const rec = await getRecording(id)
    if (!rec) throw new Error('Recording not found')
    const srcPath = audioFilePath(id)
    if (!existsSync(srcPath)) throw new Error('Audio file missing for this recording')

    const { markdown, questions } = await runPipeline(
      srcPath,
      rec.language,
      { date: rec.date, title: rec.title },
      send
    )
    await updateRecording(id, { markdown, questions, transcribed: true })
    return { markdown, questions }
  })

  ipcMain.handle(
    'transcribe',
    async (event, opts: { audioBuffer: ArrayBuffer; title: string; language: string }) => {
      const win = BrowserWindow.fromWebContents(event.sender)
      const send = (payload: object) => win?.webContents.send('transcribe-progress', payload)
      send({ stage: 'preparing', progress: 0 })

      const tmpDir = join(tmpdir(), `ir-${Date.now()}`)
      await mkdir(tmpDir, { recursive: true })
      const srcPath = join(tmpDir, 'recording.webm')

      try {
        await writeFile(srcPath, Buffer.from(opts.audioBuffer))
        const { markdown, questions } = await runPipeline(
          srcPath,
          opts.language,
          { date: new Date().toISOString().slice(0, 10), title: opts.title || 'Interview' },
          send
        )
        return { markdown, questions }
      } finally {
        const { rm } = await import('fs/promises')
        await rm(tmpDir, { recursive: true, force: true })
      }
    }
  )

  ipcMain.handle('check-model', () => !!getActiveModelInfo())
  ipcMain.handle('check-whisper', () => {
    const bin = getWhisperBinary()
    return existsSync(bin) || bin === 'whisper-cli'
  })
}
