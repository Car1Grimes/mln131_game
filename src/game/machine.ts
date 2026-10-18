import { isCorrectAnswer } from './normalize';
import {
  MAX_HISTORY,
  MAX_TEAM_NAME_LENGTH,
  QUESTION_DURATION_MS,
  TEAM_COUNT,
  cluesRevealedAt,
  defaultTeamName,
  isTimeUp,
  pointsForClues,
} from './rules';
import type {
  GameAction,
  GameState,
  HistoryEntry,
  PausedState,
  Question,
  QuestionResult,
  RoundCompleteState,
  RunningState,
  Team,
} from './types';

export interface GameContext {
  questions: readonly Question[];
}

export function createInitialState(questionCount: number, teams?: Team[]): GameState {
  return {
    phase: 'setup',
    teams:
      teams ??
      Array.from({ length: TEAM_COUNT }, (_, i) => ({ id: `team-${i + 1}`, name: defaultTeamName(i) })),
    results: Array.from({ length: questionCount }, () => null),
    questionIndex: 0,
    history: [],
    lastEvent: null,
  };
}

/** Active elapsed time for the current question, derived from a monotonic `now`. */
export function getElapsedMs(state: GameState, now: number): number {
  switch (state.phase) {
    case 'running':
      return state.round.accumulatedMs + Math.max(0, now - state.runningSince);
    case 'paused_for_answer':
      return state.round.accumulatedMs;
    default:
      return 0;
  }
}

export function getScores(state: GameState): Record<string, number> {
  const scores: Record<string, number> = {};
  for (const team of state.teams) scores[team.id] = 0;
  for (const result of state.results) {
    if (result?.outcome === 'correct' && result.teamId in scores) {
      scores[result.teamId] = (scores[result.teamId] ?? 0) + result.points;
    }
  }
  return scores;
}

export function getIneligible(state: GameState): string[] {
  return state.phase === 'running' || state.phase === 'paused_for_answer' ? state.round.ineligible : [];
}

/** True while at least one team is still eligible to answer the current question. */
export function canAnyTeamAnswer(state: GameState): boolean {
  const ineligible = getIneligible(state);
  return state.teams.some((t) => !ineligible.includes(t.id));
}

export function allQuestionsComplete(state: GameState): boolean {
  return state.results.every((r) => r !== null);
}

export function teamName(state: GameState, teamId: string): string {
  const index = state.teams.findIndex((t) => t.id === teamId);
  const team = state.teams[index];
  if (!team) return teamId;
  return team.name.trim() || defaultTeamName(index);
}

function withoutRound<S extends GameState>(state: S) {
  // Strip phase-specific fields so a base object can be re-tagged with a new phase.
  const { teams, results, questionIndex, history, lastEvent } = state;
  return { teams, results, questionIndex, history, lastEvent };
}

function completeRound(
  state: RunningState | PausedState,
  result: QuestionResult,
  lastEvent: GameState['lastEvent'],
): RoundCompleteState {
  const results = state.results.slice();
  results[state.questionIndex] = result;
  return { ...withoutRound(state), phase: 'round_complete', results, lastEvent };
}

function timeout(state: RunningState | PausedState, elapsedMs: number): RoundCompleteState {
  return completeRound(state, { outcome: 'timeout', elapsedMs: Math.min(elapsedMs, QUESTION_DURATION_MS) }, { kind: 'timeout' });
}

function pushHistory(history: HistoryEntry[], entry: HistoryEntry): HistoryEntry[] {
  return [...history, entry].slice(-MAX_HISTORY);
}

