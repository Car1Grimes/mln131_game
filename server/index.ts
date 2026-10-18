import { resolve } from 'node:path';
import { loadConfig } from './config';
import { startApp } from './app';

const config = loadConfig();
const app = await startApp(
  {
    dbPath: config.dbPath,
    adminPassword: config.adminPassword,
    roundDurationMs: config.roundDurationMs,
    staticDir: config.staticDir ? resolve(config.staticDir) : null,
  },
  config.port,
  config.host,
);

console.log(`THE HIDDEN CONNECTION server: ${app.url}`);
console.log(`  database: ${config.dbPath}`);
console.log(`  round duration: ${config.roundDurationMs / 1000}s`);
const skipped = app.engine.unreleasableScenes();
if (skipped.length) {
  console.log(`  TEST round length: ${skipped.length} scene(s) at/after the deadline will not be released (production rounds are 60 s)`);
}
if (config.generatedPassword) {
  console.log(`  admin password (generated for this run; set ADMIN_PASSWORD to fix it): ${config.adminPassword}`);
}

const shutdown = () => {
  void app.close().then(() => process.exit(0));
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
