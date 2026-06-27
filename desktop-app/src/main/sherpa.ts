import { join } from 'path'
import type { ActiveModelInfo } from './downloader'

type Segment = [number, number, string]

// Map Whisper language codes to SenseVoice language tags.
// SenseVoice accepts '' (auto), 'zh', 'en', 'ja', 'ko', 'yue'.
function toSenseVoiceLang(whisperLang: string): string {
  if (whisperLang === 'auto') return ''
  const map: Record<string, string> = {
    zh: 'zh', 'zh-cn': 'zh', 'zh-tw': 'zh',
    en: 'en',
    ja: 'ja',
    ko: 'ko',
    yue: 'yue',
  }
  return map[whisperLang.toLowerCase()] ?? ''
}

function buildConfig(info: ActiveModelInfo, language: string): object {
  const dir = info.sherpaModelDir!

  switch (info.sherpaType) {
    case 'nemo-ctc':
      return {
        modelConfig: {
          nemoCtc: { model: join(dir, 'model.int8.onnx') },
          tokens: join(dir, 'tokens.txt'),
        },
      }

    case 'sense-voice':
      return {
        modelConfig: {
          senseVoice: {
            model: join(dir, 'model.int8.onnx'),
            language: toSenseVoiceLang(language),
            useInverseTextNormalization: 1,
          },
          tokens: join(dir, 'tokens.txt'),
        },
      }

    case 'moonshine':
      return {
        modelConfig: {
          moonshine: {
            preprocessor: join(dir, 'preprocess.onnx'),
            encoder: join(dir, 'encode.int8.onnx'),
            uncachedDecoder: join(dir, 'uncached_decode.int8.onnx'),
            cachedDecoder: join(dir, 'cached_decode.int8.onnx'),
          },
          tokens: join(dir, 'tokens.txt'),
        },
      }

    case 'canary':
      return {
        modelConfig: {
          canary: {
            encoder: join(dir, 'encoder.int8.onnx'),
            decoder: join(dir, 'decoder.int8.onnx'),
            srcLang: 'en',
            tgtLang: 'en',
            usePnc: 1,
          },
          debug: 0,
          tokens: join(dir, 'tokens.txt'),
        },
      }

    default:
      throw new Error(`Unknown sherpa model type: ${info.sherpaType}`)
  }
}

function transcribeOneWav(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sherpa: any, recognizer: any, wavPath: string
): Segment[] {
  const stream = recognizer.createStream()
  const wave = sherpa.readWave(wavPath)
  stream.acceptWaveform(wave.sampleRate, wave.samples)
  recognizer.decode(stream)
  const result = recognizer.getResult(stream)
  stream.free()

  const text: string = result?.text?.trim() ?? ''
  if (!text) return []

  const duration = wave.samples.length / wave.sampleRate
  return [[0, duration, text]]
}

export type SherpaTranscriptPair = {
  recruiterSegs: Segment[]
  meSegs: Segment[]
}

export async function transcribeWithSherpa(
  info: ActiveModelInfo,
  recruiterWav: string,
  meWav: string,
  language: string
): Promise<SherpaTranscriptPair> {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const sherpa = require('sherpa-onnx')
  const config = buildConfig(info, language)
  const recognizer = sherpa.createOfflineRecognizer(config)

  try {
    const recruiterSegs = transcribeOneWav(sherpa, recognizer, recruiterWav)
    const meSegs = transcribeOneWav(sherpa, recognizer, meWav)
    return { recruiterSegs, meSegs }
  } finally {
    recognizer.free()
  }
}