export function transition(state: GameState, action: GameAction, ctx: GameContext): GameState {
  const questionCount = ctx.questions.length;

  switch (action.type) {
    case 'SET_TEAM_NAME': {
      if (state.phase === 'running' || state.phase === 'paused_for_answer') return state;
      if (!state.teams.some((t) => t.id === action.teamId)) return state;
      const name = action.name.slice(0, MAX_TEAM_NAME_LENGTH);
      return { ...state, teams: state.teams.map((t) => (t.id === action.teamId ? { ...t, name } : t)) };
    }

    case 'START_GAME': {
      if (state.phase !== 'setup') return state;
      const teams = state.teams.map((t, i) => ({ ...t, name: t.name.trim() || defaultTeamName(i) }));
      return { ...withoutRound(state), phase: 'ready', teams, questionIndex: 0, lastEvent: null };
    }

    case 'START_QUESTION': {
      if (state.phase !== 'ready') return state;
      return {
        ...withoutRound(state),
        phase: 'running',
        round: { accumulatedMs: 0, ineligible: [] },
        runningSince: action.now,
        lastEvent: null,
      };
    }

    case 'TICK': {
      if (state.phase !== 'running') return state;
      const elapsed = getElapsedMs(state, action.now);
      return isTimeUp(elapsed) ? timeout(state, elapsed) : state;
    }

    case 'PAUSE': {
      if (state.phase !== 'running') return state;
      const elapsed = getElapsedMs(state, action.now);
      if (isTimeUp(elapsed)) return timeout(state, elapsed);
      // Nobody can answer any more: the clock simply runs out.
      if (!canAnyTeamAnswer(state)) return state;
      return {
        ...withoutRound(state),
        phase: 'paused_for_answer',
        round: { ...state.round, accumulatedMs: elapsed },
        restored: false,
      };
    }

    case 'RESUME': {
      if (state.phase !== 'paused_for_answer') return state;
      if (isTimeUp(state.round.accumulatedMs)) return timeout(state, state.round.accumulatedMs);
      return {
        ...withoutRound(state),
        phase: 'running',
        round: state.round,
        runningSince: action.now,
        lastEvent: null,
      };
    }

    case 'SUBMIT_ANSWER': {
      if (state.phase !== 'paused_for_answer') return state;
      const question = ctx.questions[state.questionIndex];
      if (!question) return state;
      if (!state.teams.some((t) => t.id === action.teamId)) {
        return { ...state, lastEvent: { kind: 'rejected', message: 'Không tìm thấy đội này.' } };
      }
      if (state.round.ineligible.includes(action.teamId)) {
        return {
          ...state,
          lastEvent: { kind: 'rejected', message: `${teamName(state, action.teamId)} đã hết lượt trả lời ở câu này.` },
        };
      }
      const answer = action.answer.trim();
      if (!answer) return { ...state, lastEvent: { kind: 'rejected', message: 'Vui lòng nhập câu trả lời.' } };

      const { history, ...rest } = state;
      const snapshot: HistoryEntry['snapshot'] = { ...rest, restored: false, lastEvent: null };
      const elapsed = state.round.accumulatedMs;
      const name = teamName(state, action.teamId);

      if (isCorrectAnswer(answer, question.answer)) {
        const cluesRevealed = cluesRevealedAt(elapsed);
        const points = pointsForClues(cluesRevealed);
        const label = `Câu ${state.questionIndex + 1}: ${name} +${points} điểm (“${answer}”)`;
        const next = completeRound(
          state,
          { outcome: 'correct', teamId: action.teamId, points, cluesRevealed, elapsedMs: elapsed, submittedAnswer: answer },
          { kind: 'correct', teamId: action.teamId, points },
        );
        return { ...next, history: pushHistory(history, { label, snapshot }) };
      }

      const label = `Câu ${state.questionIndex + 1}: ${name} trả lời sai (“${answer}”)`;
      return {
        ...withoutRound(state),
        phase: 'running',
        round: { accumulatedMs: elapsed, ineligible: [...state.round.ineligible, action.teamId] },
        runningSince: action.now,
        history: pushHistory(history, { label, snapshot }),
        lastEvent: { kind: 'wrong', teamId: action.teamId, answer },
      };
    }

    case 'UNDO': {
      if (state.phase === 'setup') return state;
      const entry = state.history[state.history.length - 1];
      if (!entry) return state;
      return {
        ...entry.snapshot,
        // Keep the current team names; only scoring is being undone.
        teams: state.teams,
        restored: false,
        history: state.history.slice(0, -1),
        lastEvent: { kind: 'undo', label: entry.label },
      };
    }

    case 'GO_TO_QUESTION': {
      if (state.phase === 'setup') return state;
      if (!Number.isInteger(action.index) || action.index < 0 || action.index >= questionCount) return state;
      const base = { ...withoutRound(state), questionIndex: action.index, lastEvent: null };
      return state.results[action.index] ? { ...base, phase: 'round_complete' } : { ...base, phase: 'ready' };
    }

    case 'SHOW_FINAL': {
      if (state.phase !== 'round_complete' && state.phase !== 'ready') return state;
      return { ...withoutRound(state), phase: 'final', lastEvent: null };
    }

    case 'RESET': {
      return createInitialState(questionCount, state.teams);
    }
  }
}
