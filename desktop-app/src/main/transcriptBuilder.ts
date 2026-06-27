export type Segment = [number, number, string]

export interface MergedSegment {
  start: number
  end: number
  text: string
  speaker: 'Interviewer' | 'Me'
}

// Whisper hallucinates these stock phrases on silent/near-silent audio (they leak in
// from YouTube subtitle training data). The list is multilingual on purpose — the
// Cyrillic entries below match the Russian variants ("thanks for watching", "subscribe",
// "subtitles by …"). These are matching patterns, not UI strings.
const HALLUCINATION_RE = [
  /редактор\s+субтитров/i,
  /корректор\s+[А-ЯЁа-яё]/i,
  /субтитры.*amara/i,
  /amara\.org/i,
  /субтитры\s+(создавал|сделал|сделана|подготовил|добавил|делал|правил)/i,
  /dima\s*torzok/i,
  /продолжение\s+следует/i,
  /игра[ею]т\s+музыка|музыка\s+игра[ею]т/i,
  // bracketed sound-effect captions: [музыка], (аплодисменты), *смех*
  /^[[(*]+\s*(музыка|аплодисмент|смех|тишина|звон|гудок)/i,
  /спасибо\s+за\s+(просмотр|внимание)/i,
  /подпишитесь\s+на\s+канал/i,
  /thanks?\s+for\s+watching/i,
  /please\s+sub(scribe)?/i,
  /like\s+and\s+sub(scribe)?/i,
  /www\.\w+\.\w+/i,
]

// Whisper sometimes degenerates into a repetition loop on faint audio, emitting the
// same token/phrase over and over ("да да да да да", "музыка музыка музыка"). A
// healthy sentence has high lexical variety; a loop has very little.
function isRepetitive(text: string): boolean {
  const words = text.trim().toLowerCase().split(/\s+/).filter(Boolean)
  if (words.length < 6) return false // short repeats ("так-так", "да, да") are fine
  const unique = new Set(words)
  return unique.size / words.length < 0.34
}

// All-caps short lines that name a sound effect are almost always YouTube-style
// captions ("ДИНАМИЧНАЯ МУЗЫКА", "АПЛОДИСМЕНТЫ"), never real speech. Requiring
// all-caps avoids dropping a genuine sentence that merely mentions "музыка".
function isSoundEffectCaption(t: string): boolean {
  const words = t.split(/\s+/)
  if (words.length > 3) return false
  const letters = t.replace(/[^A-Za-zА-ЯЁа-яё]/g, '')
  if (letters.length < 3 || letters !== letters.toUpperCase()) return false
  return /(музык|аплодисмент|смех|тишин|апплодисмент)/i.test(t)
}

function isHallucination(text: string): boolean {
  const t = text.trim()
  return (
    t.length < 2 ||
    isRepetitive(t) ||
    isSoundEffectCaption(t) ||
    HALLUCINATION_RE.some((re) => re.test(t))
  )
}

// Drop runs of ≥3 consecutive segments with identical text — the multi-segment form
// of the same repetition loop (e.g. whisper emitting "Играет музыка" 94 times in a
// row across separate 30 s windows). One or two repeats are kept as plausibly real.
function dropConsecutiveLoops(segs: Segment[]): Segment[] {
  const out: Segment[] = []
  let i = 0
  while (i < segs.length) {
    const key = segs[i][2].trim().toLowerCase()
    let j = i + 1
    while (j < segs.length && segs[j][2].trim().toLowerCase() === key) j++
    if (j - i < 3) for (let k = i; k < j; k++) out.push(segs[k])
    i = j
  }
  return out
}

export function formatTimestamp(seconds: number): string {
  const total = Math.floor(seconds)
  const m = Math.floor(total / 60).toString().padStart(2, '0')
  const s = (total % 60).toString().padStart(2, '0')
  return `${m}:${s}`
}

export function extractQuestions(recruiter: Segment[]): string[] {
  const seen = new Set<string>()
  const questions: string[] = []
  for (const [, , text] of dropConsecutiveLoops(recruiter)) {
    if (isHallucination(text)) continue
    const sentences = text.split(/(?<=[.!?…])\s+/)
    for (const s of sentences) {
      const trimmed = s.trim()
      if (trimmed.endsWith('?')) {
        const key = trimmed.toLowerCase()
        if (!seen.has(key)) {
          seen.add(key)
          questions.push(trimmed)
        }
      }
    }
  }
  return questions
}

export function mergeSegments(recruiter: Segment[], me: Segment[]): MergedSegment[] {
  const segments: MergedSegment[] = [
    ...dropConsecutiveLoops(recruiter)
      .filter(([, , t]) => t.trim() && !isHallucination(t))
      .map(([s, e, t]) => ({ start: s, end: e, text: t.trim(), speaker: 'Interviewer' as const })),
    ...dropConsecutiveLoops(me)
      .filter(([, , t]) => t.trim() && !isHallucination(t))
      .map(([s, e, t]) => ({ start: s, end: e, text: t.trim(), speaker: 'Me' as const }))
  ]
  return segments.sort((a, b) => a.start - b.start)
}

export function buildMarkdown(
  meta: { date: string; source: string; title: string },
  merged: MergedSegment[],
  questions: string[]
): string {
  const lines = [
    '---',
    `date: ${meta.date}`,
    `source: ${meta.source}`,
    '---',
    `# Interview — ${meta.title} (${meta.date})`,
    '',
    '## Recruiter Questions',
  ]

  if (questions.length > 0) {
    lines.push(...questions.map((q) => `- ${q}`))
  } else {
    lines.push('_No questions detected._')
  }

  lines.push('', '## Full Transcript')

  for (const seg of merged) {
    lines.push(`**${seg.speaker}** (${formatTimestamp(seg.start)}): ${seg.text}`)
  }

  lines.push('')
  return lines.join('\n')
}
