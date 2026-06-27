import { app } from 'electron'
import { join } from 'path'
import { readFile, writeFile, mkdir, unlink } from 'fs/promises'
import { randomUUID } from 'crypto'

export interface Recording {
  id: string
  title: string
  date: string
  durationMs: number
  language: string
  markdown: string
  questions: string[]
  audioPath?: string   // relative path under userData, e.g. "audio/<id>.webm"
  transcribed?: boolean
}

export type RecordingMeta = Omit<Recording, 'markdown'>

const storagePath = () => join(app.getPath('userData'), 'recordings.json')
const audioDir = () => join(app.getPath('userData'), 'audio')
export const audioFilePath = (id: string): string => join(audioDir(), `${id}.webm`)

async function load(): Promise<Recording[]> {
  try {
    const raw = await readFile(storagePath(), 'utf-8')
    return JSON.parse(raw) as Recording[]
  } catch {
    return []
  }
}

async function persist(recs: Recording[]): Promise<void> {
  await writeFile(storagePath(), JSON.stringify(recs, null, 2), 'utf-8')
}

// Returns full records (incl. markdown transcript) so the History view can
// search by spoken words, not just the title.
export async function listRecordings(): Promise<Recording[]> {
  return load()
}

export async function getRecording(id: string): Promise<Recording | null> {
  const recs = await load()
  return recs.find((r) => r.id === id) ?? null
}

export async function addRecording(rec: Omit<Recording, 'id'>): Promise<Recording> {
  const recs = await load()
  const newRec: Recording = { id: randomUUID(), ...rec }
  recs.unshift(newRec) // newest first
  await persist(recs)
  return newRec
}

// Persist the raw audio to disk and create the record immediately (before
// transcription) so a recording is never lost if transcription fails.
export async function saveRecording(
  input: { title: string; date: string; durationMs: number; language: string },
  audioBuffer: ArrayBuffer
): Promise<Recording> {
  const id = randomUUID()
  await mkdir(audioDir(), { recursive: true })
  await writeFile(audioFilePath(id), Buffer.from(audioBuffer))

  const newRec: Recording = {
    id,
    title: input.title,
    date: input.date,
    durationMs: input.durationMs,
    language: input.language,
    markdown: '',
    questions: [],
    audioPath: `audio/${id}.webm`,
    transcribed: false
  }
  const recs = await load()
  recs.unshift(newRec)
  await persist(recs)
  return newRec
}

export async function updateRecording(
  id: string,
  patch: Partial<Recording>
): Promise<Recording | null> {
  const recs = await load()
  const idx = recs.findIndex((r) => r.id === id)
  if (idx === -1) return null
  recs[idx] = { ...recs[idx], ...patch, id }
  await persist(recs)
  return recs[idx]
}

export async function deleteRecording(id: string): Promise<void> {
  const recs = await load()
  await persist(recs.filter((r) => r.id !== id))
  // best-effort: remove the audio file too
  await unlink(audioFilePath(id)).catch(() => {})
}
