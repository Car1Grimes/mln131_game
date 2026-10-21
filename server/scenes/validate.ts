// Timeline validation, run for every question when the server starts (and in tests).
import { normalizeAnswer } from '../../shared/normalize';
import { SCENE_KINDS, SCENE_TRANSITIONS, type Scene } from '../../shared/scenes';
import type { MediaRegistry } from '../media/registry';

/** Content is authored for the official 40-second round. */
export const AUTHORED_ROUND_MS = 40_000;

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
  opts: { answer: string; registry: MediaRegistry; roundMs?: number; allowDemoStatistics?: boolean; production?: boolean },
): string[] {
  const roundMs = opts.roundMs ?? AUTHORED_ROUND_MS;
  const errors: string[] = [];
  const ids = new Set<string>();
  const answer = normalizeAnswer(opts.answer);
  if (opts.production) {
    if (roundMs !== AUTHORED_ROUND_MS) errors.push('production round must be 40000 ms');
    if (scenes.length !== 8) errors.push('production timeline must contain exactly eight scenes');
    const decisive = scenes[6];
    if (!decisive || decisive.at !== 30_000 || !['text-card', 'date'].includes(decisive.kind) || decisive.durationMs !== 4_000 || decisive.transition !== 'cut') {
      errors.push('production decisive clue must be native at 30000 ms for 4000 ms with cut');
    }
    const recap = scenes[7];
    if (!recap || recap.kind !== 'video' || recap.at !== 34_000 || recap.durationMs !== 6_000) errors.push('production recap must be video at 34000 ms for 6000 ms');
  }
  if (scenes.length === 0) errors.push('timeline is empty');
  else if (scenes[0]!.at !== 0) errors.push('first scene must be released at 0 ms');

  scenes.forEach((s, i) => {
    const where = `scene ${i} (${s.id})`;
    const slotEnd = scenes[i + 1]?.at ?? roundMs;
    if (s.durationMs !== undefined && s.at + s.durationMs > slotEnd) errors.push(`${where}: duration overlaps next scene`);
    if (opts.production && s.at + (s.durationMs ?? 0) !== slotEnd) errors.push(`${where}: production coverage must be contiguous`);
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
    // Fictional figures are never allowed in classroom content; only test fixtures may opt in.
    if (s.kind === 'statistic' && s.demo && !opts.allowDemoStatistics) errors.push(`${where}: demo statistics are not allowed in production content`);
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
          if (s.at + (end - start) > slotEnd) errors.push(`${where}: clip overlaps next scene`);
          if (opts.production && (start !== 0 || end !== asset.durationMs || end - start !== s.durationMs)) errors.push(`${where}: production clip must occupy its full assigned slot`);
        }
      }
    }
  });
  return errors;
}
