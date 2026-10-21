import { resolve } from 'node:path';
import { ConfigError, loadConfig } from './config';
import { startApp } from './app';

let config: ReturnType<typeof loadConfig>;
try {
  config = loadConfig();
} catch (err) {
  if (!(err instanceof ConfigError)) throw err;
  console.error(`configuration error: ${err.message}`);
  process.exit(1);
}
const app = await startApp(
  {
    dbPath: config.dbPath,
    adminPassword: config.adminPassword,
    roundDurationMs: config.roundDurationMs,
    staticDir: config.staticDir ? resolve(config.staticDir) : null,
    screenSessionTtlMs: config.screenSessionTtlMs,
    screenPairingTtlMs: config.screenPairingTtlMs,
    trustProxy: config.trustProxy,
  },
  config.port,
  config.host,
);

console.log(`THE HIDDEN CONNECTION server: ${app.url}`);
console.log(`  database: ${config.dbPath}`);
console.log(`  round duration: ${config.roundDurationMs / 1000}s`);
console.log(`  projector session / pairing TTL: ${config.screenSessionTtlMs / 60_000} min / ${config.screenPairingTtlMs / 1000} s`);
console.log(`  trust proxy: ${config.trustProxy === false ? 'off (client IP = TCP peer)' : config.trustProxy}`);
const skipped = app.engine.unreleasableScenes();
if (skipped.length) {
  console.log(`  TEST round length: ${skipped.length} scene(s) at/after the deadline will not be released (production rounds are 40 s)`);
}
if (config.generatedPassword) {
  console.log(`  admin password (generated for this run; set ADMIN_PASSWORD to fix it): ${config.adminPassword}`);
}

const shutdown = () => {
  void app.close().then(() => process.exit(0));
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
