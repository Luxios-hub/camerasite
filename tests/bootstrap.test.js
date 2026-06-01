const assert = require('node:assert/strict');
const test = require('node:test');
const request = require('supertest');
const { createTestApp } = require('./helpers/testApp');

test('GET /healthz returns ok JSON', async () => {
  const app = createTestApp();

  const response = await request(app)
    .get('/healthz')
    .expect(200)
    .expect('content-type', /json/);

  assert.deepEqual(response.body, { ok: true });
});
