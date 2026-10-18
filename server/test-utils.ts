import type { Clock, Scheduler } from './engine';

/** Deterministic clock + scheduler: time only moves when the test says so. */
export function fakeTime(start = 1_000_000, opts: { ignoreCancel?: boolean } = {}) {
  let now = start;
  let tasks: { at: number; fn: () => void; cancelled: boolean; ran: boolean }[] = [];
  const clock: Clock = { now: () => now };
  const scheduler: Scheduler = {
    at(at, fn) {
      const task = { at, fn, cancelled: false, ran: false };
      tasks.push(task);
      return () => {
        if (!opts.ignoreCancel) task.cancelled = true;
      };
    },
  };
  const advanceTo = (t: number) => {
    for (;;) {
      const due = tasks.filter((x) => !x.cancelled && !x.ran && x.at <= t).sort((a, b) => a.at - b.at)[0];
      if (!due) break;
      now = Math.max(now, due.at);
      due.ran = true;
      due.fn();
    }
    now = t;
    tasks = tasks.filter((x) => !x.cancelled && !x.ran);
  };
  return {
    clock,
    scheduler,
    advanceTo,
    advance: (ms: number) => advanceTo(now + ms),
    pending: () => tasks.filter((x) => !x.cancelled && !x.ran).length,
    get now() {
      return now;
    },
  };
}
