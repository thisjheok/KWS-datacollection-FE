import {
  BORDERLINE_QUIET_RMS_THRESHOLD,
  CLIP_LEVEL,
  CLIP_RATIO_THRESHOLD,
  EARLY_END_MS,
  FLATLINE_ABS_MAX_THRESHOLD,
  FLATLINE_RMS_THRESHOLD,
  FRAME_SIZE,
  GATE_TARGET_SAMPLE_COUNT,
  GATE_TARGET_SAMPLE_RATE,
  LATE_START_MS,
  MIN_SPEECH_SPAN_MS,
  NO_SPEECH_RATIO_THRESHOLD,
  PASS_SPEECH_RATIO_THRESHOLD,
  SPEECH_FRAME_RMS_THRESHOLD,
  TOO_QUIET_RMS_THRESHOLD,
} from './gateConfig'

export type GateDecision = 'PASS' | 'AMBIG' | 'REJECT'
export type GateReason =
  | 'TooQuiet'
  | 'NoSpeech'
  | 'Flatline'
  | 'BorderlineQuiet'
  | 'ClippingSuspected'
  | 'SpeechOffCenter'
  | 'Ok'

export type GateResult = {
  decision: GateDecision
  reason: GateReason
  userMessage: string
  debugMetrics: {
    rms: number
    absMax: number
    clipRatio: number
    speechRatio: number
    firstSpeechMs: number | null
    lastSpeechMs: number | null
  }
}

const normalizePcmLength = (pcm: Float32Array): Float32Array => {
  if (pcm.length === GATE_TARGET_SAMPLE_COUNT) {
    return pcm
  }

  const normalized = new Float32Array(GATE_TARGET_SAMPLE_COUNT)
  normalized.set(pcm.subarray(0, GATE_TARGET_SAMPLE_COUNT))
  return normalized
}

const buildResult = (
  decision: GateDecision,
  reason: GateReason,
  userMessage: string,
  debugMetrics: GateResult['debugMetrics'],
): GateResult => ({
  decision,
  reason,
  userMessage,
  debugMetrics,
})

export const analyzePcmForSpeechGate = (pcm: Float32Array, sampleRate: number): GateResult => {
  const normalizedPcm = normalizePcmLength(pcm)
  const actualSampleRate = sampleRate > 0 ? sampleRate : GATE_TARGET_SAMPLE_RATE

  let sumSquares = 0
  let absMax = 0
  let clippedCount = 0

  for (let i = 0; i < normalizedPcm.length; i += 1) {
    const sample = normalizedPcm[i]
    const absSample = Math.abs(sample)
    sumSquares += sample * sample
    if (absSample > absMax) {
      absMax = absSample
    }
    if (absSample > CLIP_LEVEL) {
      clippedCount += 1
    }
  }

  const rms = Math.sqrt(sumSquares / normalizedPcm.length)
  const clipRatio = clippedCount / normalizedPcm.length

  const frameCount = Math.floor(normalizedPcm.length / FRAME_SIZE)
  let speechFrameCount = 0
  let firstSpeechFrame = -1
  let lastSpeechFrame = -1

  for (let frame = 0; frame < frameCount; frame += 1) {
    const start = frame * FRAME_SIZE
    const end = start + FRAME_SIZE
    let frameSquares = 0
    for (let i = start; i < end; i += 1) {
      const sample = normalizedPcm[i]
      frameSquares += sample * sample
    }
    const frameRms = Math.sqrt(frameSquares / FRAME_SIZE)
    if (frameRms >= SPEECH_FRAME_RMS_THRESHOLD) {
      speechFrameCount += 1
      if (firstSpeechFrame === -1) {
        firstSpeechFrame = frame
      }
      lastSpeechFrame = frame
    }
  }

  const speechRatio = frameCount > 0 ? speechFrameCount / frameCount : 0
  const frameMs = (FRAME_SIZE / actualSampleRate) * 1000
  const firstSpeechMs = firstSpeechFrame === -1 ? null : Math.round(firstSpeechFrame * frameMs)
  const lastSpeechMs = lastSpeechFrame === -1 ? null : Math.round((lastSpeechFrame + 1) * frameMs)
  const speechSpanMs =
    firstSpeechMs === null || lastSpeechMs === null ? 0 : Math.max(0, lastSpeechMs - firstSpeechMs)

  const debugMetrics: GateResult['debugMetrics'] = {
    rms,
    absMax,
    clipRatio,
    speechRatio,
    firstSpeechMs,
    lastSpeechMs,
  }

  if (absMax < FLATLINE_ABS_MAX_THRESHOLD && rms < FLATLINE_RMS_THRESHOLD) {
    return buildResult('REJECT', 'Flatline', '마이크 신호가 거의 없어요. 다시 말해볼까?', debugMetrics)
  }

  if (rms < TOO_QUIET_RMS_THRESHOLD) {
    return buildResult('REJECT', 'TooQuiet', '소리가 너무 작게 들어왔어요. 조금 더 크게!', debugMetrics)
  }

  if (speechRatio < NO_SPEECH_RATIO_THRESHOLD) {
    return buildResult('REJECT', 'NoSpeech', '발화가 거의 감지되지 않았어요. 다시 또렷하게!', debugMetrics)
  }

  if (rms < BORDERLINE_QUIET_RMS_THRESHOLD) {
    return buildResult('AMBIG', 'BorderlineQuiet', '거의 좋아요! 한 번만 더 또렷하게 해볼까요?', debugMetrics)
  }

  if (clipRatio > CLIP_RATIO_THRESHOLD) {
    return buildResult('AMBIG', 'ClippingSuspected', '소리가 살짝 깨졌을 수 있어요. 다시 한 번!', debugMetrics)
  }

  if (
    (firstSpeechMs !== null && firstSpeechMs > LATE_START_MS) ||
    (lastSpeechMs !== null && lastSpeechMs < EARLY_END_MS) ||
    speechSpanMs < MIN_SPEECH_SPAN_MS
  ) {
    return buildResult('AMBIG', 'SpeechOffCenter', '타이밍이 조금 치우쳤어요. 중앙에 맞춰 다시!', debugMetrics)
  }

  if (speechRatio >= PASS_SPEECH_RATIO_THRESHOLD && rms >= BORDERLINE_QUIET_RMS_THRESHOLD) {
    return buildResult('PASS', 'Ok', '좋아! 완벽해 🎉', debugMetrics)
  }

  return buildResult('AMBIG', 'SpeechOffCenter', '조금만 더 선명하게 말하면 바로 통과예요!', debugMetrics)
}
