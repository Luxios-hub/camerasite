const assert = require('node:assert/strict');
const test = require('node:test');

const ENV_MODULE_PATH = require.resolve('../src/config/env');

function loadEnvWith(overrides) {
  const originalEnv = { ...process.env };
  delete require.cache[ENV_MODULE_PATH];

  process.env = { ...overrides };
  try {
    return require('../src/config/env');
  } finally {
    delete require.cache[ENV_MODULE_PATH];
    process.env = originalEnv;
  }
}

test('production rejects sample environment placeholder values', () => {
  assert.throws(
    () => loadEnvWith({
      NODE_ENV: 'production',
      PORT: '3000',
      DATABASE_URL: 'postgres://camerasnyc:change-me@localhost:5432/camerasnyc',
      SESSION_SECRET: 'replace-with-a-long-random-string',
      PUBLIC_BASE_URL: 'https://camerasnyc.com',
      UPLOAD_ROOT: 'uploads'
    }),
    /placeholder/
  );
});
