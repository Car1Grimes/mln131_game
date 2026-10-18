import { POINTS_BY_CLUES } from '../game/rules';

/** 40/30/20/10 ladder. `cluesRevealed` = 0 shows the ladder without highlighting a step. */
export function PointsLadder({ cluesRevealed }: { cluesRevealed: number }) {
  return (
    <ol className="ladder" aria-label="Điểm theo số gợi ý đã mở">
      {POINTS_BY_CLUES.map((points, i) => {
        const status = cluesRevealed === 0 ? 'future' : i === cluesRevealed - 1 ? 'active' : i < cluesRevealed - 1 ? 'past' : 'future';
        return (
          <li key={points} className={`ladder-step is-${status}`} aria-current={status === 'active' ? 'step' : undefined}>
            <span className="ladder-points">{points}</span>
            <span className="ladder-label">Gợi ý {i + 1}</span>
          </li>
        );
      })}
    </ol>
  );
}
