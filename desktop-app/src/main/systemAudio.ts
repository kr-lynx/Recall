import { ipcMain } from 'electron'
import { spawn, ChildProcess } from 'child_process'
import { join } from 'path'
import { existsSync } from 'fs'
import { rm, rename, stat } from 'fs/promises'
import { tmpdir } from 'os'
import { getBundledBin, getFfmpegBinary } from './transcriber'
import { audioFilePath } from './storage'

// Native macOS system-audio capture (the other side of the call) via the bundled
// ScreenCaptureKit helper. No virtual audio driver needed — just Screen Recording
// permission. On Windows the renderer uses getDisplayMedia loopback instead, so these
// handlers are macOS-only and no-op elsewhere.

let current: { proc: ChildProcess; wav: string } | null = null

function helperBin(): string {
  return getBundledBin('system-audio-capture')
}

function stopProc(proc: ChildProcess): Promise<void> {
  return new Promise((resolve) => {
    let settled = false
    const done = (): void => {
      if (!settled) {
        settled = true
        resolve()
      }
    }
    proc.once('exit', done)
    proc.kill('SIGTERM') // helper finalizes the WAV header on SIGTERM
    setTimeout(() => {
      try {
        proc.kill('SIGKILL')
      } catch {
        /* already gone */
      }
      done()
    }, 4000)
  })
}

// Mux captured system audio (→ left / "Interviewer") with the mic recording's right
// channel (→ "Me") into one stereo file, so the existing channel-split transcription
// pipeline works unchanged.
function mergeStereo(systemWav: string, micFile: string, out: string): Promise<boolean> {
  const ff = getFfmpegBinary()
  const filter =
    '[0:a]pan=mono|c0=0.5*c0+0.5*c1[sys];' +
    '[1:a]pan=mono|c0=FR[mic];' +
    '[sys][mic]join=inputs=2:channel_layout=stereo:map=0.0-FL|1.0-FR[a]'
  const args = ['-y', '-i', systemWav, '-i', micFile, '-filter_complex', filter, '-map', '[a]', '-c:a', 'libopus', out]
  return new Promise((resolve) => {
    const p = spawn(ff, args)
    let err = ''
    p.stderr.on('data', (d) => (err += d))
    p.on('error', () => resolve(false))
    p.on('close', (code) => resolve(code === 0))
  })
}

export function setupSystemAudioHandlers(): void {
  // Start capturing system audio to a temp WAV for the duration of a recording.
  ipcMain.handle('system-capture-start', () => {
    if (process.platform !== 'darwin') return { started: false }
    const bin = helperBin()
    if (!bin || !existsSync(bin)) return { started: false }
    if (current) return { started: true } // already running

    const wav = join(tmpdir(), `ir-sys-${Date.now()}.wav`)
    try {
      const proc = spawn(bin, [wav], { stdio: ['ignore', 'ignore', 'pipe'] })
      let err = ''
      proc.stderr?.on('data', (d) => (err += d))
      proc.on('error', () => {
        current = null
      })
      proc.on('exit', (code) => {
        if (code && code !== 0) console.warn(`system-audio-capture exited ${code}: ${err.slice(-200)}`)
      })
      current = { proc, wav }
      return { started: true }
    } catch {
      return { started: false }
    }
  })

  // Stop capture and merge the system audio into the just-saved recording.
  ipcMain.handle('system-capture-stop', async (_e, recId: string) => {
    if (!current) return { merged: false }
    const { proc, wav } = current
    current = null

    await stopProc(proc)
    if (!existsSync(wav)) return { merged: false }

    // Empty / tiny WAV ⇒ nothing was captured (e.g. permission denied) — skip the merge.
    try {
      const s = await stat(wav)
      if (s.size < 4096) {
        await rm(wav, { force: true })
        return { merged: false, empty: true }
      }
    } catch {
      return { merged: false }
    }

    const recPath = audioFilePath(recId)
    if (!existsSync(recPath)) {
      await rm(wav, { force: true })
      return { merged: false }
    }

    const out = recPath + '.stereo.webm'
    const ok = await mergeStereo(wav, recPath, out)
    if (ok) await rename(out, recPath)
    else await rm(out, { force: true })
    await rm(wav, { force: true })
    return { merged: ok }
  })
}
