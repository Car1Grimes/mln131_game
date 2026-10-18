import { Countdown } from './Countdown';

/** Countdown driven by the server deadline and the measured server-clock offset. */
export function RoundTimer({ deadlineAt, serverNow, closed, durationMs }: { deadlineAt: number; serverNow: number; closed: boolean; durationMs: number }) {
  const remaining = closed ? 0 : Math.max(0, deadlineAt - serverNow);
  return <Countdown remainingMs={remaining} mode={closed || remaining === 0 ? 'done' : 'running'} totalMs={durationMs} />;
}
