import type { CSSProperties } from 'react';
import { answerLetterGroups } from '../../shared/normalize';

/**
 * Letter boxes grouped by word. During a round only the shape (`pattern`, letters per word) is
 * known to the client; the letters are rendered only once the server has revealed `answer`.
 */
export function LetterSlots({ pattern, answer, size = 'normal' }: { pattern: number[]; answer?: string | null; size?: 'normal' | 'large' }) {
  const revealed = typeof answer === 'string';
  const groups: (string | null)[][] = revealed ? answerLetterGroups(answer) : pattern.map((n) => Array.from({ length: n }, () => null));
  const letters = groups.reduce((n, g) => n + g.length, 0);
  let order = 0;
  const label = revealed ? `Đáp án: ${answer}` : `Từ khóa gồm ${groups.length} từ: ${pattern.join(', ')} chữ cái`;
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
                {ch ?? ''}
              </span>
            );
          })}
        </div>
      ))}
    </div>
  );
}
