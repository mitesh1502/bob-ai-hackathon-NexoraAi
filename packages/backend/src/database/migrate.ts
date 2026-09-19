import fs from 'fs';
import path from 'path';
import { pool } from './db';
import { logger } from '../utils/logger';

async function migrate() {
  const migrationsDir = path.join(__dirname, 'migrations');
  const migrationFiles = fs
    .readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  // Track applied migrations
  await pool.query(`
    CREATE TABLE IF NOT EXISTS _migrations (
      filename TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  for (const file of migrationFiles) {
    const { rows } = await pool.query(
      'SELECT filename FROM _migrations WHERE filename = $1',
      [file]
    );
    if (rows.length > 0) {
      logger.info(`[migrate] Already applied: ${file}`);
      continue;
    }

    const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
    logger.info(`[migrate] Applying: ${file}`);
    await pool.query(sql);
    await pool.query('INSERT INTO _migrations(filename) VALUES($1)', [file]);
    logger.info(`[migrate] Done: ${file}`);
  }

  logger.info('[migrate] All migrations applied.');
  await pool.end();
}

migrate().catch((err) => {
  logger.error('Migration failed:', err);
  process.exit(1);
});
