// SYNTHETIC trial server (M4.1, Mode A: Mac + Cloudflare Quick Tunnel). Runs the real server code and
// the production client build (dist/) with a synthetic game: six questions whose timelines copy only the
// TIMING of the production montages (release offsets, scene kinds, transitions, video durations) and
// whose clips are generated test patterns of the same duration and roughly the same file size. No
// production text, answer, photo, credit or clip is ever served, so external testers see nothing whose
// reuse rights are unresolved, and network measurements stay representative.
//
//   npm run build
//   ADMIN_PASSWORD="$(openssl rand -base64 18)" TRUST_PROXY=loopback npm run trial
//
// Same environment variables as the real server (server/config.ts). Clips are generated once into
// data/trial-media/ (git-ignored) with the ffmpeg of media-tools/ (or $FFMPEG).
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { startApp } from '../../server/app';
import { ConfigError, loadConfig } from '../../server/config';
import { MediaRegistry } from '../../server/media/registry';
import { synthesize, type TrialAsset } from './synthetic';

const ROOT = resolve(new URL('../..', import.meta.url).pathname);
const MEDIA_ROOT = join(ROOT, 'data/trial-media');
const FFMPEG = process.env.FFMPEG ?? join(ROOT, 'media-tools/node_modules/ffmpeg-static/ffmpeg');
/** Test-pattern H.264 clips (960×540, 24 fps, no audio, faststart) sized like the production clip. */
function generateClips(assets: TrialAsset[]) {
  mkdirSync(MEDIA_ROOT, { recursive: true });
  for (const a of assets) {
    const out = join(MEDIA_ROOT, a.file);
    if (existsSync(out)) continue;
    if (!existsSync(FFMPEG)) throw new Error(`ffmpeg not found at ${FFMPEG} (install media-tools or set FFMPEG)`);
    const seconds = (a.durationMs ?? 5000) / 1000;
    const kbps = Math.max(80, Math.round((a.targetBytes * 8) / seconds / 1000));
    const r = spawnSync(
      FFMPEG,
      ['-v', 'error', '-y', '-f', 'lavfi', '-i', `testsrc2=size=960x540:rate=24:duration=${seconds}`, '-vf', 'noise=alls=18:allf=t',
        '-c:v', 'libx264', '-profile:v', 'main', '-pix_fmt', 'yuv420p', '-b:v', `${kbps}k`, '-maxrate', `${Math.round(kbps * 1.3)}k`, '-bufsize', `${kbps * 2}k`,
        '-an', '-map_metadata', '-1', '-movflags', '+faststart', out],
      { encoding: 'utf8' },
    );
    if (r.status !== 0) throw new Error(`ffmpeg failed for ${a.id}: ${r.stderr}`);
  }
}

let config: ReturnType<typeof loadConfig>;
try {
  config = loadConfig();
} catch (err) {
  if (!(err instanceof ConfigError)) throw err;
  console.error(`configuration error: ${err.message}`);
  process.exit(1);
}
const { questions, assets } = synthesize();
generateClips(assets);
const app = await startApp(
  {
    dbPath: config.dbPath === 'data/hidden-connection.sqlite' ? 'data/trial.sqlite' : config.dbPath,
    adminPassword: config.adminPassword,
    roundDurationMs: config.roundDurationMs,
    staticDir: config.staticDir ? resolve(config.staticDir) : null,
    screenSessionTtlMs: config.screenSessionTtlMs,
    screenPairingTtlMs: config.screenPairingTtlMs,
    trustProxy: config.trustProxy,
    questions,
    media: new MediaRegistry(assets.map(({ targetBytes: _t, ...a }) => a), MEDIA_ROOT),
  },
  config.port,
  config.host,
);
const total = assets.reduce((n, a) => n + statSync(join(MEDIA_ROOT, a.file)).size, 0);
console.log(`SYNTHETIC TRIAL server (no production content): ${app.url}`);
console.log(`  ${questions.length} synthetic questions, ${assets.length} test-pattern clips (${Math.round(total / 1024)} KB) in ${MEDIA_ROOT}`);
console.log(`  trust proxy: ${config.trustProxy === false ? 'off' : config.trustProxy}`);
if (config.generatedPassword) console.log(`  admin password (generated for this run): ${config.adminPassword}`);
const shutdown = () => void app.close().then(() => process.exit(0));
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
