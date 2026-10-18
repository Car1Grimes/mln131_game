import { useState } from 'react';
import { CLUE_INTERVAL_MS } from '../game/rules';
import type { Clue } from '../game/types';
import { ImageIcon, LockIcon } from './icons';

interface Props {
  clues: readonly Clue[];
  revealed: number;
  /** When provided (running/paused), locked clues show how long until they open. */
  elapsedMs?: number;
  compact?: boolean;
}

export function ClueGrid({ clues, revealed, elapsedMs, compact }: Props) {
  return (
    <div className={`clue-grid${compact ? ' is-compact' : ''}`}>
      {clues.map((clue, i) => (
        <ClueCard key={i} clue={clue} index={i} revealed={i < revealed} elapsedMs={elapsedMs} />
      ))}
    </div>
  );
}

function ClueCard({ clue, index, revealed, elapsedMs }: { clue: Clue; index: number; revealed: boolean; elapsedMs?: number }) {
  const opensAt = index * CLUE_INTERVAL_MS;
  if (!revealed) {
    const wait = elapsedMs === undefined ? null : Math.max(1, Math.ceil((opensAt - elapsedMs) / 1000));
    return (
      <figure className="clue is-locked" aria-label={`Gợi ý ${index + 1}: chưa mở`}>
        <span className="clue-badge">{index + 1}</span>
        <LockIcon className="clue-lock" />
        <figcaption className="clue-locked-text">
          {wait === null ? `Mở ở giây ${opensAt / 1000}` : `Mở sau ${wait} giây`}
        </figcaption>
      </figure>
    );
  }
  // Keyed wrapper mounts on reveal so the reveal animation plays once.
  return (
    <figure key="revealed" className="clue is-revealed">
      <span className="clue-badge">{index + 1}</span>
      <ClueImage clue={clue} index={index} />
    </figure>
  );
}

/** Renders the clue image, or a neutral panel when no image is configured or it fails to load. */
function ClueImage({ clue, index }: { clue: Clue; index: number }) {
  const [failed, setFailed] = useState(false);
  if (clue.imageSrc && !failed) {
    return <img className="clue-img" src={clue.imageSrc} alt={clue.alt} onError={() => setFailed(true)} draggable={false} />;
  }
  return (
    <div className="clue-placeholder" role="img" aria-label={clue.alt}>
      <ImageIcon className="clue-placeholder-icon" />
      <span>Hình gợi ý {index + 1}</span>
    </div>
  );
}
