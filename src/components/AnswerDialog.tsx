import { useState, type FormEvent } from 'react';
import { cluesRevealedAt, pointsForClues, remainingMs } from '../game/rules';
import type { Team, TeamId } from '../game/types';
import { Modal } from './Modal';

interface Props {
  teams: Team[];
  names: Record<TeamId, string>;
  ineligible: TeamId[];
  elapsedMs: number;
  restored: boolean;
  rejectedMessage: string | null;
  onSubmit: (teamId: TeamId, answer: string) => void;
  onResume: () => void;
}

/** Shown only in `paused_for_answer`: the clock is stopped by the state machine, not by this component. */
export function AnswerDialog({ teams, names, ineligible, elapsedMs, restored, rejectedMessage, onSubmit, onResume }: Props) {
  const [teamId, setTeamId] = useState<TeamId | null>(null);
  const [answer, setAnswer] = useState('');
  const clues = cluesRevealedAt(elapsedMs);
  const remaining = Math.ceil(remainingMs(elapsedMs) / 1000);
  const missing = !teamId ? 'Chọn đội trả lời' : !answer.trim() ? 'Nhập câu trả lời' : null;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (teamId && !missing) onSubmit(teamId, answer);
  };

  return (
    // Escape intentionally does nothing here: resuming the clock must be a deliberate click.
    <Modal title="Đồng hồ đã dừng — Trả lời" wide>
      <div className="answer-status">
        <span className="status-chip status-frozen">
          <span className="status-dot" aria-hidden="true" /> Còn {remaining} giây
        </span>
        <span className="status-chip">{clues} gợi ý đã mở</span>
        <span className="status-chip status-points">Trị giá {pointsForClues(clues)} điểm</span>
      </div>
      {restored && (
        <p className="notice" role="status">
          Trò chơi đã được khôi phục sau khi tải lại trang. Đồng hồ vẫn đang dừng — hãy chấm đáp án hoặc tiếp tục tính giờ.
        </p>
      )}
      <form onSubmit={submit} className="answer-form">
        <fieldset className="team-picker">
          <legend>Đội trả lời</legend>
          <div className="team-options">
            {teams.map((t) => {
              const out = ineligible.includes(t.id);
              return (
                <label key={t.id} className={`team-option${out ? ' is-disabled' : ''}${teamId === t.id ? ' is-selected' : ''}`}>
                  <input type="radio" name="team" value={t.id} disabled={out} checked={teamId === t.id} onChange={() => setTeamId(t.id)} />
                  <span className="team-option-name">{names[t.id]}</span>
                  {out && <span className="chip chip-out">Hết lượt</span>}
                </label>
              );
            })}
          </div>
        </fieldset>
        <label className="field field-answer">
          <span>Câu trả lời</span>
          <input
            type="text"
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
            placeholder="Nhập câu trả lời của đội…"
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            maxLength={120}
            data-autofocus
          />
        </label>
        {rejectedMessage && (
          <p className="form-error" role="alert">
            {rejectedMessage}
          </p>
        )}
        <div className="modal-actions">
          <button type="button" className="btn btn-ghost btn-lg" onClick={onResume}>
            Tiếp tục tính giờ
          </button>
          <button type="submit" className="btn btn-primary btn-lg" disabled={!!missing} title={missing ?? undefined}>
            {missing ?? 'Chấm đáp án'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
