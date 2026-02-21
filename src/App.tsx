import { useMemo } from 'react'
import { RecorderStatus, useRecorder } from './hooks/useRecorder'

type Feedback = {
  emoji: string
  message: string
  tips: string[]
}

const formatSeconds = (ms: number) => (ms / 1000).toFixed(1)

function App() {
  const {
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
    startRecording,
    retry,
  } = useRecorder({ maxDurationMs: 2000, durationToleranceMs: 220 })

  const progressPercent = Math.min((elapsedMs / maxDurationMs) * 100, 100)

  const feedback = useMemo<Feedback>(() => {
    if (status === RecorderStatus.Requesting) {
      return {
        emoji: '🫡',
        message: '마이크 권한 요청 중이에요. 팝업에서 허용을 눌러주세요.',
        tips: ['권한 허용 후 자동으로 2.0초 녹음 미션을 시작할 수 있어요.'],
      }
    }

    if (status === RecorderStatus.Ready) {
      return {
        emoji: '🎯',
        message: '준비 완료! 2초 동안 키워드를 또렷하게 말해볼까요?',
        tips: ['시작하면 2.0초 뒤 자동 종료돼요. 중간 중지는 불가능해요.'],
      }
    }

    if (status === RecorderStatus.Recording) {
      return {
        emoji: '🔥',
        message: '좋아요! 지금은 자동 녹음 중이에요. 2초만 집중해서 말해요.',
        tips: ['버튼은 잠시 잠겨 있어요. 완료되면 바로 결과를 보여줄게요.'],
      }
    }

    if (status === RecorderStatus.Processing) {
      return {
        emoji: '⏳',
        message: '길이를 확인하는 중이에요. 잠깐만 기다려주세요.',
        tips: ['2.0초 기준에서 크게 벗어나면 재녹음을 안내해요.'],
      }
    }

    if (status === RecorderStatus.Result) {
      return {
        emoji: '🌟',
        message: '완료! 2초 미션 성공이에요. 정말 잘했어요!',
        tips: ['아래 미리듣기로 확인하고, 필요하면 다시 녹음해도 돼요.'],
      }
    }

    if (status === RecorderStatus.DurationRejected) {
      return {
        emoji: '🛠️',
        message: '이번 샘플 길이가 2.0초 기준에서 많이 벗어났어요.',
        tips: [
          '앱은 학습 데이터 통일성을 위해 이 샘플을 REJECT 처리했어요.',
          '조용한 환경에서 다시 한번 또렷하게 2초 발화를 시도해 주세요.',
        ],
      }
    }

    if (status === RecorderStatus.MicDenied) {
      return {
        emoji: '🚫',
        message: '마이크 접근이 거부됐어요.',
        tips: [
          '주소창 자물쇠 아이콘에서 마이크 권한을 "허용"으로 바꿔주세요.',
          'https 환경(또는 localhost)에서만 마이크 권한 요청이 가능해요.',
        ],
      }
    }

    if (status === RecorderStatus.Unsupported) {
      return {
        emoji: '🧩',
        message: '이 브라우저는 MediaRecorder 지원이 제한돼요.',
        tips: [
          'iOS Safari 일부 버전/인앱 브라우저에서 제약이 있을 수 있어요.',
          '대체 녹음 경로(WebAudio 기반)는 추후 Task에서 제공 예정이에요.',
        ],
      }
    }

    if (status === RecorderStatus.Error) {
      if (errorName === 'PermissionTimeoutError') {
        return {
          emoji: '⌛',
          message: '권한 승인 후에도 장치 연결 응답이 지연되고 있어요.',
          tips: [
            'Chrome를 완전히 종료 후 다시 실행해 주세요.',
            'OS(맥/윈도우) 설정에서 Chrome 마이크 권한이 켜져 있는지 확인해 주세요.',
            '다른 앱이 마이크를 점유 중이면 종료 후 재시도해 주세요.',
          ],
        }
      }

      return {
        emoji: '⚠️',
        message: '녹음 처리 중 오류가 발생했어요.',
        tips: ['브라우저를 새로고침한 뒤 다시 시도해 주세요.'],
      }
    }

    return {
      emoji: '🙂',
      message: '2초 고정 녹음 미션을 시작해 볼까요?',
      tips: ['녹음을 시작하면 자동으로 2.0초 후 종료됩니다.'],
    }
  }, [errorName, status])

  const activeDotCount =
    status === RecorderStatus.Requesting
      ? 2
      : status === RecorderStatus.Ready ||
          status === RecorderStatus.Recording ||
          status === RecorderStatus.Processing ||
          status === RecorderStatus.Result ||
          status === RecorderStatus.DurationRejected
        ? 3
        : 1

  const handleMainButtonClick = async () => {
    if (status === RecorderStatus.Recording || status === RecorderStatus.Processing) {
      return
    }

    await startRecording()
  }

  return (
    <main className="app">
      <section className="kws-card">
        <header className="top-panel">
          <span className="status-badge">{status}</span>
          <span className="progress-label">2.0s Mission</span>
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
          <p className="mission-label">오늘의 발화 미션</p>
          <h1 className="mission-keyword">정확히 2.0초 말하기</h1>
        </section>

        <section className="duration-card" aria-live="polite">
          <p className="duration-text">
            {formatSeconds(Math.min(elapsedMs, maxDurationMs))}s / {formatSeconds(maxDurationMs)}s
          </p>
          <div className="duration-track">
            <span className="duration-fill" style={{ width: `${progressPercent}%` }} />
          </div>
        </section>

        <button
          type="button"
          className={`record-button ${status === RecorderStatus.Recording ? 'is-recording' : ''}`}
          onClick={handleMainButtonClick}
          disabled={status === RecorderStatus.Requesting || status === RecorderStatus.Recording}
        >
          {status === RecorderStatus.Requesting
            ? '권한 요청 중...'
            : status === RecorderStatus.Recording
              ? '2초 자동 녹음 진행중...'
              : '녹음 시작'}
        </button>

        {(status === RecorderStatus.MicDenied ||
          status === RecorderStatus.Error ||
          status === RecorderStatus.DurationRejected) && (
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
              {mimeType ?? 'default mime'} ·{' '}
              {measuredDurationMs ? `${formatSeconds(measuredDurationMs)}s` : '길이 측정 불가'}
            </p>
            {durationDiffMs !== null && (
              <p className="duration-check">2.0s 편차: {(durationDiffMs / 1000).toFixed(3)}s</p>
            )}
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
          {errorName && (
            <p className="error-code">
              에러 코드: {errorName}
              {status === RecorderStatus.Unsupported ? ' (지원 안내를 확인해 주세요)' : ''}
            </p>
          )}
        </section>
      </section>
    </main>
  )
}

export default App
