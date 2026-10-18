// Scene model for the future time-synchronised clue "video" (Checkpoint M2+).
//
// The server owns the full scene timeline of a question and releases each scene only when its
// time has come (server clock, relative to the round start). Clients only ever receive scenes that
// have already been released, so future clues cannot be read from the network or the bundle.
// Media files are referenced by an opaque asset id; the server will serve them through an
// authorised endpoint after release (not implemented in M1).

export type SceneTransition = 'cut' | 'fade' | 'slide' | 'zoom';

interface SceneBase {
  id: string;
  /** Offset from the round start (ms, server clock) at which the scene may be released. */
  at: number;
  /** How long the scene stays in focus (ms). Omitted: until the next scene. */
  durationMs?: number;
  transition?: SceneTransition;
}

export interface MediaRef {
  /** Opaque id; never a filename that could reveal the answer. */
  assetId: string;
  width?: number;
  height?: number;
}

export type Scene =
  | (SceneBase & { kind: 'placeholder'; title: string; subtitle?: string })
  | (SceneBase & { kind: 'image'; media: MediaRef; caption?: string })
  | (SceneBase & { kind: 'text-card'; heading?: string; body: string })
  | (SceneBase & { kind: 'date'; date: string; label?: string })
  | (SceneBase & { kind: 'statistic'; value: string; unit?: string; label: string; source?: string })
  | (SceneBase & { kind: 'video'; media: MediaRef; startMs?: number; endMs?: number; muted?: boolean });

export type SceneKind = Scene['kind'];

/** A scene as sent to clients: only after release, stamped with the authoritative release time. */
export type ReleasedScene = Scene & { releasedAt: number };

/** Scenes whose release time has passed, given the round start and the current server time. */
export function releasedScenes(timeline: readonly Scene[], startedAt: number, serverNow: number): ReleasedScene[] {
  const elapsed = serverNow - startedAt;
  return timeline.filter((s) => s.at <= elapsed).map((s) => ({ ...s, releasedAt: startedAt + s.at }));
}
