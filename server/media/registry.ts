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
  // Q2 production clips (M3.2): built by scripts/media/build-clips.mjs from media/q2/manifest.json;
  // sources, licences and changes: media/sources.json, media/q2/build-report.json.
  { id: 'r4t8k1mz', kind: 'video', file: 'clips/c02.mp4', mime: 'video/mp4', durationMs: 5_000 },
  { id: 'p9w2c6xe', kind: 'video', file: 'clips/c03.mp4', mime: 'video/mp4', durationMs: 6_000 },
  { id: 'b8j1f4vu', kind: 'video', file: 'clips/c05.mp4', mime: 'video/mp4', durationMs: 6_000 },
  { id: 'x2m6s9ka', kind: 'video', file: 'clips/c06.mp4', mime: 'video/mp4', durationMs: 6_000 },
  // Q4 and Q6 production clips (M3.2-B): media/q4/manifest.json, media/q6/manifest.json.
  { id: 'k5v8m7wn', kind: 'video', file: 'clips/c07.mp4', mime: 'video/mp4', durationMs: 6_000 },
  { id: 'f3t9m6ra', kind: 'video', file: 'clips/c08.mp4', mime: 'video/mp4', durationMs: 7_000 },
  { id: 'w7c2h4pj', kind: 'video', file: 'clips/c09.mp4', mime: 'video/mp4', durationMs: 6_000 },
  { id: 'n6d1x8zs', kind: 'video', file: 'clips/c10.mp4', mime: 'video/mp4', durationMs: 6_000 },
  { id: 'g2r7k9vb', kind: 'video', file: 'clips/c11.mp4', mime: 'video/mp4', durationMs: 5_000 },
  { id: 'y4m1t6qe', kind: 'video', file: 'clips/c12.mp4', mime: 'video/mp4', durationMs: 6_000 },
  { id: 'u8s3n5ck', kind: 'video', file: 'clips/c13.mp4', mime: 'video/mp4', durationMs: 6_000 },
  { id: 'j9p4w2fd', kind: 'video', file: 'clips/c14.mp4', mime: 'video/mp4', durationMs: 5_000 },
  { id: 'e1h6z3lm', kind: 'video', file: 'clips/c15.mp4', mime: 'video/mp4', durationMs: 6_000 },
  // Q3 production clips (M3.2-C1): media/q3/manifest.json.
  { id: 'm4x9t2bh', kind: 'video', file: 'clips/c16.mp4', mime: 'video/mp4', durationMs: 5_000 },
  { id: 'v7k3p8cd', kind: 'video', file: 'clips/c17.mp4', mime: 'video/mp4', durationMs: 5_000 },
  { id: 's2n6w9qf', kind: 'video', file: 'clips/c18.mp4', mime: 'video/mp4', durationMs: 6_000 },
  { id: 'z5r1j7ta', kind: 'video', file: 'clips/c19.mp4', mime: 'video/mp4', durationMs: 6_000 },
  { id: 'l3g8u4yx', kind: 'video', file: 'clips/c20.mp4', mime: 'video/mp4', durationMs: 4_000 },
  { id: 'o9c5e2kn', kind: 'video', file: 'clips/c21.mp4', mime: 'video/mp4', durationMs: 6_000 },
  // Q5 production clips (M3.2-C2): media/q5/manifest.json.
  { id: 'h8w3n5rk', kind: 'video', file: 'clips/c22.mp4', mime: 'video/mp4', durationMs: 5_000 },
  { id: 'p2f7d9xs', kind: 'video', file: 'clips/c23.mp4', mime: 'video/mp4', durationMs: 7_000 },
  { id: 'k4j6v1mt', kind: 'video', file: 'clips/c24.mp4', mime: 'video/mp4', durationMs: 6_000 },
  { id: 'r9e2y7gc', kind: 'video', file: 'clips/c25.mp4', mime: 'video/mp4', durationMs: 6_000 },
  // Q1 production clips (M3.2-C3): media/q1/manifest.json.
  { id: 'w6n2j8rd', kind: 'video', file: 'clips/c26.mp4', mime: 'video/mp4', durationMs: 6_000 },
  { id: 's9b4x1lf', kind: 'video', file: 'clips/c27.mp4', mime: 'video/mp4', durationMs: 6_000 },
  { id: 'g7m3t5ve', kind: 'video', file: 'clips/c28.mp4', mime: 'video/mp4', durationMs: 5_000 },
  { id: 'u2k8p6zn', kind: 'video', file: 'clips/c29.mp4', mime: 'video/mp4', durationMs: 6_000 },
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
