import { useEffect, useState, type CSSProperties } from 'react';
import type { Standing } from '../../shared/scoring';
import { usePrefersReducedMotion } from '../hooks/useReducedMotion';
import { AnimatedNumber } from './AnimatedNumber';

/**
 * Animated leaderboard: rows start at their previous positions/scores and slide to the new ranking.
 * Rows are absolutely positioned by index, so rank changes animate with a transform transition.
 */
export function Leaderboard({ before, after }: { before: Standing[]; after: Standing[] }) {
  const reduced = usePrefersReducedMotion();
  const [settled, setSettled] = useState(reduced);
  useEffect(() => {
    if (reduced) return setSettled(true);
    const id = window.setTimeout(() => setSettled(true), 450);
    return () => window.clearTimeout(id);
  }, [reduced]);

  return (
    <ol className="leaderboard" style={{ '--rows': after.length } as CSSProperties} aria-label="Bảng xếp hạng">
      {after.map((row) => {
        const prevIndex = before.findIndex((b) => b.teamId === row.teamId);
        const prev = before[prevIndex];
        const index = after.indexOf(row);
        const pos = settled ? index : Math.max(0, prevIndex);
        const delta = row.score - (prev?.score ?? 0);
        return (
          <li
            key={row.teamId}
            className={`lb-row${row.rank === 1 && row.score > 0 ? ' is-first' : ''}${delta > 0 && settled ? ' is-gain' : ''}`}
            style={{ '--pos': pos } as CSSProperties}
          >
            <span className="lb-rank">{settled ? row.rank : (prev?.rank ?? row.rank)}</span>
            <span className="lb-name">{row.name}</span>
            {delta > 0 && <span className={`lb-delta${settled ? ' is-shown' : ''}`}>+{delta}</span>}
            <span className="lb-score">
              <AnimatedNumber from={prev?.score ?? 0} to={row.score} start={settled} />
            </span>
          </li>
        );
      })}
    </ol>
  );
}
