import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

export const RecorderStatus = {
  Idle: 'Idle',
  Requesting: 'Requesting',
  Ready: 'Ready',
  Recording: 'Recording',
  Processing: 'Processing',
  Result: 'Result',
  DurationRejected: 'DurationRejected',
  MicDenied: 'MicDenied',
  Unsupported: 'Unsupported',
  Error: 'Error',
} as const

export type RecorderStatus = (typeof RecorderStatus)[keyof typeof RecorderStatus]

type UseRecorderOptions = {
  maxDurationMs?: number
  durationToleranceMs?: number
}

const MIME_CANDIDATES = [
  'audio/webm;codecs=opus',
  'audio/webm',
  'audio/mp4',
  'audio/ogg;codecs=opus',
] as const
const MIC_REQUEST_TIMEOUT_MS = 30000

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

const measureDurationMs = async (blob: Blob): Promise<number | null> => {
  if (blob.size === 0 || typeof window.AudioContext === 'undefined') {
    return null
  }

  const context = new window.AudioContext()
  try {
    const buffer = await blob.arrayBuffer()
    const decoded = await context.decodeAudioData(buffer)
    return Math.round(decoded.duration * 1000)
  } catch {
    return null
  } finally {
    await context.close()
  }
}

const log = (...args: unknown[]) => {
  console.log('[useRecorder]', ...args)
}

type UseRecorderResult = {
  status: RecorderStatus
  stream: MediaStream | null
  audioBlob: Blob | null
  audioUrl: string | null
  errorName: string | null
  elapsedMs: number
  measuredDurationMs: number | null
  durationDiffMs: number | null
  mimeType: string | null
  maxDurationMs: number
  requestMicAccess: () => Promise<MediaStream | null>
  startRecording: () => Promise<void>
  retry: () => Promise<void>
}

