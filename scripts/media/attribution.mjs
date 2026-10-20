// Per-question attribution projection (M3.3-A).
//
//   node --import tsx scripts/media/attribution.mjs          # write server/content/attribution.json
//                                                           # + docs/media-review/ATTRIBUTION-COVERAGE.md
//   node --import tsx scripts/media/attribution.mjs --check  # fail if the committed files are stale
//
// Built only from the production manifests (media/q1..q6/manifest.json: which scene releases which
// clip, which shots each clip contains) and the source registry (media/sources.json). Nothing is
// guessed from question names. The output is SERVER-ONLY: the server attaches a question's entries to
// its RoundReveal, which exists only after the server has closed that round.
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const ROOT = resolve(new URL('../..', import.meta.url).pathname);
export const OUTPUT = 'server/content/attribution.json';
export const REPORT = 'docs/media-review/ATTRIBUTION-COVERAGE.md';

/** Licence codes used in media/sources.json → display name, licence URL, rights class. */
export const LICENCES = {
  'CC-BY-2.0': { name: 'CC BY 2.0', url: 'https://creativecommons.org/licenses/by/2.0/', rights: 'cc' },
  'CC-BY-4.0': { name: 'CC BY 4.0', url: 'https://creativecommons.org/licenses/by/4.0/', rights: 'cc' },
  'CC-BY-SA-2.0': { name: 'CC BY-SA 2.0', url: 'https://creativecommons.org/licenses/by-sa/2.0/', rights: 'cc', sa: 2 },
  'CC-BY-SA-3.0': { name: 'CC BY-SA 3.0', url: 'https://creativecommons.org/licenses/by-sa/3.0/', rights: 'cc', sa: 3 },
  'CC-BY-SA-4.0': { name: 'CC BY-SA 4.0', url: 'https://creativecommons.org/licenses/by-sa/4.0/', rights: 'cc', sa: 4 },
  'OFL-1.1': { name: 'SIL Open Font License 1.1', url: 'https://github.com/google/fonts/blob/main/ofl/bevietnampro/OFL.txt', rights: 'open-font' },
  PD: { name: 'Phạm vi công cộng', url: null, rights: 'pd' },
  // Jurisdiction-qualified: never presented as worldwide public domain.
  'PD-OLD': { name: 'Phạm vi công cộng do hết thời hạn bảo hộ (ở phần lớn các quốc gia)', url: null, rights: 'pd-qualified' },
  'PD-USGOV': { name: 'Phạm vi công cộng tại Hoa Kỳ (tác phẩm của chính phủ liên bang)', url: null, rights: 'pd-qualified' },
  'PD-SELF': { name: 'Phạm vi công cộng (tác giả từ bỏ quyền trên toàn thế giới)', url: null, rights: 'pd' },
  'PD-US': { name: 'Phạm vi công cộng tại Hoa Kỳ', url: null, rights: 'pd-qualified' },
  'PD-RU': { name: 'Phạm vi công cộng tại Nga', url: null, rights: 'pd-qualified' },
  'PD-RU-EXEMPT': { name: 'Không thuộc đối tượng bảo hộ theo luật Nga (tem bưu chính)', url: null, rights: 'pd-qualified' },
};
const OWN = {
  id: 'own-graphics',
  kind: 'own',
  creator: 'Nhóm thực hiện trò chơi',
  title: 'Đồ họa động, tranh và sơ đồ minh họa, chữ trong video, dựng phim',
  sourceUrl: null,
  licence: 'Tác phẩm gốc của nhóm thực hiện',
  licenceUrl: null,
  rights: 'own',
  rightsNote: 'Tranh và sơ đồ minh họa do nhóm tự vẽ; không phải ảnh tư liệu.',
};
const GRAPHIC_TYPES = new Set(['date', 'calendar', 'timeline', 'venn', 'typo', 'pool', 'assembly', 'shop', 'coupons', 'locator']);

const sha = (s) => createHash('sha256').update(s).digest('hex');
const readJson = (p) => JSON.parse(readFileSync(join(ROOT, p), 'utf8'));
const commonsTitle = (t) => t.replace(/^File:/, '').replace(/\.(jpe?g|png|tiff?|webp)$/i, '');

