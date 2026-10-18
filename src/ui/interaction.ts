import { canAnyTeamAnswer } from '../game/machine';
import type { GameState } from '../game/types';

/**
 * After the clock starts or resumes, ignore PAUSE briefly. "Start question" / "Submit answer"
 * double-clicks would otherwise land on the pause control and stop the clock immediately.
 */
export const PAUSE_GUARD_MS = 700;

export type PauseAvailability = 'available' | 'guarded' | 'no_eligible_team' | 'not_running';

export function pauseAvailability(state: GameState, now: number): PauseAvailability {
  if (state.phase !== 'running') return 'not_running';
  if (!canAnyTeamAnswer(state)) return 'no_eligible_team';
  if (now - state.runningSince < PAUSE_GUARD_MS) return 'guarded';
  return 'available';
}

/** Keyboard shortcuts must never fire while the host is typing. */
export function isTypingTarget(target: EventTarget | null): boolean {
  if (!target || typeof (target as HTMLElement).tagName !== 'string') return false;
  const el = target as HTMLElement;
  const tag = el.tagName.toLowerCase();
  return tag === 'input' || tag === 'textarea' || tag === 'select' || el.isContentEditable === true;
}
