// Timeline validation, run for every question when the server starts (and in tests).
import { normalizeAnswer } from '../../shared/normalize';
import { SCENE_KINDS, SCENE_TRANSITIONS, type Scene } from '../../shared/scenes';
import type { MediaRegistry } from '../media/registry';

/** Content is authored for the official 60-second round. */
export const AUTHORED_ROUND_MS = 60_000;

const SCENE_ID = /^[a-z0-9-]{1,40}$/;

function textFields(scene: Scene): string[] {
  switch (scene.kind) {
    case 'placeholder':
      return [scene.title, scene.subtitle ?? ''];
    case 'image':
      return [scene.caption ?? '', scene.credit ?? ''];
    case 'text-card':
      return [scene.heading ?? '', scene.body];
    case 'date':
      return [scene.date, scene.label ?? ''];
    case 'statistic':
      return [scene.value, scene.unit ?? '', scene.label, scene.source ?? ''];
    case 'video':
      return [scene.credit ?? ''];
  }
}

/** Returns a list of problems (empty = valid). */
export function validateTimeline(
  scenes: readonly Scene[],
  opts: { answer: string; registry: MediaRegistry; roundMs?: number },
): string[] {
  const roundMs = opts.roundMs ?? AUTHORED_ROUND_MS;
  const errors: string[] = [];
  const ids = new Set<string>();
  const answer = normalizeAnswer(opts.answer);
  if (scenes.length === 0) errors.push('timeline is empty');
  else if (scenes[0]!.at !== 0) errors.push('first scene must be released at 0 ms');

  scenes.forEach((s, i) => {
    const where = `scene ${i} (${s.id})`;
    if (!SCENE_ID.test(s.id)) errors.push(`${where}: invalid id`);
    if (ids.has(s.id)) errors.push(`${where}: duplicate id`);
    ids.add(s.id);
    if (!(SCENE_KINDS as readonly string[]).includes(s.kind)) errors.push(`${where}: unknown kind`);
    if (!Number.isInteger(s.at) || s.at < 0) errors.push(`${where}: offset must be a non-negative integer`);
    if (s.at >= roundMs) errors.push(`${where}: released at ${s.at} ms, outside the ${roundMs} ms round`);
    if (i > 0 && s.at <= scenes[i - 1]!.at) errors.push(`${where}: offsets must be strictly increasing`);
    if (s.transition !== undefined && !(SCENE_TRANSITIONS as readonly string[]).includes(s.transition)) errors.push(`${where}: invalid transition`);
    if (s.durationMs !== undefined && (!Number.isInteger(s.durationMs) || s.durationMs <= 0 || s.at + s.durationMs > roundMs)) {
      errors.push(`${where}: invalid duration`);
    }
    for (const text of textFields(s)) {
      if (answer && normalizeAnswer(text).includes(answer)) errors.push(`${where}: text reveals the answer`);
    }
    if (s.kind === 'text-card' && !s.body.trim()) errors.push(`${where}: empty text`);
    if (s.kind === 'statistic' && !s.demo && !s.source?.trim()) errors.push(`${where}: statistic needs a source or demo: true`);
    if (s.kind === 'image' || s.kind === 'video') {
      const asset = opts.registry.get(s.media.assetId);
      if (!asset) errors.push(`${where}: unknown asset ${s.media.assetId}`);
      else {
        if (asset.kind !== s.kind) errors.push(`${where}: asset kind ${asset.kind} does not match scene kind`);
        if (answer && normalizeAnswer(asset.id).includes(answer)) errors.push(`${where}: asset id reveals the answer`);
        if (s.kind === 'video') {
          const start = s.startMs ?? 0;
          const end = s.endMs ?? asset.durationMs ?? 0;
          if (!asset.durationMs) errors.push(`${where}: video asset has no duration`);
          if (start < 0 || end <= start || (asset.durationMs !== undefined && end > asset.durationMs)) errors.push(`${where}: invalid clip segment`);
          if (s.at + (end - start) > roundMs) errors.push(`${where}: clip runs past the round end`);
        }
      }
    }
  });
  return errors;
}
