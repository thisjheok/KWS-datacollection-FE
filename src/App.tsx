import { useMemo, useState } from 'react'

const KwsStage = {
  Ready: 'Ready',
  Recording: 'Recording',
  Processing: 'Processing',
  Result: 'Result',
} as const

type KwsStage = (typeof KwsStage)[keyof typeof KwsStage]

const stageFlow = [
  KwsStage.Ready,
  KwsStage.Recording,
  KwsStage.Processing,
  KwsStage.Result,
] as const

const stageFeedback: Record<KwsStage, { emoji: string; message: string }> = {
  [KwsStage.Ready]: {
    emoji: '🙂',
    message: '준비 완료! 버튼을 눌러 오늘의 미션을 시작해요.',
  },
  [KwsStage.Recording]: {
    emoji: '🎙️',
    message: '좋아요! 또렷하게 키워드를 말해보세요.',
  },
  [KwsStage.Processing]: {
    emoji: '⏳',
    message: '분석 중이에요... 잠깐만 기다려 주세요!',
  },
  [KwsStage.Result]: {
    emoji: '🌟',
    message: '멋져요! 오늘의 발화가 깔끔하게 저장됐어요.',
  },
}

function App() {
  const [stage, setStage] = useState<KwsStage>(KwsStage.Ready)

  const currentStep = stageFlow.indexOf(stage) + 1
  const feedback = useMemo(() => stageFeedback[stage], [stage])

  const handleRecordButtonClick = () => {
    setStage((prev) => {
      const index = stageFlow.indexOf(prev)
      const nextIndex = (index + 1) % stageFlow.length
      return stageFlow[nextIndex]
    })
  }

  return (
    <main className="app">
      <section className="kws-card">
        <header className="top-panel">
          <span className="status-badge">{stage}</span>
          <span className="progress-label">
            Step {currentStep}/{stageFlow.length}
          </span>
        </header>

        <div className="progress-track" aria-hidden="true">
          {stageFlow.map((item, index) => (
            <span
              key={item}
              className={`progress-dot ${index < currentStep ? 'is-active' : ''}`}
            />
          ))}
        </div>

        <section className="mission-card">
          <p className="mission-label">지금 말할 문장</p>
          <h1 className="mission-keyword">두 배 확대</h1>
        </section>

        <button
          type="button"
          className="record-button"
          onClick={handleRecordButtonClick}
        >
          {stage === KwsStage.Recording ? '녹음 종료' : '녹음 시작'}
        </button>

        <section className="result-card" aria-live="polite">
          <p className="result-emoji">{feedback.emoji}</p>
          <p className="result-message">{feedback.message}</p>
        </section>
      </section>
    </main>
  )
}

export default App
