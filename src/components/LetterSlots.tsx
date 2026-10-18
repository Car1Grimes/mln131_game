import type { CSSProperties } from 'react';
import { answerLetterGroups } from '../game/normalize';

/** Blank boxes grouped by word. Letters are only rendered into the DOM once `revealed` is true. */
export function LetterSlots({ answer, revealed, size = 'normal' }: { answer: string; revealed: boolean; size?: 'normal' | 'large' }) {
  const groups = answerLetterGroups(answer);
  const letters = groups.reduce((n, g) => n + g.length, 0);
  let order = 0;
  const label = revealed
    ? `Đáp án: ${answer}`
    : `Từ khóa gồm ${groups.length} từ: ${groups.map((g) => g.length).join(', ')} chữ cái`;
  return (
    <div
      className={`slots slots-${size}${revealed ? ' is-revealed' : ''}`}
      style={{ '--letters': letters, '--words': groups.length } as CSSProperties}
      role="img"
      aria-label={label}
    >
      {groups.map((word, w) => (
        <div key={w} className="slot-word">
          {word.map((ch, i) => {
            const n = order++;
            return (
              <span key={i} className="slot" style={{ '--i': n } as CSSProperties} aria-hidden="true">
                {revealed ? ch : ''}
              </span>
            );
          })}
        </div>
      ))}
    </div>
  );
}
