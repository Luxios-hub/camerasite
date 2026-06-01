const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');
const express = require('express');
const request = require('supertest');

const initialContent = require('../../src/db/seeds/initialContent');
const { createPublicRouter } = require('../../src/routes/publicRoutes');
const { createSeedRepository } = require('../../src/services/pageViewModel');

const SUCCESS_MESSAGE = /Thanks, your quote request has been received/i;

function createFakeLeadRepository() {
  const created = [];

  return {
    created,
    async createLead(input, requestMeta) {
      created.push({ input, requestMeta });

      return {
        id: 'lead-1',
        ...input,
        ...requestMeta
      };
    }
  };
}

function createPublicTestApp({ leadRepository } = {}) {
  const app = express();

  app.set('views', path.join(__dirname, '..', '..', 'src', 'views'));
  app.set('view engine', 'ejs');
  app.use(express.urlencoded({ extended: false }));
  app.use(express.json());
  app.use(createPublicRouter({
    repository: createSeedRepository(initialContent),
    leadRepository
  }));

  return app;
}

function validForm(overrides = {}) {
  return {
    name: 'Alice Installer',
    phone: '212-555-0199',
    email: 'alice@example.com',
    zip: '11201',
    type: 'Residential - apartment / condo',
    cameras: '3-4',
    notes: 'Lobby and rear door.',
    ...overrides
  };
}

test('POST /contact/quote inserts a valid lead and renders a non-sensitive success state', async () => {
  const leadRepository = createFakeLeadRepository();
  const app = createPublicTestApp({ leadRepository });

  const response = await request(app)
    .post('/contact/quote')
    .set('User-Agent', 'contact-lead-test')
    .send(validForm())
    .expect(200)
    .expect('content-type', /html/);

  assert.equal(leadRepository.created.length, 1);
  assert.deepEqual(leadRepository.created[0].input, {
    name: 'Alice Installer',
    phone: '212-555-0199',
    email: 'alice@example.com',
    zip: '11201',
    property_type: 'Residential - apartment / condo',
    camera_count: '3-4',
    notes: 'Lobby and rear door.'
  });
  assert.equal(leadRepository.created[0].requestMeta.source_path, '/contact/quote');
  assert.equal(leadRepository.created[0].requestMeta.user_agent, 'contact-lead-test');
  assert.equal(typeof leadRepository.created[0].requestMeta.ip_address, 'string');
  assert.match(response.text, SUCCESS_MESSAGE);
  assert.doesNotMatch(response.text, /alice@example\.com/);
  assert.doesNotMatch(response.text, /Lobby and rear door\./);
});

test('POST /contact/quote returns field errors and preserves values for invalid email and zip', async () => {
  const leadRepository = createFakeLeadRepository();
  const app = createPublicTestApp({ leadRepository });

  const response = await request(app)
    .post('/contact/quote')
    .send(validForm({
      email: 'not-an-email',
      zip: '12ab',
      type: 'Commercial - office',
      cameras: '5-8',
      notes: 'Please preserve this detail.'
    }))
    .expect(200)
    .expect('content-type', /html/);

  assert.equal(leadRepository.created.length, 0);
  assert.match(response.text, /id="email-error"/);
  assert.match(response.text, /Enter a valid email address\./);
  assert.match(response.text, /id="zip-error"/);
  assert.match(response.text, /Enter a 5-digit ZIP code\./);
  assert.match(response.text, /value="not-an-email"/);
  assert.match(response.text, /value="12ab"/);
  assert.match(response.text, /<option value="Commercial - office" selected>Commercial - office<\/option>/);
  assert.match(response.text, /<option value="5-8" selected>5-8<\/option>/);
  assert.match(response.text, />Please preserve this detail\.<\/textarea>/);
});

test('POST /contact/quote treats honeypot submissions as success without inserting a lead', async () => {
  const leadRepository = createFakeLeadRepository();
  const app = createPublicTestApp({ leadRepository });

  const response = await request(app)
    .post('/contact/quote')
    .send(validForm({
      email: 'honeypot@example.com',
      'bot-field': 'filled by bot'
    }))
    .expect(200)
    .expect('content-type', /html/);

  assert.equal(leadRepository.created.length, 0);
  assert.match(response.text, SUCCESS_MESSAGE);
  assert.doesNotMatch(response.text, /honeypot@example\.com/);
});

