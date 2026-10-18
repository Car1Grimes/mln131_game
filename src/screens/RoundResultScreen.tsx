import { useState } from 'react';
import { ClueGrid } from '../components/ClueGrid';
import { Leaderboard } from '../components/Leaderboard';
import { LetterSlots } from '../components/LetterSlots';
import { TrophyIcon } from '../components/icons';
import type { Standing } from '../game/standings';
import type { Question, QuestionResult } from '../game/types';

interface Props {
  question: Question;
  questionNumber: number;
  result: QuestionResult;
  winnerName: string | null;
  before: Standing[];
  after: Standing[];
  isLastStep: boolean;
  onNext: () => void;
  onFinal: () => void;
}

/** Answer reveal, then the animated leaderboard. Local view step only; game state is unchanged. */
export function RoundResultScreen(p: Props) {
  const [step, setStep] = useState<'answer' | 'leaderboard'>('answer');
  const correct = p.result.outcome === 'correct' ? p.result : null;

  if (step === 'leaderboard') {
    return (
      <main className="screen leaderboard-screen">
        <p className="eyebrow">Sau câu {p.questionNumber}</p>
        <h1 className="screen-title">Bảng xếp hạng</h1>
        <Leaderboard before={p.before} after={p.after} />
        <div className="result-actions">
          <button type="button" className="btn btn-ghost btn-lg" onClick={() => setStep('answer')}>
            Xem lại đáp án
          </button>
          {p.isLastStep ? (
            <button type="button" className="btn btn-gold btn-lg" onClick={p.onFinal} data-autofocus>
              <TrophyIcon /> Kết quả chung cuộc
            </button>
          ) : (
            <button type="button" className="btn btn-primary btn-lg" onClick={p.onNext}>
              Câu tiếp theo
            </button>
          )}
        </div>
      </main>
    );
  }

  return (
    <main className={`screen result ${correct ? 'is-correct' : 'is-timeout'}`}>
      <div className="spotlight" aria-hidden="true" />
      <p className="eyebrow">Đáp án câu {p.questionNumber}</p>
      <LetterSlots answer={p.question.answer} revealed size="large" />
      <div className="result-card" role="status">
        {correct ? (
          <>
            <span className="result-team">{p.winnerName}</span>
            <span className="result-points">+{correct.points}</span>
            <span className="result-detail">
              Trả lời đúng khi {correct.cluesRevealed} gợi ý đã mở · {(correct.elapsedMs / 1000).toFixed(1).replace('.', ',')} giây
            </span>
          </>
        ) : (
          <>
            <span className="result-team">Hết giờ</span>
            <span className="result-detail">Không đội nào ghi điểm ở câu này.</span>
          </>
        )}
      </div>
      <ClueGrid clues={p.question.clues} revealed={4} compact />
      <div className="result-actions">
        <button type="button" className="btn btn-primary btn-lg" onClick={() => setStep('leaderboard')}>
          Xem bảng xếp hạng
        </button>
      </div>
    </main>
  );
}
