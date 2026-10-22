import type { IntroView } from '../../shared/protocol';

/**
 * The 5-second preparation before a round, identical on the projector, player and admin views.
 * Driven only by the server's intro times and the measured clock offset: a late joiner sees the
 * remaining seconds, never a fresh 5. The switch to the round is the server's next view, not this timer.
 */
export function QuestionIntro({ intro, serverNow }: { intro: IntroView; serverNow: number }) {
  const total = intro.startsAt - intro.introStartedAt;
  const remaining = Math.max(0, intro.startsAt - serverNow);
  const seconds = Math.max(1, Math.min(Math.ceil(total / 1000), Math.ceil(remaining / 1000)));
  const fraction = total > 0 ? Math.min(1, remaining / total) : 0;
  return (
    <section className="qintro" data-testid="question-intro" data-question={intro.questionNumber}>
      <p className="eyebrow qintro-label">Chuẩn bị</p>
      <h1 className="qintro-number">
        Câu <strong>{intro.questionNumber}</strong>
        <span className="round-total">/{intro.totalQuestions}</span>
      </h1>
      {intro.prompt && (
        <p className="qintro-prompt" data-testid="intro-prompt">
          {intro.prompt}
        </p>
      )}
      <div className="qintro-count" role="timer" aria-label={`Bắt đầu sau ${seconds} giây`} data-testid="intro-countdown" data-seconds={seconds}>
        {/* Keyed by second so the pop animation restarts on each change. */}
        <span key={seconds} className="qintro-digit">
          {seconds}
        </span>
      </div>
      <div className="qintro-bar" aria-hidden="true">
        <span style={{ transform: `scaleX(${fraction})` }} />
      </div>
      <p className="screen-sub qintro-hint">{remaining > 0 ? 'Hãy sẵn sàng quan sát các gợi ý' : 'Bắt đầu!'}</p>
    </section>
  );
}

/** Orientation question kept above the scene stage while the round is active. */
export function QuestionPrompt({ prompt }: { prompt: string }) {
  if (!prompt) return null;
  return (
    <p className="question-prompt" data-testid="question-prompt" title={prompt}>
      {prompt}
    </p>
  );
}
