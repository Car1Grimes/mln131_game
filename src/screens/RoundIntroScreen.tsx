import { PlayIcon, PencilIcon } from '../components/icons';
import { PointsLadder } from '../components/PointsLadder';
import type { Standing } from '../game/standings';

interface Props {
  questionNumber: number;
  total: number;
  standings: Standing[];
  onStart: () => void;
  onRenameTeams: () => void;
}

/** Round introduction: shows the round number only, never the answer. */
export function RoundIntroScreen({ questionNumber, total, standings, onStart, onRenameTeams }: Props) {
  return (
    <main className="screen intro">
      <div className="spotlight" aria-hidden="true" />
      <p className="eyebrow">Câu hỏi</p>
      <div className="intro-number" key={questionNumber}>
        <span className="intro-current">{questionNumber}</span>
        <span className="intro-total">/ {total}</span>
      </div>
      <p className="intro-sub">Bốn hình ảnh lần lượt xuất hiện — tìm từ khóa kết nối chúng.</p>
      <PointsLadder cluesRevealed={0} />
      <button type="button" className="btn btn-primary btn-hero" onClick={onStart}>
        <PlayIcon /> Bắt đầu câu {questionNumber}
      </button>
      <div className="intro-standings">
        <ul className="standings-strip" aria-label="Điểm hiện tại">
          {standings.map((s) => (
            <li key={s.teamId}>
              <span className="strip-name">{s.name}</span>
              <span className="strip-score">{s.score}</span>
            </li>
          ))}
        </ul>
        <button type="button" className="btn btn-ghost btn-sm" onClick={onRenameTeams}>
          <PencilIcon /> Đổi tên đội
        </button>
      </div>
    </main>
  );
}
