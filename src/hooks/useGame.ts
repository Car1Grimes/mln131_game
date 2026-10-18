import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { QUESTIONS } from '../content/questions';
import { createInitialState, transition } from '../game/machine';
import { loadGame, saveGame, type StorageLike } from '../game/persistence';
import type { GameAction, GameState } from '../game/types';

const ctx = { questions: QUESTIONS };
const TICK_MS = 100;
const SAVE_WHILE_RUNNING_MS = 1_000;

/** Monotonic clock. Not comparable across page loads, so it is never persisted. */
export const monotonicNow = () => performance.now();

function getStorage(): StorageLike | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function init(): GameState {
  const storage = getStorage();
  return (storage && loadGame(storage, QUESTIONS.length)) ?? createInitialState(QUESTIONS.length);
}

export function useGame() {
  const [state, dispatch] = useReducer((s: GameState, a: GameAction) => transition(s, a, ctx), undefined, init);
  const [now, setNow] = useState(monotonicNow);
  const stateRef = useRef(state);
  stateRef.current = state;

  // Persist on every state change.
  useEffect(() => {
    const storage = getStorage();
    if (storage) saveGame(storage, state, monotonicNow());
  }, [state]);

  // While running: re-render frequently (elapsed is derived, not counted), check the deadline,
  // and periodically checkpoint the elapsed time so a crash/refresh loses at most ~1s.
  useEffect(() => {
    if (state.phase !== 'running') return;
    let lastSave = monotonicNow();
    const id = window.setInterval(() => {
      const t = monotonicNow();
      setNow(t);
      dispatch({ type: 'TICK', now: t });
      if (t - lastSave >= SAVE_WHILE_RUNNING_MS) {
        lastSave = t;
        const storage = getStorage();
        if (storage) saveGame(storage, stateRef.current, t);
      }
    }, TICK_MS);
    return () => window.clearInterval(id);
  }, [state.phase]);

  // Save the exact elapsed time when the page is being closed or refreshed.
  useEffect(() => {
    const flush = () => {
      const storage = getStorage();
      if (storage) saveGame(storage, stateRef.current, monotonicNow());
    };
    window.addEventListener('pagehide', flush);
    window.addEventListener('beforeunload', flush);
    return () => {
      window.removeEventListener('pagehide', flush);
      window.removeEventListener('beforeunload', flush);
    };
  }, []);

  /** Dispatch with a fresh monotonic timestamp for time-sensitive actions. */
  const act = useCallback((action: GameAction) => {
    const t = monotonicNow();
    setNow(t);
    dispatch('now' in action ? { ...action, now: t } : action);
  }, []);

  return { state, now, act, questions: QUESTIONS };
}