/** Every way a shot draws pixels from a source, with the modification wording for it. */
function shotUses(shot) {
  const uses = [];
  const moved = shot.from && shot.to && JSON.stringify(shot.from) !== JSON.stringify(shot.to);
  if (shot.type === 'photo' && shot.source) {
    const mods = ['Cắt khung, thu phóng (không vượt quá độ phân giải gốc)'];
    if (moved) mods.push('Chuyển động khung hình (lia/zoom chậm)');
    if (shot.fit === 'contain') mods.push('Nền mờ dựng từ chính ảnh');
    if (shot.in?.type === 'fade') mods.push('Chuyển cảnh mờ chồng');
    if ((shot.captions ?? []).length || shot.tag) mods.push('Thêm chú thích chữ tiếng Việt');
    uses.push({ id: shot.source, mods });
  }
  if (shot.type === 'locator' && shot.source) uses.push({ id: shot.source, mods: ['Chỉ dùng đường bờ đất liền (không vẽ biên giới), chiếu phẳng, tô màu lại làm bản đồ định vị'] });
  if (shot.background) uses.push({ id: shot.background, mods: ['Làm ảnh nền mờ phía sau đồ họa'] });
  for (const t of shot.ticks ?? []) if (t.thumb) uses.push({ id: t.thumb, mods: ['Thu nhỏ làm ảnh minh họa trên trục thời gian'] });
  for (const id of shot.thumbs ?? []) if (id) uses.push({ id, mods: ['Thu nhỏ, làm mờ trong hình tròn của sơ đồ'] });
  return uses;
}
const hasText = (shot) => shot.type !== 'photo' || (shot.captions ?? []).length > 0 || !!shot.tag;

