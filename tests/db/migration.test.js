const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const test = require('node:test');
const { Pool } = require('pg');

const MIGRATION_MODULE_PATH = path.join(__dirname, '..', '..', 'src', 'db', 'migrate.js');
const INITIAL_SCHEMA_PATH = path.join(
  __dirname,
  '..',
  '..',
  'src',
  'db',
  'migrations',
  '001_initial_schema.sql'
);

const REQUIRED_CORE_TABLES = [
  'admin_users',
  'site_settings',
  'media_assets',
  'pages',
  'content_blocks',
  'content_items',
  'leads',
  'admin_audit_log',
  'session',
  'schema_migrations'
];

test('migration module exports a callable migration function', () => {
  const migrate = require(MIGRATION_MODULE_PATH);

  assert.equal(typeof migrate, 'function');
});

test('initial schema SQL declares all required core tables', async () => {
  const sql = await fs.readFile(INITIAL_SCHEMA_PATH, 'utf8');

  assert.match(sql, /create\s+extension\s+if\s+not\s+exists\s+pgcrypto/i);

  for (const tableName of REQUIRED_CORE_TABLES) {
    assert.match(
      sql,
      new RegExp(`create\\s+table\\s+(?:if\\s+not\\s+exists\\s+)?${tableName}\\b`, 'i'),
      `expected initial schema to create ${tableName}`
    );
  }

  assert.match(sql, /unique\s*\(\s*page_id\s*,\s*block_key\s*\)/i);
  assert.match(sql, /status\s+text\s+not\s+null\s+default\s+'new'/i);
});

test('migration runner serializes runners and records migrations conflict-safely', async () => {
  const source = await fs.readFile(MIGRATION_MODULE_PATH, 'utf8');

  assert.match(source, /pg_advisory_lock/i);
  assert.match(source, /pg_advisory_unlock/i);
  assert.match(source, /on\s+conflict\s*\(\s*filename\s*\)\s+do\s+nothing/i);
});

test(
  'runs migrations against TEST_DATABASE_URL and creates core tables',
  { skip: process.env.TEST_DATABASE_URL ? false : 'Skipping DB integration: TEST_DATABASE_URL is not set.' },
  async () => {
    const migrate = require(MIGRATION_MODULE_PATH);
    const logger = { log() {} };

    await migrate({ databaseUrl: process.env.TEST_DATABASE_URL, logger });

    const pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL });
    try {
      const result = await pool.query(
        `
          select table_name
          from information_schema.tables
          where table_schema = 'public'
            and table_name = any($1::text[])
          order by table_name
        `,
        [REQUIRED_CORE_TABLES]
      );

      const existingTables = new Set(result.rows.map((row) => row.table_name));
      for (const tableName of REQUIRED_CORE_TABLES) {
        assert.equal(existingTables.has(tableName), true, `expected ${tableName} to exist`);
      }
    } finally {
      await pool.end();
    }
  }
);
