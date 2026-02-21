import { useMemo } from 'react'
import { RecorderStatus, useRecorder } from './hooks/useRecorder'

type Feedback = {
  emoji: string
  message: string
  tips: string[]
}

const getDeniedTips = (errorName: string | null): Feedback => {
  if (errorName === 'NotAllowedError' || errorName === 'SecurityError') {
    return {
      emoji: '🚫',
      message: '마이크 권한이 아직 꺼져 있어요. 설정에서 허용하면 바로 녹음할 수 있어요.',
      tips: [
        '주소창 자물쇠 아이콘에서 마이크 권한을 "허용"으로 바꿔주세요.',
        'https 환경(또는 localhost)에서만 마이크 권한 요청이 가능해요.',
      ],
    }
  }

  if (errorName === 'NotFoundError') {
    return {
      emoji: '🎧',
      message: '사용 가능한 마이크를 찾지 못했어요.',
      tips: [
        '이어폰/외장 마이크 연결 상태를 확인해 주세요.',
        '다른 앱이 오디오 장치를 사용 중이면 종료 후 재시도해 주세요.',
      ],
    }
  }

  return {
    emoji: '🤔',
    message: '마이크를 준비하는 중 문제가 생겼어요.',
    tips: [
      '브라우저 권한과 https 환경을 확인해 주세요.',
      '문제가 계속되면 브라우저를 다시 열고 재시도해 주세요.',
    ],
  }
}

function App() {
  const {
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
  } = useRecorder()

  const feedback = useMemo<Feedback>(() => {
    if (status === RecorderStatus.Requesting) {
      return {
        emoji: '🫡',
        message: '권한 요청 중이에요. 브라우저 팝업에서 허용을 눌러주세요.',
        tips: ['팝업이 안 보이면 주소창 권한 아이콘을 확인해 주세요.'],
      }
    }

    if (status === RecorderStatus.Ready) {
      return {
        emoji: '🎤',
        message: 'MicReady! 이제 녹음 시작 버튼으로 실제 녹음을 진행할 수 있어요.',
        tips: ['지금 단계에서는 MediaRecorder로 음성 Blob만 생성합니다.'],
      }
    }

    if (status === RecorderStatus.Recording) {
      return {
        emoji: '🔥',
        message: '녹음 진행 중! 천천히 또렷하게 말해보세요.',
        tips: ['중지 버튼을 누르면 즉시 미리 듣기 플레이어가 생성돼요.'],
      }
    }

    if (status === RecorderStatus.Stopped) {
      return {
        emoji: '🌟',
        message: '녹음 완료! 아래에서 바로 재생해볼 수 있어요.',
        tips: ['다시 녹음 시작을 누르면 이전 녹음은 새 Blob으로 교체됩니다.'],
      }
    }

    if (status === RecorderStatus.MicDenied || status === RecorderStatus.Error) {
      return getDeniedTips(errorName)
    }

    if (status === RecorderStatus.Unsupported) {
      return {
        emoji: '🧩',
        message: '현재 브라우저에서 MediaRecorder를 지원하지 않아요.',
        tips: ['최신 Chrome/Safari/Edge에서 다시 시도해 주세요.'],
      }
    }

    return {
      emoji: '🙂',
      message: '녹음 시작을 누르면 마이크 권한 확인 후 녹음을 시작해요.',
      tips: ['권한 허용 후 타이머가 올라가면 정상 녹음 중입니다.'],
    }
  }, [errorName, status])

  const activeDotCount =
    status === RecorderStatus.Requesting
      ? 2
      : status === RecorderStatus.Ready ||
          status === RecorderStatus.Recording ||
          status === RecorderStatus.Stopped
        ? 3
        : 1

  const handleMainButtonClick = async () => {
    if (status === RecorderStatus.Recording) {
      stopRecording()
      return
    }

    if (status === RecorderStatus.Ready || status === RecorderStatus.Stopped) {
      await startRecording()
      return
    }

    await requestMicAccess()
  }

  return (
    <main className="app">
      <section className="kws-card">
        <header className="top-panel">
          <span className="status-badge">{status}</span>
          <span className="progress-label">Recorder</span>
        </header>

        <div className="progress-track" aria-hidden="true">
          {[RecorderStatus.Idle, RecorderStatus.Requesting, RecorderStatus.Ready].map(
            (item, index) => (
              <span
                key={item}
                className={`progress-dot ${index < activeDotCount ? 'is-active' : ''}`}
              />
            ),
          )}
        </div>

        {stream && (status === RecorderStatus.Ready || status === RecorderStatus.Recording) ? (
          <p className="stream-chip" aria-live="polite">
            입력 장치 연결됨 · audio track {stream.getAudioTracks().length}개
          </p>
        ) : null}

        <section className="mission-card">
          <p className="mission-label">지금 미션</p>
          <h1 className="mission-keyword">키워드 녹음하기</h1>
        </section>

        {status === RecorderStatus.Recording ? (
          <section className="recording-live" aria-live="polite">
            <p className="recording-title">녹음 진행중</p>
            <p className="recording-timer">{elapsedSeconds}s</p>
          </section>
        ) : null}

        <button
          type="button"
          className={`record-button ${status === RecorderStatus.Recording ? 'is-recording' : ''}`}
          onClick={handleMainButtonClick}
          disabled={status === RecorderStatus.Requesting}
        >
          {status === RecorderStatus.Requesting
            ? '권한 요청 중...'
            : status === RecorderStatus.Recording
              ? '녹음 중지'
              : '녹음 시작'}
        </button>

        {(status === RecorderStatus.MicDenied || status === RecorderStatus.Error) && (
          <button type="button" className="retry-button" onClick={retry}>
            재시도
          </button>
        )}

        {audioUrl ? (
          <section className="preview-card">
            <p className="preview-title">미리 듣기</p>
            <audio controls src={audioUrl} className="audio-player">
              브라우저가 오디오 재생을 지원하지 않습니다.
            </audio>
            <p className="preview-meta">
              {audioBlob ? `${Math.round(audioBlob.size / 1024)}KB` : '0KB'} ·{' '}
              {mimeType ?? 'default mime'}
            </p>
          </section>
        ) : null}

        <section className="result-card" aria-live="polite">
          <p className="result-emoji">{feedback.emoji}</p>
          <p className="result-message">{feedback.message}</p>
          <ul className="helper-list">
            {feedback.tips.map((tip) => (
              <li key={tip}>{tip}</li>
            ))}
          </ul>
          {errorName && (status === RecorderStatus.MicDenied || status === RecorderStatus.Error) ? (
            <p className="error-code">에러 코드: {errorName}</p>
          ) : null}
        </section>
      </section>
    </main>
  )
}

export default App
