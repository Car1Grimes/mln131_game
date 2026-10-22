// Fails the build if any canonical answer (or a clue image) ends up in the client bundle.
// Answers are read from the server-only content file, so this check cannot drift from the data.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const dist = resolve(root, process.argv[2] ?? 'dist');
const source = readFileSync(join(root, 'server/content/questions.ts'), 'utf8');
const answers = [...source.matchAll(/answer:\s*'([^']+)'/g)].map((m) => m[1]);
if (answers.length !== 6) {
  console.error(`check-bundle: expected 6 answers in server/content/questions.ts, found ${answers.length}`);
  process.exit(1);
}

// Orientation prompts are released by the server at each question's intro: never compiled into the client.
const prompts = [...source.matchAll(/prompt:\s*'([^']+)'/g)].map((m) => m[1]);
if (prompts.length !== 6) {
  console.error(`check-bundle: expected 6 orientation prompts in server/content/questions.ts, found ${prompts.length}`);
  process.exit(1);
}

// Media credits are server-only (sent inside a closed round's reveal). No source URL, creator or
// registry text may be compiled into the client.
const registry = JSON.parse(readFileSync(join(root, 'media/sources.json'), 'utf8')).sources;
const creditNeedles = [
  ...new Set(
    registry.flatMap((s) => [s.page, s.url, s.commons, s.creditName, s.licenceEvidence].filter((x) => typeof x === 'string' && x.length >= 12)),
  ),
  'commons.wikimedia.org',
];

const strip = (s) => s.normalize('NFKD').replace(/\p{M}/gu, '').replace(/[đĐ]/g, 'd');
const normalized = (s) => strip(s).toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
const escapeUnicode = (s) => [...s].map((c) => (c.charCodeAt(0) > 127 ? '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0') : c)).join('');

function needles(answer) {
  const forms = new Set([answer, answer.normalize('NFC'), answer.normalize('NFD'), answer.toLowerCase(), strip(answer), strip(answer).toLowerCase()]);
  for (const f of [...forms]) {
    forms.add(escapeUnicode(f));
    forms.add(escapeUnicode(f).toUpperCase().replace(/\\U/g, '\\u'));
  }
  // The squashed normal form is distinctive only for longer answers ("wto" could occur in random identifiers).
  if (normalized(answer).length >= 6) forms.add(normalized(answer));
  return [...forms].filter((f) => f.length >= 3);
}

const files = [];
const walk = (dir) => {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p);
    else files.push(p);
  }
};
walk(dist);

const problems = [];
for (const file of files) {
  const rel = relative(root, file);
  if (/clues?\//.test(rel) || /\.(webp|jpe?g|png|mp4|webm)$/i.test(rel)) problems.push(`${rel}: media file shipped in the client bundle`);
  if (!/\.(js|mjs|css|html|json|map|svg|txt)$/.test(file)) continue;
  const text = readFileSync(file, 'utf8');
  for (const answer of answers) {
    for (const needle of needles(answer)) {
      const isShortUpper = needle === 'WTO';
      const found = isShortUpper ? /(^|[^A-Za-z])WTO([^A-Za-z]|$)/.test(text) : text.includes(needle);
      if (found) problems.push(`${rel}: contains answer form "${needle}"`);
    }
  }
  for (const prompt of prompts) {
    for (const needle of new Set([prompt, prompt.normalize('NFD'), escapeUnicode(prompt), strip(prompt)])) {
      if (text.includes(needle)) problems.push(`${rel}: contains orientation prompt "${prompt.slice(0, 40)}…"`);
    }
  }
  for (const needle of creditNeedles) if (text.includes(needle)) problems.push(`${rel}: contains source-registry text "${needle.slice(0, 60)}"`);
}

if (problems.length) {
  console.error('check-bundle FAILED — answers/prompts must never ship to clients:\n  ' + problems.join('\n  '));
  process.exit(1);
}
console.log(`check-bundle: OK (${files.length} files, ${answers.length} answers, ${prompts.length} prompts, ${creditNeedles.length} source-registry strings, no leaks)`);
