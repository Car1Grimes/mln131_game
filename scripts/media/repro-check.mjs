// Reproducibility check: builds every clip of a manifest twice from scratch and compares the
// sha256 of the outputs. Writes <manifest dir>/repro-report.json. The clips from the second build
// stay in place (identical to the first when the check passes).
//
//   node scripts/media/repro-check.mjs media/q4/manifest.json [--only c07,c08]
import { spawnSync } from 'node:child_process';
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';

const ROOT = resolve(new URL('../..', import.meta.url).pathname);
const args = process.argv.slice(2);
const manifestPath = resolve(args.find((a) => a.endsWith('.json')) ?? 'media/q2/manifest.json');
const reportPath = join(dirname(manifestPath), 'build-report.json');
const only = args.includes('--only') ? ['--only', args[args.indexOf('--only') + 1]] : [];

function build(label) {
  rmSync(join(ROOT, 'media-build', `q${JSON.parse(readFileSync(manifestPath, 'utf8')).question}`), { recursive: true, force: true });
  const t0 = Date.now();
  const r = spawnSync(process.execPath, [join(ROOT, 'scripts/media/build-clips.mjs'), manifestPath, ...only], { cwd: ROOT, encoding: 'utf8' });
  process.stdout.write(`${label}: ${r.stdout}`);
  if (r.status !== 0) {
    console.error(r.stderr);
    process.exit(1);
  }
  const clips = JSON.parse(readFileSync(reportPath, 'utf8')).clips;
  return { ms: Date.now() - t0, hashes: Object.fromEntries(Object.entries(clips).map(([k, c]) => [k, c.sha256])) };
}

const a = build('build 1');
const b = build('build 2');
const ids = Object.keys(b.hashes).filter((k) => !only.length || only[1].split(',').includes(k));
const rows = ids.map((id) => ({ clip: id, build1: a.hashes[id], build2: b.hashes[id], identical: a.hashes[id] === b.hashes[id] }));
const ok = rows.every((r) => r.identical);
const out = join(dirname(manifestPath), 'repro-report.json');
writeFileSync(out, JSON.stringify({ manifest: relative(ROOT, manifestPath), at: new Date().toISOString(), identical: ok, buildMs: [a.ms, b.ms], clips: rows }, null, 2) + '\n');
for (const r of rows) console.log(`${r.identical ? 'SAME' : 'DIFF'}  ${r.clip}  ${r.build2}`);
console.log(ok ? `REPRODUCIBLE — ${relative(ROOT, out)}` : `NOT REPRODUCIBLE — ${relative(ROOT, out)}`);
process.exit(ok ? 0 : 1);
