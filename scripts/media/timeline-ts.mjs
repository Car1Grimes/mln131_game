// Prints the scene timeline of a production manifest as TypeScript for server/content/questions.ts.
// The validator (validate-media.mjs) checks that questions.ts and the manifest stay identical.
//
//   node scripts/media/timeline-ts.mjs media/q4/manifest.json
import { readFileSync } from 'node:fs';

const manifest = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const q = (s) => `'${String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n').replace(/\r/g, '\\r')}'`;
const num = (n) => (n >= 1_000 ? String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '_') : String(n));
const lines = manifest.scenes.map((s) => {
  const f = [`id: ${q(s.id)}`, `kind: ${q(s.kind)}`, `at: ${num(s.at)}`, `transition: ${q(s.transition)}`];
  if (s.durationMs) f.push(`durationMs: ${num(s.durationMs)}`);
  if (s.kind === 'video') {
    const c = manifest.clips[s.clip];
    f.push(`media: { assetId: ${q(c.assetId)} }`, `credit: ${q(c.credit)}`);
  } else {
    for (const k of ['date', 'label', 'heading', 'body', 'value', 'unit', 'source']) if (s[k] !== undefined) f.push(`${k}: ${q(s[k])}`);
  }
  return `    { ${f.join(', ')} },`;
});
console.log(`  return [\n${lines.join('\n')}\n  ];`);
