import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

export const RecorderStatus = {
  Idle: 'Idle',
  Requesting: 'Requesting',
  Ready: 'Ready',
  Recording: 'Recording',
  Stopped: 'Stopped',
  MicDenied: 'MicDenied',
  Unsupported: 'Unsupported',
  Error: 'Error',
} as const

export type RecorderStatus = (typeof RecorderStatus)[keyof typeof RecorderStatus]

const MIME_CANDIDATES = [
  'audio/webm;codecs=opus',
  'audio/webm',
  'audio/mp4',
  'audio/ogg;codecs=opus',
] as const

const pickSupportedMimeType = () => {
  if (typeof MediaRecorder === 'undefined' || !MediaRecorder.isTypeSupported) {
    return null
  }

  for (const mimeType of MIME_CANDIDATES) {
    if (MediaRecorder.isTypeSupported(mimeType)) {
      return mimeType
    }
  }
  return null
}

type UseRecorderResult = {
  status: RecorderStatus
  stream: MediaStream | null
  audioBlob: Blob | null
  audioUrl: string | null
  errorName: string | null
  elapsedSeconds: number
  mimeType: string | null
  requestMicAccess: () => Promise<MediaStream | null>
  startRecording: () => Promise<void>
  stopRecording: () => void
  retry: () => Promise<void>
}

export const useRecorder = (): UseRecorderResult => {
  const [status, setStatus] = useState<RecorderStatus>(RecorderStatus.Idle)
  const [stream, setStream] = useState<MediaStream | null>(null)
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null)
  const [audioUrl, setAudioUrl] = useState<string | null>(null)
  const [errorName, setErrorName] = useState<string | null>(null)
  const [elapsedSeconds, setElapsedSeconds] = useState(0)

  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const timerRef = useRef<number | null>(null)
  const startedAtRef = useRef<number | null>(null)
  const audioUrlRef = useRef<string | null>(null)
  const mimeType = useMemo(pickSupportedMimeType, [])

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearInterval(timerRef.current)
      timerRef.current = null
    }
    startedAtRef.current = null
  }, [])

  const clearAudioUrl = useCallback(() => {
    if (audioUrlRef.current) {
      URL.revokeObjectURL(audioUrlRef.current)
      audioUrlRef.current = null
    }
  }, [])

  const stopAndReleaseStream = useCallback((target: MediaStream | null) => {
    target?.getTracks().forEach((track) => track.stop())
  }, [])

  const requestMicAccess = useCallback(async (): Promise<MediaStream | null> => {
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setStatus(RecorderStatus.Unsupported)
      setErrorName('NotSupportedError')
      return null
    }

    setStatus(RecorderStatus.Requesting)
    setErrorName(null)

    try {
      const newStream = await navigator.mediaDevices.getUserMedia({ audio: true })
      setStream((prev) => {
        stopAndReleaseStream(prev)
        return newStream
      })
      setStatus(RecorderStatus.Ready)
      return newStream
    } catch (error) {
      const name = error instanceof DOMException ? error.name : 'UnknownError'
      setErrorName(name)
      setStatus(RecorderStatus.MicDenied)
      return null
    }
  }, [stopAndReleaseStream])

  const stopRecording = useCallback(() => {
    const recorder = mediaRecorderRef.current
    if (!recorder || recorder.state === 'inactive') {
      return
    }
    recorder.stop()
  }, [])

  const startRecording = useCallback(async () => {
    let activeStream = stream
    if (!activeStream) {
      activeStream = await requestMicAccess()
    }

    if (!activeStream) {
      return
    }

    if (typeof MediaRecorder === 'undefined') {
      setStatus(RecorderStatus.Unsupported)
      setErrorName('NotSupportedError')
      return
    }

    try {
      clearTimer()
      setElapsedSeconds(0)
      chunksRef.current = []
      setAudioBlob(null)
      clearAudioUrl()
      setAudioUrl(null)

      const recorder = mimeType
        ? new MediaRecorder(activeStream, { mimeType })
        : new MediaRecorder(activeStream)
      mediaRecorderRef.current = recorder

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data)
        }
      }

      recorder.onstop = () => {
        clearTimer()
        const resultBlob = new Blob(chunksRef.current, {
          type: recorder.mimeType || mimeType || 'audio/webm',
        })
        setAudioBlob(resultBlob)
        const newUrl = URL.createObjectURL(resultBlob)
        audioUrlRef.current = newUrl
        setAudioUrl(newUrl)
        setStatus(RecorderStatus.Stopped)
      }

      recorder.start()
      startedAtRef.current = Date.now()
      timerRef.current = window.setInterval(() => {
        if (!startedAtRef.current) {
          return
        }
        setElapsedSeconds(Math.floor((Date.now() - startedAtRef.current) / 1000))
      }, 250)
      setStatus(RecorderStatus.Recording)
    } catch (error) {
      const name = error instanceof DOMException ? error.name : 'UnknownError'
      setErrorName(name)
      setStatus(RecorderStatus.Error)
      clearTimer()
    }
  }, [clearAudioUrl, clearTimer, mimeType, requestMicAccess, stream])

  const retry = useCallback(async () => {
    setErrorName(null)
    await requestMicAccess()
  }, [requestMicAccess])

  useEffect(() => {
    return () => {
      stopRecording()
      clearTimer()
      clearAudioUrl()
      stopAndReleaseStream(stream)
    }
  }, [clearAudioUrl, clearTimer, stopAndReleaseStream, stopRecording, stream])

  return {
    status,
    stream,
    audioBlob,
    audioUrl,
    errorName,
    elapsedSeconds,
    mimeType,
    requestMicAccess,
    startRecording,
    stopRecording,
    retry,
  }
}
