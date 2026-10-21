// Online SQLite backup (M4.1): a consistent copy while the server keeps running (WAL-safe).
//
//   npm run backup -- [DB_PATH] [BACKUP_DIR]      defaults: $DB_PATH or data/hidden-connection.sqlite, backups/
//
// Backups contain team PINs and answers: keep them off git (backups/ is ignored) and off shared drives.
import { mkdirSync } from 'node:fs';
import { basename, join } from 'node:path';
import Database from 'better-sqlite3';

const src = process.argv[2] ?? process.env.DB_PATH ?? 'data/hidden-connection.sqlite';
const dir = process.argv[3] ?? process.env.BACKUP_DIR ?? 'backups';
mkdirSync(dir, { recursive: true, mode: 0o700 });
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const out = join(dir, `${basename(src, '.sqlite')}-${stamp}.sqlite`);
const db = new Database(src, { readonly: true, fileMustExist: true });
await db.backup(out);
db.close();
const check = new Database(out, { readonly: true });
const ok = check.pragma('integrity_check', { simple: true });
const rounds = check.prepare('SELECT COUNT(*) AS n FROM rounds').get().n;
check.close();
console.log(`backup ${ok === 'ok' ? 'OK' : `FAILED (${ok})`}: ${out} (${rounds} rounds)`);
process.exit(ok === 'ok' ? 0 : 1);
