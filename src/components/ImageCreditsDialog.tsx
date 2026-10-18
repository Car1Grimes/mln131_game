import type { Question } from '../game/types';
import { Modal } from './Modal';

/** Image source list. Reachable only from the final screen, so it cannot spoil an active round. */
export function ImageCreditsDialog({ questions, onClose }: { questions: readonly Question[]; onClose: () => void }) {
  return (
    <Modal title="Nguồn hình ảnh" onEscape={onClose} wide>
      <p className="modal-message credits-intro">
        Hình ảnh chỉ dùng cho hoạt động học tập trong lớp, được lưu cục bộ và ghi rõ nguồn gốc.
      </p>
      <div className="credits-list">
        {questions.map((q, qi) => (
          <section key={q.id} className="credits-group">
            <h3 className="credits-heading">Câu {qi + 1}</h3>
            <ol className="credits-items">
              {q.clues.map((clue, ci) => (
                <li key={ci}>
                  <span className="credits-index">Hình {ci + 1}</span>
                  {clue.credit ? (
                    <span className="credits-text">
                      {clue.credit.author} · {clue.credit.source}
                      {clue.credit.note ? ` · ${clue.credit.note}` : ''}
                      <span className="credits-url">{clue.credit.url}</span>
                    </span>
                  ) : (
                    <span className="credits-text">Chưa có nguồn</span>
                  )}
                </li>
              ))}
            </ol>
          </section>
        ))}
      </div>
      <div className="modal-actions">
        <button type="button" className="btn btn-primary" onClick={onClose}>
          Đóng
        </button>
      </div>
    </Modal>
  );
}
