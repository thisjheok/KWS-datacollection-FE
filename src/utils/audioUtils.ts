const TARGET_SAMPLE_RATE = 16000
const TARGET_DURATION_MS = 2000
const TARGET_SAMPLE_COUNT = (TARGET_SAMPLE_RATE * TARGET_DURATION_MS) / 1000
const WAV_MIME_TYPE = 'audio/wav'

export type WavConversionResult = {
  blob: Blob
  pcm: Float32Array
  durationMs: number
  sampleRate: number
}

const getAudioContextCtor = (): typeof AudioContext => {
  if (typeof window === 'undefined' || typeof window.AudioContext === 'undefined') {
    throw new DOMException('AudioContext is not supported', 'NotSupportedError')
  }
  return window.AudioContext
}

const mixToMono = (buffer: AudioBuffer): Float32Array => {
  if (buffer.numberOfChannels <= 1) {
    return buffer.getChannelData(0)
  }

  const mono = new Float32Array(buffer.length)
  const channels = Array.from({ length: buffer.numberOfChannels }, (_, index) =>
    buffer.getChannelData(index),
  )

  for (let frame = 0; frame < buffer.length; frame += 1) {
    let sum = 0
    for (const channel of channels) {
      sum += channel[frame]
    }
    mono[frame] = sum / channels.length
  }

  return mono
}

const resampleTo16k = async (input: Float32Array, sampleRate: number): Promise<Float32Array> => {
  if (sampleRate === TARGET_SAMPLE_RATE) {
    return input
  }

  const targetLength = Math.max(1, Math.round((input.length * TARGET_SAMPLE_RATE) / sampleRate))
  const offlineContext = new OfflineAudioContext(1, targetLength, TARGET_SAMPLE_RATE)
  const sourceBuffer = offlineContext.createBuffer(1, input.length, sampleRate)
  sourceBuffer.copyToChannel(new Float32Array(input), 0)

  const source = offlineContext.createBufferSource()
  source.buffer = sourceBuffer
  source.connect(offlineContext.destination)
  source.start(0)

  const renderedBuffer = await offlineContext.startRendering()
  return renderedBuffer.getChannelData(0)
}

const encodeWavPcm16 = (samples: Float32Array, sampleRate: number): Blob => {
  const channelCount = 1
  const bytesPerSample = 2
  const byteRate = sampleRate * channelCount * bytesPerSample
  const blockAlign = channelCount * bytesPerSample
  const dataSize = samples.length * bytesPerSample
  const buffer = new ArrayBuffer(44 + dataSize)
  const view = new DataView(buffer)

  let offset = 0
  const writeString = (value: string) => {
    for (let index = 0; index < value.length; index += 1) {
      view.setUint8(offset, value.charCodeAt(index))
      offset += 1
    }
  }
  const writeUint16 = (value: number) => {
    view.setUint16(offset, value, true)
    offset += 2
  }
  const writeUint32 = (value: number) => {
    view.setUint32(offset, value, true)
    offset += 4
  }

  writeString('RIFF')
  writeUint32(36 + dataSize)
  writeString('WAVE')
  writeString('fmt ')
  writeUint32(16)
  writeUint16(1)
  writeUint16(channelCount)
  writeUint32(sampleRate)
  writeUint32(byteRate)
  writeUint16(blockAlign)
  writeUint16(16)
  writeString('data')
  writeUint32(dataSize)

  for (let index = 0; index < samples.length; index += 1) {
    const sample = Math.max(-1, Math.min(1, samples[index]))
    const pcm = sample < 0 ? sample * 0x8000 : sample * 0x7fff
    view.setInt16(offset, pcm, true)
    offset += 2
  }

  return new Blob([buffer], { type: WAV_MIME_TYPE })
}

const normalizeToFixedSamples = (input: Float32Array, targetLength: number): Float32Array => {
  if (input.length === targetLength) {
    return input
  }

  const normalized = new Float32Array(targetLength)
  normalized.set(input.subarray(0, targetLength))
  return normalized
}

export const convertBlobTo16kMonoWav = async (blob: Blob): Promise<WavConversionResult> => {
  const AudioContextCtor = getAudioContextCtor()
  const audioContext = new AudioContextCtor()

  try {
    const arrayBuffer = await blob.arrayBuffer()
    const decodedBuffer = await audioContext.decodeAudioData(arrayBuffer)
    const monoData = mixToMono(decodedBuffer)
    const resampled = await resampleTo16k(monoData, decodedBuffer.sampleRate)
    const fixedLengthPcm = normalizeToFixedSamples(resampled, TARGET_SAMPLE_COUNT)
    const wavBlob = encodeWavPcm16(fixedLengthPcm, TARGET_SAMPLE_RATE)

    return {
      blob: wavBlob,
      pcm: fixedLengthPcm,
      durationMs: Math.round((fixedLengthPcm.length / TARGET_SAMPLE_RATE) * 1000),
      sampleRate: TARGET_SAMPLE_RATE,
    }
  } finally {
    await audioContext.close()
  }
}
