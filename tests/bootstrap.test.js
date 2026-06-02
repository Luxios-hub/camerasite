const assert = require('node:assert/strict');
const test = require('node:test');
const request = require('supertest');
const { createTestApp } = require('./helpers/testApp');

const APP_MODULE_PATH = require.resolve('../src/app');
const ENV_MODULE_PATH = require.resolve('../src/config/env');
const POOL_MODULE_PATH = require.resolve('../src/db/pool');

function loadCreateAppWithEnv(env) {
  const originalEnv = { ...process.env };

  delete require.cache[APP_MODULE_PATH];
  delete require.cache[ENV_MODULE_PATH];
  delete require.cache[POOL_MODULE_PATH];
  process.env = { ...originalEnv, ...env };

  try {
    return require('../src/app').createApp;
  } finally {
    process.env = originalEnv;
    delete require.cache[APP_MODULE_PATH];
    delete require.cache[ENV_MODULE_PATH];
    delete require.cache[POOL_MODULE_PATH];
  }
}

test('GET /healthz returns ok JSON', async () => {
  const app = createTestApp();

  const response = await request(app)
    .get('/healthz')
    .expect(200)
    .expect('content-type', /json/);

  assert.deepEqual(response.body, { ok: true });
});

test('production app trusts reverse proxy so secure admin session cookies are set behind HTTPS proxy', async () => {
  const createApp = loadCreateAppWithEnv({
    NODE_ENV: 'production',
    PORT: '3000',
    DATABASE_URL: 'postgres://camerasnyc:strong-password@localhost:5432/camerasnyc',
    SESSION_SECRET: 'production-session-secret-with-enough-length',
    PUBLIC_BASE_URL: 'https://camerasnyc.com',
    UPLOAD_ROOT: 'uploads'
  });
  const app = createApp({
    session: {
      useMemoryStore: true,
      secret: 'production-session-secret-with-enough-length'
    }
  });

  assert.equal(app.get('trust proxy'), 1);

  const response = await request(app)
    .get('/admin/login')
    .set('X-Forwarded-Proto', 'https')
    .expect(200)
    .expect('content-type', /html/);

  const cookies = response.headers['set-cookie'] || [];
  assert.ok(cookies.some((cookie) => {
    return cookie.includes('camerasnyc.sid=')
      && cookie.includes('Secure')
      && cookie.includes('SameSite=Lax');
  }), 'expected a secure admin session cookie behind the HTTPS reverse proxy');
});

test('public pages include a CSP nonce that allows JSON-LD without unsafe inline scripts', async () => {
  const app = createTestApp();

  const response = await request(app)
    .get('/')
    .expect(200)
    .expect('content-type', /html/);
  const csp = response.headers['content-security-policy'];

  assert.ok(csp, 'expected Content-Security-Policy header');
  const scriptDirective = csp.split(';').find((part) => part.trim().startsWith('script-src'));
  assert.ok(scriptDirective, 'expected script-src directive');
  assert.doesNotMatch(scriptDirective, /'unsafe-inline'/);

  const nonceMatch = scriptDirective.match(/'nonce-([^']+)'/);
  assert.ok(nonceMatch, 'expected script-src nonce');
  assert.ok(
    response.text.includes(`<script type="application/ld+json" nonce="${nonceMatch[1]}">`),
    'expected JSON-LD script to carry the CSP nonce'
  );
});
