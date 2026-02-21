import { useMemo, useState } from 'react'
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
    gateResult,
    outputSampleRate,
    maxDurationMs,
    startRecording,
    retry,
  } = useRecorder({ maxDurationMs: 2000 })
  const [showDebugMetrics, setShowDebugMetrics] = useState(false)

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
        message: '잠깐만요! 녹음 파일을 16kHz mono WAV로 정리하고 있어요.',
        tips: ['거의 끝났어요. 변환이 완료되면 바로 미리듣기를 보여드릴게요.'],
      }
    }

    if (status === RecorderStatus.Result) {
      if (gateResult?.decision === 'PASS') {
        return {
          emoji: '🥳',
          message: gateResult.userMessage,
          tips: ['아주 좋아요! 같은 톤으로 다음 샘플도 가볼까요?'],
        }
      }
      if (gateResult?.decision === 'AMBIG') {
        return {
          emoji: '🙂',
          message: gateResult.userMessage,
          tips: ['좋은 시도예요. 한 번만 더 또렷하게 말하면 통과 가능해요!'],
        }
      }
      if (gateResult?.decision === 'REJECT') {
        return {
          emoji: '🧃',
          message: gateResult.userMessage,
          tips: ['괜찮아요. 숨 고르고, 마이크 가까이에서 다시 해봐요!'],
        }
      }
      return {
        emoji: '🌟',
        message: '분석이 완료됐어요!',
        tips: ['결과가 보이지 않으면 한 번 더 녹음해 주세요.'],
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
  }, [errorName, gateResult, status])

  const activeDotCount =
    status === RecorderStatus.Requesting
      ? 2
      : status === RecorderStatus.Ready ||
          status === RecorderStatus.Recording ||
          status === RecorderStatus.Processing ||
          status === RecorderStatus.Result
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
          disabled={
            status === RecorderStatus.Requesting ||
            status === RecorderStatus.Recording ||
            status === RecorderStatus.Processing
          }
        >
          {status === RecorderStatus.Requesting
            ? '권한 요청 중...'
            : status === RecorderStatus.Recording
              ? '2초 자동 녹음 진행중...'
              : status === RecorderStatus.Processing
                ? 'WAV 변환 처리중...'
              : '녹음 시작'}
        </button>

        {status === RecorderStatus.Processing && (
          <section className="processing-card" aria-live="polite">
            <p className="processing-title">금방 끝나요. 소리를 예쁘게 다듬는 중이에요</p>
            <div className="loading-dots" aria-hidden="true">
              <span />
              <span />
              <span />
            </div>
          </section>
        )}

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
              {audioBlob ? `${Math.round(audioBlob.size / 1024)}KB` : '0KB'} · 16-bit PCM WAV ·{' '}
              {outputSampleRate ? `${outputSampleRate}Hz mono` : 'sample rate unknown'} ·{' '}
              {measuredDurationMs ? `${formatSeconds(measuredDurationMs)}s` : '길이 측정 불가'}
            </p>
            <a className="download-button" href={audioUrl} download="sample.wav">
              WAV 다운로드 (sample.wav)
            </a>
            <p className="debug-caption">디버그용 파일 저장 버튼입니다.</p>

            <label className="debug-toggle">
              <input
                type="checkbox"
                checked={showDebugMetrics}
                onChange={(event) => setShowDebugMetrics(event.target.checked)}
              />
              개발자 토글(디버그 보기)
            </label>

            {showDebugMetrics && gateResult && (
              <dl className="debug-metrics">
                <div>
                  <dt>decision</dt>
                  <dd>{gateResult.decision}</dd>
                </div>
                <div>
                  <dt>reason</dt>
                  <dd>{gateResult.reason}</dd>
                </div>
                <div>
                  <dt>rms</dt>
                  <dd>{gateResult.debugMetrics.rms.toFixed(4)}</dd>
                </div>
                <div>
                  <dt>absMax</dt>
                  <dd>{gateResult.debugMetrics.absMax.toFixed(4)}</dd>
                </div>
                <div>
                  <dt>clipRatio</dt>
                  <dd>{(gateResult.debugMetrics.clipRatio * 100).toFixed(3)}%</dd>
                </div>
                <div>
                  <dt>speechRatio</dt>
                  <dd>{(gateResult.debugMetrics.speechRatio * 100).toFixed(1)}%</dd>
                </div>
                <div>
                  <dt>firstSpeechMs</dt>
                  <dd>{gateResult.debugMetrics.firstSpeechMs ?? '-'}</dd>
                </div>
                <div>
                  <dt>lastSpeechMs</dt>
                  <dd>{gateResult.debugMetrics.lastSpeechMs ?? '-'}</dd>
                </div>
              </dl>
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

          {status === RecorderStatus.Result && gateResult?.decision === 'PASS' && (
            <button type="button" className="cta-button is-pass" onClick={startRecording}>
              다음!
            </button>
          )}

          {status === RecorderStatus.Result &&
            (gateResult?.decision === 'AMBIG' || gateResult?.decision === 'REJECT') && (
              <button type="button" className="cta-button is-retry" onClick={startRecording}>
                다시 말하기
              </button>
            )}
        </section>
      </section>
    </main>
  )
}

export default App