export const useRecorder = (options?: UseRecorderOptions): UseRecorderResult => {
  const maxDurationMs = options?.maxDurationMs ?? 2000
  const durationToleranceMs = options?.durationToleranceMs ?? 220

  const [status, setStatus] = useState<RecorderStatus>(RecorderStatus.Idle)
  const [stream, setStream] = useState<MediaStream | null>(null)
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null)
  const [audioUrl, setAudioUrl] = useState<string | null>(null)
  const [errorName, setErrorName] = useState<string | null>(null)
  const [elapsedMs, setElapsedMs] = useState(0)
  const [measuredDurationMs, setMeasuredDurationMs] = useState<number | null>(null)
  const [durationDiffMs, setDurationDiffMs] = useState<number | null>(null)

  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const timerRef = useRef<number | null>(null)
  const autoStopRef = useRef<number | null>(null)
  const startedAtRef = useRef<number | null>(null)
  const audioUrlRef = useRef<string | null>(null)
  const lastMicRequestFailureRef = useRef<string | null>(null)
  const mountedRef = useRef(true)
  const streamRef = useRef<MediaStream | null>(null)
  const mimeType = useMemo(pickSupportedMimeType, [])

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearInterval(timerRef.current)
      timerRef.current = null
    }
    startedAtRef.current = null
  }, [])

  const clearAutoStop = useCallback(() => {
    if (autoStopRef.current !== null) {
      window.clearTimeout(autoStopRef.current)
      autoStopRef.current = null
    }
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

  useEffect(() => {
    streamRef.current = stream
  }, [stream])

  const requestMicAccess = useCallback(async (): Promise<MediaStream | null> => {
    log('requestMicAccess:start')
    lastMicRequestFailureRef.current = null
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      log('requestMicAccess:unsupported')
      lastMicRequestFailureRef.current = 'unsupported_api'
      setStatus(RecorderStatus.Unsupported)
      setErrorName('NotSupportedError')
      return null
    }

    setStatus(RecorderStatus.Requesting)
    setErrorName(null)

    try {
      const micPromise = navigator.mediaDevices.getUserMedia({ audio: true })
      let isTimedOut = false
      const timeoutMs = MIC_REQUEST_TIMEOUT_MS

      const timeoutPromise = new Promise<MediaStream | null>((resolve) => {
        window.setTimeout(() => {
          isTimedOut = true
          resolve(null)
        }, timeoutMs)
      })

      const newStream = await Promise.race([micPromise, timeoutPromise])

      // 일부 환경(특히 Chrome + OS 권한/장치 상태 불일치)에서는
      // getUserMedia가 오랫동안 pending 상태로 남을 수 있어 타임아웃으로 탈출한다.
      if (isTimedOut || !newStream) {
        log('requestMicAccess:timeout', { timeoutMs })
        lastMicRequestFailureRef.current = 'permission_timeout'
        setErrorName('PermissionTimeoutError')
        setStatus(RecorderStatus.Error)
        micPromise
          .then((lateStream) => stopAndReleaseStream(lateStream))
          .catch(() => {
            // late reject는 무시
          })
        return null
      }

      if (!mountedRef.current) {
        log('requestMicAccess:resolved_after_unmount')
        lastMicRequestFailureRef.current = 'resolved_after_unmount'
        stopAndReleaseStream(newStream)
        return null
      }
      log('requestMicAccess:success', {
        trackCount: newStream.getAudioTracks().length,
      })
      setStream((prev) => {
        stopAndReleaseStream(prev)
        return newStream
      })
      setStatus(RecorderStatus.Ready)
      return newStream
    } catch (error) {
      if (!mountedRef.current) {
        log('requestMicAccess:failed_after_unmount')
        lastMicRequestFailureRef.current = 'failed_after_unmount'
        return null
      }
      const name = error instanceof DOMException ? error.name : 'UnknownError'
      log('requestMicAccess:error', { name })
      lastMicRequestFailureRef.current = `request_error:${name}`
      setErrorName(name)
      setStatus(RecorderStatus.MicDenied)
      return null
    }
  }, [stopAndReleaseStream])

  const stopRecorderSafely = useCallback(() => {
    const recorder = mediaRecorderRef.current
    if (!recorder || recorder.state === 'inactive') {
      log('stopRecorderSafely:skipped')
      return
    }
    log('stopRecorderSafely:stop_call', { state: recorder.state })
    recorder.stop()
  }, [])

  const startRecording = useCallback(async () => {
    log('startRecording:called', { status })
    if (status === RecorderStatus.Requesting || status === RecorderStatus.Recording) {
      log('startRecording:blocked', { status })
      return
    }

    let activeStream = streamRef.current
    if (!activeStream) {
      activeStream = await requestMicAccess()
    }

    if (!activeStream) {
      log('startRecording:no_stream', {
        reasonHint: 'requestMicAccess returned null',
        failureReason: lastMicRequestFailureRef.current,
        status,
        errorName,
      })
      return
    }

    if (typeof MediaRecorder === 'undefined') {
      log('startRecording:mediarecorder_undefined')
      setStatus(RecorderStatus.Unsupported)
      setErrorName('NotSupportedError')
      return
    }

    try {
      clearTimer()
      clearAutoStop()
      setElapsedMs(0)
      setMeasuredDurationMs(null)
      setDurationDiffMs(null)
      setAudioBlob(null)
      clearAudioUrl()
      setAudioUrl(null)
      chunksRef.current = []
      setErrorName(null)

      const recorder = mimeType
        ? new MediaRecorder(activeStream, { mimeType })
        : new MediaRecorder(activeStream)
      mediaRecorderRef.current = recorder
      log('startRecording:recorder_created', {
        recorderMimeType: recorder.mimeType || 'default',
        selectedMimeType: mimeType ?? 'default',
      })

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data)
          log('recorder:ondataavailable', { chunkSize: event.data.size })
        }
      }

      recorder.onstop = async () => {
        log('recorder:onstop')
        clearTimer()
        clearAutoStop()
        if (!mountedRef.current) {
          log('recorder:onstop_after_unmount')
          return
        }

        setStatus(RecorderStatus.Processing)
        const resultBlob = new Blob(chunksRef.current, {
          type: recorder.mimeType || mimeType || 'audio/webm',
        })
        log('recorder:blob_created', { size: resultBlob.size, chunks: chunksRef.current.length })
        setAudioBlob(resultBlob)

        const newUrl = URL.createObjectURL(resultBlob)
        clearAudioUrl()
        audioUrlRef.current = newUrl
        setAudioUrl(newUrl)

        const duration = await measureDurationMs(resultBlob)
        if (!mountedRef.current) {
          log('recorder:duration_after_unmount')
          return
        }
        setMeasuredDurationMs(duration)
        log('recorder:duration_measured', { durationMs: duration })

        // 전략: Task3에서는 길이 보정을 하지 않고, 2.0s에서 크게 벗어난 샘플은 REJECT 처리.
        // Task4(WAV/리샘플링)에서 pad/trim 및 포맷 정규화를 수행할 예정.
        if (duration !== null) {
          const diff = Math.abs(duration - maxDurationMs)
          setDurationDiffMs(diff)
          if (diff > durationToleranceMs) {
            log('recorder:duration_rejected', { diff, durationToleranceMs })
            setStatus(RecorderStatus.DurationRejected)
            return
          }
        } else {
          log('recorder:duration_unavailable')
          setDurationDiffMs(null)
        }

        log('recorder:result_ok')
        setStatus(RecorderStatus.Result)
      }

      recorder.onerror = (event) => {
        if (!mountedRef.current) {
          log('recorder:onerror_after_unmount')
          return
        }
        const domError = (event as Event & { error?: DOMException }).error
        log('recorder:onerror', { name: domError?.name ?? 'RecorderError' })
        setErrorName(domError?.name ?? 'RecorderError')
        setStatus(RecorderStatus.Error)
        clearTimer()
        clearAutoStop()
      }

      recorder.start()
      log('recorder:start')
      startedAtRef.current = Date.now()
      setStatus(RecorderStatus.Recording)

      timerRef.current = window.setInterval(() => {
        if (!startedAtRef.current) {
          return
        }
        const elapsed = Date.now() - startedAtRef.current
        setElapsedMs(Math.min(elapsed, maxDurationMs))
      }, 100)

      autoStopRef.current = window.setTimeout(() => {
        log('recorder:auto_stop_timeout', { maxDurationMs })
        setElapsedMs(maxDurationMs)
        stopRecorderSafely()
      }, maxDurationMs)
    } catch (error) {
      if (!mountedRef.current) {
        log('startRecording:error_after_unmount')
        return
      }
      const name = error instanceof DOMException ? error.name : 'UnknownError'
      log('startRecording:error', { name })
      setErrorName(name)
      setStatus(RecorderStatus.Error)
      clearTimer()
      clearAutoStop()
    }
  }, [
    clearAudioUrl,
    clearAutoStop,
    clearTimer,
    durationToleranceMs,
    maxDurationMs,
    mimeType,
    requestMicAccess,
    errorName,
    status,
    stopRecorderSafely,
  ])

  const retry = useCallback(async () => {
    log('retry:called')
    setErrorName(null)
    if (!streamRef.current) {
      log('retry:request_mic_again')
      await requestMicAccess()
      return
    }
    log('retry:to_ready')
    setStatus(RecorderStatus.Ready)
  }, [requestMicAccess])

  useEffect(() => {
    mountedRef.current = true
    log('lifecycle:mounted')
    return () => {
      log('cleanup:start')
      mountedRef.current = false
      clearTimer()
      clearAutoStop()
      clearAudioUrl()
      const recorder = mediaRecorderRef.current
      if (recorder && recorder.state !== 'inactive') {
        log('cleanup:stop_active_recorder')
        recorder.ondataavailable = null
        recorder.onstop = null
        recorder.onerror = null
        recorder.stop()
      }
      stopAndReleaseStream(streamRef.current)
      log('cleanup:done')
    }
  }, [clearAudioUrl, clearAutoStop, clearTimer, stopAndReleaseStream])

  return {
    status,
    stream,
    audioBlob,
    audioUrl,
    errorName,
    elapsedMs,
    measuredDurationMs,
    durationDiffMs,
    mimeType,
    maxDurationMs,
    requestMicAccess,
    startRecording,
    retry,
  }
}
