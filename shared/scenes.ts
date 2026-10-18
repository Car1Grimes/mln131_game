// Scene model for the time-synchronised clue montage.
//
// The server owns the full scene timeline of a question and releases each scene only when its
// time has come (server clock, relative to the round start). Clients only ever receive scenes that
// have already been released, so future clues cannot be read from the network or the bundle.
// Media files are referenced by an opaque asset id and fetched through an authenticated endpoint
// that re-checks the release time on the server (see server/app.ts, GET /api/rounds/:id/media/:asset).

export const SCENE_TRANSITIONS = ['cut', 'fade', 'slide', 'zoom'] as const;
export type SceneTransition = (typeof SCENE_TRANSITIONS)[number];

export const SCENE_KINDS = ['placeholder', 'image', 'text-card', 'date', 'statistic', 'video'] as const;

interface SceneBase {
  /** Unique within the timeline; neutral (must not describe the content). */
  id: string;
  /** Offset from the round start (ms, server clock) at which the scene is released. */
  at: number;
  /** How long the scene is meant to stay in focus (ms). Omitted: until the next scene. */
  durationMs?: number;
  /** How the scene enters. Default: fade. */
  transition?: SceneTransition;
}

export interface MediaRef {
  /** Opaque id from the server's media registry; never a filename or path. */
  assetId: string;
}

export type Scene =
  | (SceneBase & { kind: 'placeholder'; title: string; subtitle?: string })
  | (SceneBase & { kind: 'image'; media: MediaRef; caption?: string; credit?: string })
  | (SceneBase & { kind: 'text-card'; heading?: string; body: string })
  | (SceneBase & { kind: 'date'; date: string; label?: string })
  | (SceneBase & {
      kind: 'statistic';
      value: string;
      unit?: string;
      label: string;
      /** Required unless `demo` is true. Statistics are never invented. */
      source?: string;
      /** Illustrative, non-factual demo figure: always labelled as such on screen. */
      demo?: boolean;
    })
  | (SceneBase & {
      kind: 'video';
      media: MediaRef;
      /** Segment of the clip to play (ms within the clip). Defaults: whole clip. */
      startMs?: number;
      endMs?: number;
      credit?: string;
    });

export type SceneKind = Scene['kind'];

/** A scene as sent to clients: only after release, stamped with the authoritative release time. */
export type ReleasedScene = Scene & { releasedAt: number };

/** Scenes whose release time has passed, given the round start and the current server time. */
export function releasedScenes(timeline: readonly Scene[], startedAt: number, serverNow: number): ReleasedScene[] {
  const elapsed = serverNow - startedAt;
  return timeline.filter((s) => s.at <= elapsed).map((s) => ({ ...s, releasedAt: startedAt + s.at }));
}

/** Authenticated media URL for a released asset of a round. */
export function mediaPath(roundId: string, assetId: string): string {
  return `/api/rounds/${encodeURIComponent(roundId)}/media/${encodeURIComponent(assetId)}`;
}

/**
 * Where a video should be (ms within the clip) at server time `serverNow`, for a scene released at
 * `releasedAt`. Used to align playback after a late load, a refresh or drift.
 */
export function videoPositionMs(scene: { releasedAt: number; startMs?: number; endMs?: number }, serverNow: number, clipDurationMs?: number): number {
  const start = scene.startMs ?? 0;
  const end = scene.endMs ?? clipDurationMs ?? Number.POSITIVE_INFINITY;
  return Math.min(end, start + Math.max(0, serverNow - scene.releasedAt));
}
