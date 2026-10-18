import type { Standing } from '../../shared/scoring';

/** Top-3 podium, displayed 2nd · 1st · 3rd. Labels use the competition rank so ties read correctly. */
export function Podium({ standings }: { standings: Standing[] }) {
  const top = standings.slice(0, 3);
  const order = [top[1], top[0], top[2]];
  return (
    <div className="podium">
      {order.map((s, i) =>
        s ? (
          <div key={s.teamId} className={`podium-col place-${s.rank}${i === 1 ? ' is-center' : ''}`}>
            <span className="podium-name">{s.name}</span>
            <span className="podium-score">{s.score} điểm</span>
            <div className="podium-block">
              <span className="podium-rank">{s.rank}</span>
            </div>
          </div>
        ) : (
          <div key={`empty-${i}`} className="podium-col is-empty" />
        ),
      )}
    </div>
  );
}
