import { ClueGrid } from '../components/ClueGrid';
import { Countdown, type CountdownMode } from '../components/Countdown';
import { LetterSlots } from '../components/LetterSlots';
import { MiniScoreboard } from '../components/MiniScoreboard';
import { PointsLadder } from '../components/PointsLadder';
import { PauseIcon } from '../components/icons';
import type { Question, Team, TeamId } from '../game/types';
import type { PauseAvailability } from '../ui/interaction';

interface Props {
  question: Question;
  questionNumber: number;
  total: number;
  elapsedMs: number;
  remainingMs: number;
  cluesRevealed: number;
  mode: CountdownMode;
  teams: Team[];
  names: Record<TeamId, string>;
  scores: Record<TeamId, number>;
  ineligible: TeamId[];
  flashTeamId: TeamId | null;
  pause: PauseAvailability;
  onPause: () => void;
}

export function PlayScreen(p: Props) {
  const noTeam = p.pause === 'no_eligible_team';
  return (
    <main className="screen play">
      <section className="play-main">
        <div className="play-heading">
          <span className="round-label">
            Câu <strong>{p.questionNumber}</strong>
            <span className="round-total">/{p.total}</span>
          </span>
          <span className="play-hint">Tìm từ khóa kết nối bốn hình ảnh</span>
        </div>
        <ClueGrid clues={p.question.clues} revealed={p.cluesRevealed} elapsedMs={p.elapsedMs} />
        <LetterSlots answer={p.question.answer} revealed={false} />
      </section>
      <aside className="play-side">
        <Countdown remainingMs={p.remainingMs} mode={p.mode} />
        <PointsLadder cluesRevealed={p.cluesRevealed} />
        <button
          type="button"
          className="btn btn-pause"
          onClick={p.onPause}
          disabled={p.pause !== 'available'}
          aria-keyshortcuts="P"
          aria-describedby={noTeam ? 'no-team-note' : undefined}
        >
          <PauseIcon className="btn-pause-icon" />
          <span className="btn-pause-text">
            <span>TẠM DỪNG</span>
            <span className="btn-pause-sub">TRẢ LỜI</span>
          </span>
        </button>
        {noTeam && (
          <p id="no-team-note" className="side-note">
            Tất cả các đội đã hết lượt. Đồng hồ sẽ chạy đến hết giờ.
          </p>
        )}
        <MiniScoreboard teams={p.teams} names={p.names} scores={p.scores} ineligible={p.ineligible} flashTeamId={p.flashTeamId} />
      </aside>
    </main>
  );
}
