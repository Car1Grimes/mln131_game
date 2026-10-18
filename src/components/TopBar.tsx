import type { QuestionResult } from '../game/types';
import { FullscreenIcon, ResetIcon, UndoIcon } from './icons';

interface Props {
  showGameControls: boolean;
  questionIndex: number;
  results: (QuestionResult | null)[];
  isFinal: boolean;
  canUndo: boolean;
  onNavigate: (index: number) => void;
  onUndo: () => void;
  onReset: () => void;
  onFullscreen: () => void;
}

export function TopBar(p: Props) {
  return (
    <header className="topbar">
      <div className="brand" aria-label="THE HIDDEN CONNECTION">
        <span className="brand-mark" aria-hidden="true" />
        <span className="brand-text">THE HIDDEN CONNECTION</span>
      </div>
      {p.showGameControls && (
        <nav className="pips" aria-label="Chọn câu hỏi">
          {p.results.map((r, i) => {
            const current = i === p.questionIndex && !p.isFinal;
            return (
              <button
                key={i}
                type="button"
                className={`pip${current ? ' is-current' : ''}${r ? ' is-done' : ''}`}
                aria-current={current ? 'step' : undefined}
                aria-label={`Câu ${i + 1}${r ? ' (đã xong)' : ''}${current ? ' (đang chọn)' : ''}`}
               
                onClick={() => p.onNavigate(i)}
              >
                {i + 1}
              </button>
            );
          })}
        </nav>
      )}
      <div className="topbar-actions">
        {p.showGameControls && (
          <>
            <button type="button" className="btn btn-bar" onClick={p.onUndo} disabled={!p.canUndo} title="Hoàn tác lần chấm điểm gần nhất">
              <UndoIcon /> <span>Hoàn tác</span>
            </button>
            <button type="button" className="btn btn-bar" onClick={p.onReset} title="Chơi lại từ đầu">
              <ResetIcon /> <span>Chơi lại</span>
            </button>
          </>
        )}
        <button type="button" className="btn btn-bar btn-icon" onClick={p.onFullscreen} aria-label="Toàn màn hình (phím F)" title="Toàn màn hình (phím F)">
          <FullscreenIcon />
        </button>
      </div>
    </header>
  );
}
