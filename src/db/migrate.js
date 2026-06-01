const fs = require('node:fs/promises');
const path = require('node:path');
const { pool, createPool, endPool } = require('./pool');

const DEFAULT_MIGRATIONS_DIR = path.join(__dirname, 'migrations');
const MIGRATION_LOCK_KEY = 'camerasnyc_schema_migrations';

function writeLog(logger, message) {
  if (logger && typeof logger.log === 'function') {
    logger.log(message);
  }
}

async function ensureSchemaMigrations(client) {
  await client.query(`
    create table if not exists schema_migrations (
      filename text primary key,
      applied_at timestamptz not null default now()
    )
  `);
}

async function listMigrationFiles(migrationsDir) {
  const entries = await fs.readdir(migrationsDir);

  return entries
    .filter((entry) => entry.endsWith('.sql'))
    .sort((left, right) => left.localeCompare(right));
}

async function runMigrations(options = {}) {
  const migrationsDir = options.migrationsDir || DEFAULT_MIGRATIONS_DIR;
  const logger = options.logger === undefined ? console : options.logger;
  const activePool = options.pool || (options.databaseUrl ? createPool(options.databaseUrl) : pool);
  const shouldEndPool = !options.pool && Boolean(options.databaseUrl);
  const client = await activePool.connect();
  let lockAcquired = false;

  try {
    await client.query('select pg_advisory_lock(hashtext($1))', [MIGRATION_LOCK_KEY]);
    lockAcquired = true;

    await ensureSchemaMigrations(client);

    const files = await listMigrationFiles(migrationsDir);
    const appliedResult = await client.query('select filename from schema_migrations');
    const appliedMigrations = new Set(appliedResult.rows.map((row) => row.filename));

    for (const filename of files) {
      if (appliedMigrations.has(filename)) {
        writeLog(logger, `Skipped migration ${filename}`);
        continue;
      }

      const migrationSql = await fs.readFile(path.join(migrationsDir, filename), 'utf8');

      await client.query('begin');
      try {
        await client.query(migrationSql);
        await client.query(
          'insert into schema_migrations (filename) values ($1) on conflict (filename) do nothing',
          [filename]
        );
        await client.query('commit');
        appliedMigrations.add(filename);
        writeLog(logger, `Applied migration ${filename}`);
      } catch (error) {
        await client.query('rollback');
        throw error;
      }
    }
  } finally {
    if (lockAcquired) {
      await client.query('select pg_advisory_unlock(hashtext($1))', [MIGRATION_LOCK_KEY]);
    }

    client.release();

    if (shouldEndPool) {
      await activePool.end();
    }
  }
}

if (require.main === module) {
  runMigrations()
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    })
    .finally(async () => {
      await endPool();
    });
}

module.exports = runMigrations;