export function buildAttribution() {
  const registry = readJson('media/sources.json');
  const meta = Object.fromEntries(registry.sources.map((s) => [s.id, s]));
  const problems = [];
  const questions = {};
  const usedIds = new Set();
  const inputs = { 'media/sources.json': sha(readFileSync(join(ROOT, 'media/sources.json'))) };

  for (let n = 1; n <= 6; n++) {
    const path = `media/q${n}/manifest.json`;
    inputs[path] = sha(readFileSync(join(ROOT, path)));
    const manifest = readJson(path);
    const entries = new Map();
    const adaptations = [];
    const own = { ...OWN, modifications: [], usedIn: [] };
    const font = new Set();

    for (const scene of manifest.scenes) {
      if (scene.kind === 'image') problems.push(`q${n} ${scene.id}: native image scenes are not mapped yet`);
      if (scene.kind !== 'video') continue;
      const clip = manifest.clips[scene.clip];
      const use = { sceneId: scene.id, atMs: scene.at, clip: scene.clip };
      const saVersions = [];
      for (const shot of clip.shots) {
        if (GRAPHIC_TYPES.has(shot.type) || (shot.captions ?? []).length || shot.tag) {
          if (!own.usedIn.some((u) => u.clip === scene.clip)) own.usedIn.push(use);
        }
        if (hasText(shot)) font.add(JSON.stringify(use));
        for (const { id, mods } of shotUses(shot)) {
          const s = meta[id];
          if (!s) {
            problems.push(`q${n} ${scene.clip}: source ${id} missing from media/sources.json`);
            continue;
          }
          usedIds.add(id);
          const lic = LICENCES[s.licenceCode];
          if (!lic) problems.push(`${id}: unknown licenceCode ${s.licenceCode}`);
          if (lic?.rights === 'cc' && !lic.url) problems.push(`${id}: CC licence without URL`);
          for (const k of ['creditName', 'page']) if (!s[k]) problems.push(`${id}: missing ${k}`);
          if (lic?.sa) saVersions.push(lic.sa);
          let e = entries.get(id);
          if (!e) {
            e = {
              id,
              kind: s.kind === 'data' ? 'map' : s.kind,
              creator: s.creditName,
              title: s.title ?? (s.commons ? commonsTitle(s.commons) : id),
              sourceUrl: s.page,
              licence: lic?.name ?? s.licence,
              licenceUrl: lic?.url ?? null,
              rights: lic?.rights ?? 'unresolved',
              rightsNote: s.rightsNote ?? null,
              modifications: [],
              usedIn: [],
            };
            entries.set(id, e);
          }
          for (const m of mods) if (!e.modifications.includes(m)) e.modifications.push(m);
          if (!e.usedIn.some((u) => u.clip === scene.clip)) e.usedIn.push(use);
        }
      }
      if (saVersions.length) {
        const v = Math.max(...saVersions);
        const lic = LICENCES[`CC-BY-SA-${v}.0`];
        adaptations.push({ clip: scene.clip, sceneId: scene.id, atMs: scene.at, licence: lic.name, licenceUrl: lic.url });
      }
    }
    // Every photo entry is finally encoded the same way.
    for (const e of entries.values()) if (e.kind === 'photo') e.modifications.push('Xuất thành video H.264 960×540, không âm thanh, không siêu dữ liệu');
    const fontUses = [...font].map((x) => JSON.parse(x));
    if (fontUses.length) {
      const s = meta['font-bevietnampro-bold'];
      const lic = LICENCES[s.licenceCode];
      for (const id of ['font-bevietnampro-bold', 'font-bevietnampro-semibold']) usedIds.add(id);
      entries.set('font-bevietnampro', {
        id: 'font-bevietnampro',
        kind: 'font',
        creator: s.creditName,
        title: s.title,
        sourceUrl: s.page,
        licence: lic.name,
        licenceUrl: lic.url,
        rights: lic.rights,
        rightsNote: null,
        modifications: ['Dùng nguyên bản (đậm, nửa đậm) để hiển thị chữ trong video; không sửa phông'],
        usedIn: fontUses,
      });
    }
    if (own.usedIn.length) entries.set(OWN.id, own);
    const order = { photo: 0, map: 1, own: 2, font: 3 };
    questions[`q${n}`] = {
      entries: [...entries.values()].sort((a, b) => order[a.kind] - order[b.kind] || a.usedIn[0].atMs - b.usedIn[0].atMs),
      adaptations,
    };
  }
  // Every link the client may render must be an absolute https URL (the client re-checks too).
  for (const [q, d] of Object.entries(questions)) {
    for (const e of d.entries) for (const u of [e.sourceUrl, e.licenceUrl]) if (u !== null && !/^https:\/\/[^\s/@]+\//.test(u)) problems.push(`${q}/${e.id}: not an https URL: ${u}`);
    for (const x of d.adaptations) if (!/^https:\/\/creativecommons\.org\//.test(x.licenceUrl)) problems.push(`${q}/${x.clip}: bad licence URL`);
  }
  const unused = registry.sources.filter((s) => !usedIds.has(s.id)).map((s) => s.id);
  if (problems.length) throw new Error(`attribution problems:\n  ${problems.join('\n  ')}`);
  return { $comment: 'GENERATED by scripts/media/attribution.mjs from media/q1..q6/manifest.json and media/sources.json — do not edit. SERVER-ONLY: attached to a RoundReveal after the server closes the round.', inputs, questions, unused };
}

const fmtAt = (ms) => `${Math.floor(ms / 60000)}:${String(Math.floor((ms % 60000) / 1000)).padStart(2, '0')}`;
export function coverageReport(data) {
  const lines = ['# Attribution coverage (generated)', '', `> Generated by \`scripts/media/attribution.mjs\` from the six production manifests and \`media/sources.json\`. Contains source titles that may name answers — docs only.`, ''];
  lines.push('| Question | Entries | Photos | CC-licensed | Public domain | PD (jurisdiction-qualified) | Own work | Font | Map | BY-SA adaptations |', '|---|---|---|---|---|---|---|---|---|---|');
  for (const [q, d] of Object.entries(data.questions)) {
    const c = (f) => d.entries.filter(f).length;
    lines.push(`| ${q.toUpperCase()} | ${d.entries.length} | ${c((e) => e.kind === 'photo')} | ${c((e) => e.rights === 'cc')} | ${c((e) => e.rights === 'pd')} | ${c((e) => e.rights === 'pd-qualified')} | ${c((e) => e.rights === 'own')} | ${c((e) => e.kind === 'font')} | ${c((e) => e.kind === 'map')} | ${d.adaptations.map((a) => `${a.clip} → ${a.licence}`).join(', ') || '—'} |`);
  }
  for (const [q, d] of Object.entries(data.questions)) {
    lines.push('', `## ${q.toUpperCase()}`, '', '| Source | Creator | Licence | Source URL | Used in | Modifications |', '|---|---|---|---|---|---|');
    for (const e of d.entries) {
      lines.push(`| ${e.id} | ${e.creator} | ${e.licence}${e.licenceUrl ? ` (${e.licenceUrl})` : ''}${e.rightsNote ? ` — ${e.rightsNote}` : ''} | ${e.sourceUrl ?? '—'} | ${e.usedIn.map((u) => `${u.sceneId}/${u.clip} @${fmtAt(u.atMs)}`).join(', ')} | ${e.modifications.join('; ') || '—'} |`);
    }
  }
  lines.push('', '## Registry records not used in any production clip', '', data.unused.length ? data.unused.map((id) => `- \`${id}\` (not shown to players, not in any attribution)`).join('\n') : '- none', '');
  return lines.join('\n');
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const data = buildAttribution();
  const json = JSON.stringify(data, null, 2) + '\n';
  const md = coverageReport(data);
  if (process.argv.includes('--check')) {
    const stale = [[OUTPUT, json], [REPORT, md]].filter(([p, c]) => readFileSync(join(ROOT, p), 'utf8') !== c).map(([p]) => p);
    if (stale.length) {
      console.error(`stale: ${stale.join(', ')} — run node --import tsx scripts/media/attribution.mjs`);
      process.exit(1);
    }
    console.log('attribution up to date');
  } else {
    writeFileSync(join(ROOT, OUTPUT), json);
    writeFileSync(join(ROOT, REPORT), md);
    for (const [q, d] of Object.entries(data.questions)) console.log(`${q}: ${d.entries.length} entries, adaptations ${d.adaptations.map((a) => `${a.clip}:${a.licence}`).join(' ') || '—'}`);
    console.log(`unused registry records: ${data.unused.join(', ') || 'none'}`);
  }
}