test('POST /contact/quote requires a name', async () => {
  const leadRepository = createFakeLeadRepository();
  const app = createPublicTestApp({ leadRepository });

  const response = await request(app)
    .post('/contact/quote')
    .send(validForm({ name: '' }))
    .expect(200)
    .expect('content-type', /html/);

  assert.equal(leadRepository.created.length, 0);
  assert.match(response.text, /id="name-error"/);
  assert.match(response.text, /Name is required\./);
});

test('POST /contact/quote enforces the name max length', async () => {
  const leadRepository = createFakeLeadRepository();
  const app = createPublicTestApp({ leadRepository });

  const response = await request(app)
    .post('/contact/quote')
    .send(validForm({ name: 'A'.repeat(121) }))
    .expect(200)
    .expect('content-type', /html/);

  assert.equal(leadRepository.created.length, 0);
  assert.match(response.text, /id="name-error"/);
  assert.match(response.text, /Name must be 120 characters or fewer\./);
});

test('leadRepository createLead inserts schema fields with request metadata through an injected client', async () => {
  const { createLeadRepository } = require('../../src/repositories/leadRepository');
  const queries = [];
  const db = {
    async query(sql, params) {
      queries.push({ sql, params });

      return {
        rows: [{
          id: 'lead-1',
          name: params[0],
          phone: params[1],
          email: params[2],
          zip: params[3],
          property_type: params[4],
          camera_count: params[5],
          notes: params[6],
          status: params[7],
          source_path: params[8],
          ip_address: params[9],
          user_agent: params[10],
          created_at: 'created-at',
          updated_at: 'updated-at'
        }]
      };
    }
  };
  const repository = createLeadRepository(db);

  const lead = await repository.createLead(
    {
      name: 'Alice Installer',
      phone: '212-555-0199',
      email: 'alice@example.com',
      zip: '11201',
      property_type: 'Residential - apartment / condo',
      camera_count: '3-4',
      notes: 'Lobby and rear door.'
    },
    {
      source_path: '/contact/quote',
      ip_address: '127.0.0.1',
      user_agent: 'contact-lead-test'
    }
  );

  assert.match(queries[0].sql, /insert into leads/i);
  assert.deepEqual(queries[0].params, [
    'Alice Installer',
    '212-555-0199',
    'alice@example.com',
    '11201',
    'Residential - apartment / condo',
    '3-4',
    'Lobby and rear door.',
    'new',
    '/contact/quote',
    '127.0.0.1',
    'contact-lead-test'
  ]);
  assert.equal(lead.propertyType, 'Residential - apartment / condo');
  assert.equal(lead.cameraCount, '3-4');
  assert.equal(lead.sourcePath, '/contact/quote');
  assert.equal(lead.ipAddress, '127.0.0.1');
  assert.equal(lead.userAgent, 'contact-lead-test');
});

test('leadRepository lists, reads, and updates leads through an injected client', async () => {
  const { createLeadRepository } = require('../../src/repositories/leadRepository');
  const calls = [];
  const row = {
    id: 'lead-1',
    name: 'Alice Installer',
    phone: '212-555-0199',
    email: 'alice@example.com',
    zip: '11201',
    property_type: 'Residential - apartment / condo',
    camera_count: '3-4',
    notes: 'Lobby and rear door.',
    status: 'new',
    source_path: '/contact/quote',
    ip_address: '127.0.0.1',
    user_agent: 'contact-lead-test',
    created_at: 'created-at',
    updated_at: 'updated-at'
  };
  const db = {
    async query(sql, params = []) {
      calls.push({ sql, params });

      if (/update leads/i.test(sql)) {
        return { rows: [{ ...row, status: params[1], updated_at: 'updated-now' }] };
      }

      return { rows: [row] };
    }
  };
  const repository = createLeadRepository(db);

  const leads = await repository.listLeads({ status: 'new', limit: 10, offset: 5 });
  const lead = await repository.getLead('lead-1');
  const updated = await repository.updateLeadStatus('lead-1', 'contacted');

  assert.match(calls[0].sql, /where status = \$1/i);
  assert.match(calls[0].sql, /order by created_at desc/i);
  assert.deepEqual(calls[0].params, ['new', 10, 5]);
  assert.match(calls[1].sql, /where id = \$1/i);
  assert.deepEqual(calls[1].params, ['lead-1']);
  assert.match(calls[2].sql, /update leads/i);
  assert.deepEqual(calls[2].params, ['lead-1', 'contacted']);
  assert.equal(leads[0].propertyType, 'Residential - apartment / condo');
  assert.equal(lead.id, 'lead-1');
  assert.equal(updated.status, 'contacted');
  assert.equal(updated.updatedAt, 'updated-now');
});
