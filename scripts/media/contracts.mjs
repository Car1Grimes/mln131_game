// Structural checks run before encoding as well as against finished production media.
export function manifestProblems(manifest) {
  const errors = [];
  const fail = (ok, message) => { if (!ok) errors.push(message); };
  fail(manifest.roundMs === 40_000, 'production roundMs must equal 40000');
  fail(manifest.decisiveAt === 30_000, 'decisiveAt must equal 30000');
  fail(manifest.scenes.length === 8, 'exactly eight production scenes required');
  fail(manifest.scenes[0]?.at === 0, 'first release must be zero');
  const ids = new Set();
  for (const [i, scene] of manifest.scenes.entries()) {
    const end = manifest.scenes[i + 1]?.at ?? manifest.roundMs;
    fail(!ids.has(scene.id), `${scene.id}: duplicate scene ID`); ids.add(scene.id);
    fail(Number.isInteger(scene.at) && scene.at >= 0 && end > scene.at, `${scene.id}: invalid release ordering`);
    fail(Number.isInteger(scene.durationMs) && scene.at + scene.durationMs === end, `${scene.id}: coverage must be contiguous`);
    if (scene.kind === 'video') {
      const clip = manifest.clips[scene.clip];
      fail(!!clip, `${scene.id}: unknown clip`);
      if (clip) fail((scene.startMs ?? 0) === 0 && (scene.endMs ?? clip.durationMs) === clip.durationMs && clip.durationMs === scene.durationMs, `${scene.id}: full video must match its slot`);
    }
  }
  const decisive = manifest.scenes[6], recap = manifest.scenes[7];
  fail(decisive?.at === 30_000 && ['text-card', 'date'].includes(decisive.kind) && decisive.durationMs === 4_000 && decisive.transition === 'cut', 'native decisive clue must occupy 30000–34000 with cut');
  fail(recap?.at === 34_000 && recap.kind === 'video' && recap.durationMs === 6_000, 'recap must occupy 34000–40000');
  fail(manifest.leakPolicy.until === ([1, 5].includes(manifest.question) ? 40_000 : 30_000), 'question-specific semantic leak boundary is invalid');
  const used = new Set(manifest.scenes.filter((s) => s.kind === 'video').map((s) => s.clip));
  fail(Object.keys(manifest.clips).every((id) => used.has(id)), 'unused active clips are forbidden');
  if (manifest.question === 2) {
    fail(!manifest.clips.c04, 'c04 must remain inactive');
    fail(manifest.sourceRules['q2-july-nevsky'] === 34_000 && manifest.sourceRules['q2-stamp-1957'] === 34_000, 'Q2 July/stamp sources must be recap-only');
  }
  if (manifest.question === 3) {
    fail(manifest.scenes.find((s) => s.id === 'e6')?.transition === 'cut', 'Q3 e6 must retain cut');
    fail(manifest.sourceRules['q3-bautruc-sign-2022'] === 34_000, 'Q3 sign must be recap-only');
  }
  for (const [id, clip] of Object.entries(manifest.clips)) {
    const shots = clip.shots;
    fail(Number.isInteger(clip.durationMs) && clip.durationMs > 0 && clip.durationMs * 24 % 1000 === 0, `${id}: invalid frame-aligned duration`);
    fail(shots.length > 0 && shots[0].start === 0, `${id}: shots must start at zero`);
    let covered = 0;
    for (const [i, sh] of shots.entries()) {
      const where = `${id}/${sh.id}`;
      fail(Number.isInteger(sh.start) && Number.isInteger(sh.dur) && sh.dur > 0 && sh.start >= 0 && sh.start + sh.dur <= clip.durationMs, `${where}: shot outside clip`);
      fail(sh.start <= covered && (i === 0 || sh.start > shots[i - 1].start), `${where}: gap or unordered shot`);
      covered = Math.max(covered, sh.start + sh.dur);
      const cue = (at, label, duration = 0) => fail(Number.isFinite(at) && at >= 0 && at < sh.dur && Number.isFinite(duration) && duration >= 0 && at + duration <= sh.dur, `${where}: ${label} outside shot`);
      for (const key of ['captions', 'lines', 'pages', 'ticks', 'cuts']) for (const c of sh[key] ?? []) cue(c.at, key, c.dur ?? 0);
      for (const ln of sh.lines ?? []) if (ln.count) cue(ln.at, 'count-up', ln.countMs ?? 900);
      if (sh.railMs !== undefined) fail(sh.railMs > 0 && sh.railMs <= sh.dur, `${where}: rail animation outside shot`);
      if (sh.firstAt !== undefined && sh.stepMs !== undefined) cue(sh.firstAt + ((sh.members ?? 5) - 1) * sh.stepMs, 'last member');
      for (const key of ['revealAt', 'raiseAt', 'firstAt', 'mergeAt']) if (sh[key] !== undefined) cue(sh[key], key, key === 'mergeAt' ? sh.mergeMs ?? 0 : 0);
      for (const at of sh.reveal ?? []) cue(at, 'reveal');
      for (const at of sh.queue?.steps ?? []) cue(at, 'queue step');
      if (sh.handoff) cue(sh.handoff.at, 'handoff', sh.handoff.ms);
      if (sh.in) fail(sh.in.type === 'fade' && sh.in.ms > 0 && sh.in.ms <= sh.dur, `${where}: invalid internal transition`);
    }
    fail(covered === clip.durationMs, `${id}: shots must cover the complete clip`);
  }
  return errors;
}
