// SERVER-ONLY media registry. Maps opaque asset ids (safe to send to clients once released) to files
// under server/media. Clients never see filenames or paths; there is no public static media folder.
import { realpathSync, statSync } from 'node:fs';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

export type MediaKind = 'image' | 'video';

export interface MediaAsset {
  /** Opaque id (lowercase letters, digits, dashes). Must not describe the content. */
  id: string;
  kind: MediaKind;
  /** Path relative to the media root. Never sent to clients. */
  file: string;
  mime: 'image/webp' | 'image/jpeg' | 'image/png' | 'video/mp4' | 'video/webm';
  /** Clip length for videos (ms). */
  durationMs?: number;
}

export const ASSET_ID_PATTERN = /^[a-z0-9-]{3,40}$/;
export const DEFAULT_MEDIA_ROOT = fileURLToPath(new URL('.', import.meta.url));

/** Assets available to scene timelines. Ids are deliberately meaningless. */
export const MEDIA_ASSETS: readonly MediaAsset[] = [
  { id: 'm7k2p9xa', kind: 'image', file: 'clues/q04-03.webp', mime: 'image/webp' },
  { id: 'm3q8v1ze', kind: 'image', file: 'clues/q04-04.webp', mime: 'image/webp' },
  { id: 'v5n4c6tw', kind: 'video', file: 'clips/c01.mp4', mime: 'video/mp4', durationMs: 10_000 },
];

export class MediaRegistry {
  private readonly byId: Map<string, MediaAsset>;
  private readonly root: string;

  constructor(assets: readonly MediaAsset[] = MEDIA_ASSETS, root: string = DEFAULT_MEDIA_ROOT) {
    this.root = resolve(root);
    this.byId = new Map();
    for (const a of assets) {
      if (!ASSET_ID_PATTERN.test(a.id)) throw new Error(`invalid asset id ${a.id}`);
      if (this.byId.has(a.id)) throw new Error(`duplicate asset id ${a.id}`);
      if (isAbsolute(a.file) || a.file.split(/[\\/]/).includes('..')) throw new Error(`asset ${a.id} path must be relative and inside the media root`);
      this.byId.set(a.id, a);
    }
  }

  get(id: string): MediaAsset | undefined {
    return ASSET_ID_PATTERN.test(id) ? this.byId.get(id) : undefined;
  }

  /**
   * Absolute path of an asset's file, guaranteed to be inside the media root (symlinks resolved),
   * or null if the file is missing or escapes the root.
   */
  resolveFile(asset: MediaAsset): string | null {
    try {
      const full = realpathSync(join(this.root, asset.file));
      const rootReal = realpathSync(this.root);
      const rel = relative(rootReal, full);
      if (rel.startsWith('..') || isAbsolute(rel) || rel.split(sep).includes('..')) return null;
      return statSync(full).isFile() ? full : null;
    } catch {
      return null;
    }
  }

  /** Verifies every registered file exists (used at startup). */
  missingFiles(): string[] {
    return [...this.byId.values()].filter((a) => !this.resolveFile(a)).map((a) => a.id);
  }
}
