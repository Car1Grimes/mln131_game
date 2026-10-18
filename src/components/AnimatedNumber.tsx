import { useEffect, useState } from 'react';
import { usePrefersReducedMotion } from '../hooks/useReducedMotion';

/** Counts from `from` to `to` once `start` is true. Purely visual. */
export function AnimatedNumber({ from, to, start, durationMs = 700 }: { from: number; to: number; start: boolean; durationMs?: number }) {
  const reduced = usePrefersReducedMotion();
  const [value, setValue] = useState(reduced ? to : from);
  useEffect(() => {
    if (!start || reduced || from === to) {
      setValue(start || reduced ? to : from);
      return;
    }
    let raf = 0;
    const t0 = performance.now();
    const step = (t: number) => {
      const p = Math.min(1, (t - t0) / durationMs);
      setValue(Math.round(from + (to - from) * (1 - (1 - p) ** 3)));
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [from, to, start, reduced, durationMs]);
  return <>{value}</>;
}
