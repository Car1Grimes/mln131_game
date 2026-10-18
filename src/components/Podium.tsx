import type { CSSProperties } from 'react';
import { podiumStandings, type Standing } from '../../shared/scoring';

/**
 * Winner podium. Only teams with a positive score stand on it (see podiumStandings); places follow
 * the competition rank, so tied teams share a place and the same height. With three entries the
 * classic 2nd · 1st · 3rd layout is used; otherwise entries are shown in rank order.
 */
export function Podium({ standings }: { standings: Standing[] }) {
  const entries = podiumStandings(standings);
  if (entries.length === 0) {
    return (
      <p className="podium-empty" data-testid="podium-empty">
        Không có đội nào đứng trên bục vinh quang.
      </p>
    );
  }
  const order = entries.length === 3 ? [entries[1]!, entries[0]!, entries[2]!] : entries.length === 2 ? [entries[1]!, entries[0]!] : entries;
  return (
    <div className="podium" style={{ '--cols': order.length } as CSSProperties} data-testid="podium">
      {order.map((s) => (
        <div key={s.teamId} className={`podium-col place-${s.rank}`}>
          <span className="podium-name">{s.name}</span>
          <span className="podium-score">{s.score} điểm</span>
          <div className="podium-block">
            <span className="podium-rank">{s.rank}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

/** Everyone not on the podium, including zero-point teams, with their (possibly shared) rank. */
export function RestOfStandings({ standings }: { standings: Standing[] }) {
  const onPodium = new Set(podiumStandings(standings).map((s) => s.teamId));
  const rest = standings.filter((s) => !onPodium.has(s.teamId));
  if (rest.length === 0) return null;
  return (
    <ol className="final-rest" data-testid="final-rest">
      {rest.map((s) => (
        <li key={s.teamId}>
          <span className="rest-rank">{s.rank}</span>
          <span className="rest-name">{s.name}</span>
          <span className="rest-score">{s.score}</span>
        </li>
      ))}
    </ol>
  );
}
