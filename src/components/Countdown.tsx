
export type CountdownMode = 'idle' | 'running' | 'paused' | 'done';

const R = 45;
const CIRC = 2 * Math.PI * R;

export function Countdown({ remainingMs, mode, totalMs = 40_000 }: { remainingMs: number; mode: CountdownMode; totalMs?: number }) {
  const seconds = Math.ceil(remainingMs / 1000);
  const fraction = Math.min(1, remainingMs / totalMs);
  const urgent = mode === 'running' && remainingMs > 0 && remainingMs <= 10_000;
  const caption = mode === 'paused' ? 'Đã dừng' : mode === 'done' ? 'Hết giờ' : 'giây';
  return (
    <div className={`countdown is-${mode}${urgent ? ' is-urgent' : ''}`} role="timer" aria-label={`Còn ${seconds} giây`}>
      <svg viewBox="0 0 100 100" className="countdown-ring" aria-hidden="true">
        <circle cx="50" cy="50" r={R} className="countdown-track" />
        <circle
          cx="50"
          cy="50"
          r={R}
          className="countdown-progress"
          strokeDasharray={CIRC}
          strokeDashoffset={CIRC * (1 - fraction)}
        />
      </svg>
      <div className="countdown-center">
        {/* Keyed by second so the urgency pulse restarts every second. */}
        <span key={urgent ? seconds : 'n'} className="countdown-number">
          {seconds}
        </span>
        <span className="countdown-caption">{caption}</span>
      </div>
    </div>
  );
}
