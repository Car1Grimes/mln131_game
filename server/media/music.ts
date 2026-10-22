// Projector-only soundtracks. Never register these as scene assets or serve this directory statically.
import { realpathSync, statSync } from 'node:fs';
import { isAbsolute, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

export const MUSIC_FILES = { lobby: 'lobby.mp3', intro: 'intro.mp3', question: 'question.mp3', result: 'result.mp3' } as const;
export type MusicTrack = keyof typeof MUSIC_FILES;
export const DEFAULT_MUSIC_ROOT = fileURLToPath(new URL('./music/', import.meta.url));

export function resolveMusic(root: string, track: MusicTrack): string | null {
  try {
    const base = realpathSync(root);
    const file = realpathSync(join(base, MUSIC_FILES[track]));
    const rel = relative(base, file);
    if (rel.startsWith('..') || isAbsolute(rel) || !statSync(file).isFile()) return null;
    return file;
  } catch {
    // Optional assets: their absence must never prevent server/game startup.
    return null;
  }
}
