import type { CSSProperties } from 'react';

const COLORS = ['#f5c542', '#3ad7ff', '#ffffff', '#2f7bff', '#ffd98a'];

/** Decorative CSS confetti, deterministic, hidden from assistive tech and disabled for reduced motion via CSS. */
export function Confetti({ count = 70 }: { count?: number }) {
  return (
    <div className="confetti" aria-hidden="true">
      {Array.from({ length: count }, (_, i) => {
        const r = (n: number) => ((i * 9301 + n * 49297) % 233280) / 233280;
        return (
          <span
            key={i}
            style={
              {
                '--x': `${r(1) * 100}%`,
                '--delay': `${r(2) * 1.2}s`,
                '--dur': `${2.4 + r(3) * 1.8}s`,
                '--rot': `${r(4) * 720 - 360}deg`,
                '--drift': `${r(5) * 16 - 8}vw`,
                background: COLORS[i % COLORS.length],
              } as CSSProperties
            }
          />
        );
      })}
    </div>
  );
}
