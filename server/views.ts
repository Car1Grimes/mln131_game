// Role-specific projections of a room. This is the only place server state is turned into data
// sent to clients, so it is where the "no early disclosure" rule is enforced:
//  - during an active round nobody gets the canonical answer, other teams' answers or correctness;
//  - the admin sees *whether* each team submitted, never what or whether it is right;
//  - a team sees its own submission echo (text + receipt time) only.
import type { AdminView, RoomSummary, TeamView } from '../shared/protocol';
import type { GameEngine } from './engine';

export interface Presence {
  devices(teamId: string): number;
}

function summary(engine: GameEngine, roomId: string): RoomSummary {
  const room = engine.room(roomId);
  return { code: room.code, phase: room.phase, questionIndex: room.question_index, totalQuestions: engine.questionCount };
}

export function adminView(engine: GameEngine, roomId: string, presence: Presence): AdminView {
  const room = engine.room(roomId);
  const round = engine.currentRound(roomId);
  const active = room.phase === 'active' && round !== null && round.closed_at === null;
  const submitted = active ? engine.submittedTeamIds(round.id) : new Set<string>();
  return {
    role: 'admin',
    room: summary(engine, roomId),
    teams: engine.teams(roomId).map((t) => ({
      id: t.id,
      slot: t.slot,
      name: t.name,
      pin: t.pin,
      ready: t.ready === 1,
      connected: presence.devices(t.id) > 0,
      devices: presence.devices(t.id),
      submitted: submitted.has(t.id),
    })),
    round: round ? engine.roundView(round) : null,
    submittedCount: submitted.size,
    reveal: round && round.closed_at !== null ? engine.reveal(round) : null,
    standings: engine.standings(roomId),
    serverNow: engine.now(),
  };
}

export function teamView(engine: GameEngine, roomId: string, teamId: string): TeamView {
  const teams = engine.teams(roomId);
  const me = teams.find((t) => t.id === teamId);
  if (!me) throw new Error('team not in room');
  const round = engine.currentRound(roomId);
  const own = round ? engine.submissionOf(round.id, teamId) : null;
  return {
    role: 'team',
    room: summary(engine, roomId),
    me: {
      id: me.id,
      name: me.name,
      ready: me.ready === 1,
      submission: own ? { answer: own.answer, receivedAt: own.received_at } : null,
    },
    teams: teams.map((t) => ({ id: t.id, name: t.name })),
    round: round ? engine.roundView(round) : null,
    reveal: round && round.closed_at !== null ? engine.reveal(round) : null,
    standings: engine.standings(roomId),
    serverNow: engine.now(),
  };
}
