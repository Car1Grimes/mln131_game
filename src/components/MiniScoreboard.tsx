import type { Team, TeamId } from '../game/types';

interface Props {
  teams: Team[];
  names: Record<TeamId, string>;
  scores: Record<TeamId, number>;
  ineligible: TeamId[];
  /** Team that just answered wrong, for a short shake. */
  flashTeamId?: TeamId | null;
}

/** Compact five-team scoreboard in fixed team order (no reordering during play). */
export function MiniScoreboard({ teams, names, scores, ineligible, flashTeamId }: Props) {
  const top = Math.max(0, ...teams.map((t) => scores[t.id] ?? 0));
  return (
    <section className="mini-board" aria-label="Bảng điểm">
      <h2 className="panel-title">Bảng điểm</h2>
      <ul>
        {teams.map((t) => {
          const out = ineligible.includes(t.id);
          const score = scores[t.id] ?? 0;
          return (
            <li
              key={t.id}
              className={`mini-row${out ? ' is-out' : ''}${top > 0 && score === top ? ' is-leader' : ''}${flashTeamId === t.id ? ' is-flash' : ''}`}
            >
              <span className="mini-name" title={names[t.id]}>
                {names[t.id]}
              </span>
              {out && <span className="chip chip-out">Hết lượt</span>}
              <span className="mini-score">{score}</span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
