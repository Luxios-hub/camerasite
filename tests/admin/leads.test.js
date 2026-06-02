const assert = require('node:assert/strict');
const test = require('node:test');
const request = require('supertest');

const { createApp } = require('../../src/app');

const SESSION_OPTIONS = {
  useMemoryStore: true,
  secret: 'admin-leads-test-secret'
};
const LEAD_1_ID = '11111111-1111-4111-8111-111111111111';
const LEAD_2_ID = '22222222-2222-4222-8222-222222222222';
const MISSING_LEAD_ID = '33333333-3333-4333-8333-333333333333';

function csrfTokenFrom(html) {
  const match = html.match(/name="_csrf"\s+value="([^"]+)"/);
  assert.ok(match, 'expected response HTML to include a CSRF token');
  return match[1];
}

function createFakeAdminRepository(admin) {
  return {
    async findAdminByEmail(email) {
      return String(email).trim().toLowerCase() === admin.email ? admin : null;
    },
    async findAdminById(id) {
      return id === admin.id ? admin : null;
    },
    async markLastLogin() {
      return { ...admin, lastLoginAt: 'now' };
    }
  };
}

function createFakeAuditRepository(seedEvents = []) {
  const events = [...seedEvents];

  return {
    events,
    async logAuditEvent(event) {
      const stored = { id: `audit-${events.length + 1}`, createdAt: 'now', ...event };
      events.push(stored);
      return stored;
    },
    async listAuditEvents({ limit = 5 } = {}) {
      return events.slice(-limit).reverse();
    }
  };
}

function createThrowingAuditRepository(actionToThrow) {
  const repository = createFakeAuditRepository();

  return {
    events: repository.events,
    async logAuditEvent(event) {
      if (event.action === actionToThrow) {
        throw new Error(`audit failed for ${actionToThrow}`);
      }

      return repository.logAuditEvent(event);
    },
    async listAuditEvents(options) {
      return repository.listAuditEvents(options);
    }
  };
}

function createFakeLeadRepository(seedLeads = []) {
  const leads = seedLeads.map((lead) => ({ ...lead }));
  const listCalls = [];
  const getCalls = [];
  const updates = [];

  return {
    leads,
    listCalls,
    getCalls,
    updates,
    async listLeads(filters = {}) {
      listCalls.push({ ...filters });
      let rows = leads.slice().sort((left, right) => String(right.createdAt).localeCompare(String(left.createdAt)));

      if (filters.status) {
        rows = rows.filter((lead) => lead.status === filters.status);
      }

      const offset = Number(filters.offset) || 0;
      const limit = Number(filters.limit) || rows.length;
      return rows.slice(offset, offset + limit).map((lead) => ({ ...lead }));
    },
    async getLead(id) {
      getCalls.push(id);
      const lead = leads.find((currentLead) => currentLead.id === id);
      return lead ? { ...lead } : null;
    },
    async updateLeadStatus(id, status) {
      updates.push({ id, status });
      const lead = leads.find((currentLead) => currentLead.id === id);

      if (!lead) {
        return null;
      }

      lead.status = status;
      lead.updatedAt = '2026-06-02T15:45:00Z';
      return { ...lead };
    },
    async countLeadsByStatus() {
      const counts = new Map();
      for (const lead of leads) {
        counts.set(lead.status, (counts.get(lead.status) || 0) + 1);
      }
      return Array.from(counts, ([status, count]) => ({ status, count }));
    },
    async withTransaction(callback) {
      const transactionRepository = createFakeLeadRepository(leads.map((lead) => ({ ...lead })));
      const result = await callback(transactionRepository);

      leads.splice(0, leads.length, ...transactionRepository.leads.map((lead) => ({ ...lead })));
      listCalls.push(...transactionRepository.listCalls);
      getCalls.push(...transactionRepository.getCalls);
      updates.push(...transactionRepository.updates);
      return result;
    }
  };
}

function sampleLeads() {
  return [
    {
      id: LEAD_1_ID,
      name: 'Alice Lead',
      phone: '212-555-0199',
      email: 'alice@example.com',
      zip: '11201',
      propertyType: 'Residential - apartment / condo',
      cameraCount: '3-4',
      notes: '<script>alert(1)</script> Needs rear door coverage.',
      status: 'new',
      sourcePath: '/contact/quote',
      ipAddress: '203.0.113.10',
      userAgent: 'Lead detail test browser',
      createdAt: '2026-06-01T10:15:00Z',
      updatedAt: '2026-06-01T10:20:00Z'
    },
    {
      id: LEAD_2_ID,
      name: 'Bob Quoted',
      phone: '718-555-0123',
      email: 'bob@example.com',
      zip: '10001',
      propertyType: 'Commercial - office',
      cameraCount: '9-12',
      notes: 'Needs hallway and front desk.',
      status: 'quoted',
      sourcePath: '/contact/quote',
      ipAddress: '203.0.113.20',
      userAgent: 'Filtered lead test browser',
      createdAt: '2026-06-02T09:00:00Z',
      updatedAt: '2026-06-02T09:05:00Z'
    }
  ];
}

async function createAdminLeadsTestApp(options = {}) {
  const { hashPassword } = require('../../src/services/passwords');
  const admin = {
    id: 'admin-1',
    email: 'admin@example.com',
    passwordHash: await hashPassword('correct horse battery staple'),
    displayName: 'Admin User',
    isActive: true
  };
  const leadRepository = options.leadRepository || createFakeLeadRepository(sampleLeads());
  const auditRepository = options.auditRepository || createFakeAuditRepository();
  const app = createApp({
    adminRepository: createFakeAdminRepository(admin),
    auditRepository,
    leadRepository,
    loginRateLimiter: false,
    session: SESSION_OPTIONS
  });

  app.use((error, req, res, next) => {
    if (res.headersSent) {
      next(error);
      return;
    }

    res.status(500).send(error.message);
  });

  return {
    app,
    auditRepository,
    leadRepository
  };
}

async function login(agent) {
  const loginPage = await agent.get('/admin/login').expect(200);
  const csrfToken = csrfTokenFrom(loginPage.text);

  await agent
    .post('/admin/login')
    .type('form')
    .send({
      _csrf: csrfToken,
      email: 'admin@example.com',
      password: 'correct horse battery staple'
    })
    .expect(302);
}

test('lead admin routes redirect logged-out users to login', async () => {
  const { app } = await createAdminLeadsTestApp();

  for (const path of ['/admin/leads', `/admin/leads/${LEAD_1_ID}`]) {
    const response = await request(app)
      .get(path)
      .expect(302);

    assert.equal(response.headers.location, '/admin/login', `${path} should redirect to login`);
  }
});

test('logged-in admin can list leads with required lead fields and detail links', async () => {
  const { app, leadRepository } = await createAdminLeadsTestApp();
  const agent = request.agent(app);

  await login(agent);

  const response = await agent
    .get('/admin/leads')
    .expect(200)
    .expect('content-type', /html/);

  assert.match(response.text, /Lead inbox/);
  assert.match(response.text, /2026-06-02 09:00 UTC/);
  assert.match(response.text, /Bob Quoted/);
  assert.match(response.text, /718-555-0123/);
  assert.match(response.text, /bob@example\.com/);
  assert.match(response.text, /10001/);
  assert.match(response.text, /Commercial - office/);
  assert.match(response.text, /9-12/);
  assert.match(response.text, /quoted/);
  assert.match(response.text, new RegExp(`href="/admin/leads/${LEAD_2_ID}"`));
  assert.deepEqual(leadRepository.listCalls.at(-1), { limit: 100 });
});

test('lead list filters by status query parameter', async () => {
  const { app, leadRepository } = await createAdminLeadsTestApp();
  const agent = request.agent(app);

  await login(agent);

  const response = await agent
    .get('/admin/leads?status=quoted')
    .expect(200)
    .expect('content-type', /html/);

  assert.match(response.text, /Bob Quoted/);
  assert.doesNotMatch(response.text, /Alice Lead/);
  assert.deepEqual(leadRepository.listCalls.at(-1), { status: 'quoted', limit: 100 });
});

test('lead detail shows full contact, note, request metadata, and status fields escaped', async () => {
  const { app } = await createAdminLeadsTestApp();
  const agent = request.agent(app);

  await login(agent);

  const response = await agent
    .get(`/admin/leads/${LEAD_1_ID}`)
    .expect(200)
    .expect('content-type', /html/);

  assert.match(response.text, /Alice Lead/);
  assert.match(response.text, /212-555-0199/);
  assert.match(response.text, /alice@example\.com/);
  assert.match(response.text, /11201/);
  assert.match(response.text, /Residential - apartment \/ condo/);
  assert.match(response.text, /3-4/);
  assert.match(response.text, /new/);
  assert.match(response.text, /\/contact\/quote/);
  assert.match(response.text, /203\.0\.113\.10/);
  assert.match(response.text, /Lead detail test browser/);
  assert.match(response.text, /2026-06-01 10:15 UTC/);
  assert.match(response.text, /2026-06-01 10:20 UTC/);
  assert.doesNotMatch(response.text, /<script>alert\(1\)<\/script>/);
  assert.match(response.text, /&lt;script&gt;alert\(1\)&lt;\/script&gt; Needs rear door coverage\./);
});

test('status update persists the new status and writes a lead audit event', async () => {
  const { app, auditRepository, leadRepository } = await createAdminLeadsTestApp();
  const agent = request.agent(app);

  await login(agent);
  auditRepository.events.length = 0;
  const detailPage = await agent.get(`/admin/leads/${LEAD_1_ID}`).expect(200);
  const csrfToken = csrfTokenFrom(detailPage.text);

  const response = await agent
    .post(`/admin/leads/${LEAD_1_ID}/status`)
    .type('form')
    .send({
      _csrf: csrfToken,
      status: 'contacted'
    })
    .expect(302);

  assert.equal(response.headers.location, `/admin/leads/${LEAD_1_ID}?updated=1`);
  assert.deepEqual(leadRepository.updates, [{ id: LEAD_1_ID, status: 'contacted' }]);
  assert.equal(leadRepository.leads.find((lead) => lead.id === LEAD_1_ID).status, 'contacted');
  assert.equal(auditRepository.events.length, 1);
  assert.deepEqual(auditRepository.events[0], {
    id: 'audit-1',
    createdAt: 'now',
    adminUserId: 'admin-1',
    action: 'admin.lead.status.update',
    entityType: 'lead',
    entityId: LEAD_1_ID,
    summary: 'Changed lead Alice Lead status from new to contacted.'
  });
});

test('status update rolls back when audit logging fails inside a transaction', async () => {
  const leadRepository = createFakeLeadRepository(sampleLeads());
  const { app, auditRepository } = await createAdminLeadsTestApp({
    leadRepository,
    auditRepository: createThrowingAuditRepository('admin.lead.status.update')
  });
  const agent = request.agent(app);

  await login(agent);
  auditRepository.events.length = 0;
  const detailPage = await agent.get(`/admin/leads/${LEAD_1_ID}`).expect(200);
  const csrfToken = csrfTokenFrom(detailPage.text);

  await agent
    .post(`/admin/leads/${LEAD_1_ID}/status`)
    .type('form')
    .send({
      _csrf: csrfToken,
      status: 'contacted'
    })
    .expect(500);

  assert.equal(leadRepository.leads.find((lead) => lead.id === LEAD_1_ID).status, 'new');
  assert.deepEqual(auditRepository.events, []);
});

test('invalid status update returns a detail form error without updating or auditing', async () => {
  const { app, auditRepository, leadRepository } = await createAdminLeadsTestApp();
  const agent = request.agent(app);

  await login(agent);
  auditRepository.events.length = 0;
  const detailPage = await agent.get(`/admin/leads/${LEAD_1_ID}`).expect(200);
  const csrfToken = csrfTokenFrom(detailPage.text);

  const response = await agent
    .post(`/admin/leads/${LEAD_1_ID}/status`)
    .type('form')
    .send({
      _csrf: csrfToken,
      status: 'needs-coffee'
    })
    .expect(400)
    .expect('content-type', /html/);

  assert.match(response.text, /Choose a valid lead status\./);
  assert.deepEqual(leadRepository.updates, []);
  assert.equal(leadRepository.leads.find((lead) => lead.id === LEAD_1_ID).status, 'new');
  assert.deepEqual(auditRepository.events, []);
});

test('missing lead detail and status update return 404', async () => {
  const { app, auditRepository, leadRepository } = await createAdminLeadsTestApp();
  const agent = request.agent(app);

  await login(agent);

  await agent
    .get(`/admin/leads/${MISSING_LEAD_ID}`)
    .expect(404);

  auditRepository.events.length = 0;
  const detailPage = await agent.get(`/admin/leads/${LEAD_1_ID}`).expect(200);
  const csrfToken = csrfTokenFrom(detailPage.text);

  await agent
    .post(`/admin/leads/${MISSING_LEAD_ID}/status`)
    .type('form')
    .send({
      _csrf: csrfToken,
      status: 'contacted'
    })
    .expect(404);

  assert.deepEqual(leadRepository.updates, []);
  assert.deepEqual(auditRepository.events, []);
});

test('malformed lead detail id returns 404 before querying the repository', async () => {
  const { app, leadRepository } = await createAdminLeadsTestApp();
  const agent = request.agent(app);

  await login(agent);

  await agent
    .get('/admin/leads/not-a-uuid')
    .expect(404);

  assert.deepEqual(leadRepository.getCalls, []);
});

test('malformed lead status id returns 404 before querying or updating the repository', async () => {
  const { app, auditRepository, leadRepository } = await createAdminLeadsTestApp();
  const agent = request.agent(app);

  await login(agent);
  auditRepository.events.length = 0;
  const detailPage = await agent.get(`/admin/leads/${LEAD_1_ID}`).expect(200);
  const csrfToken = csrfTokenFrom(detailPage.text);
  leadRepository.getCalls.length = 0;

  await agent
    .post('/admin/leads/not-a-uuid/status')
    .type('form')
    .send({
      _csrf: csrfToken,
      status: 'contacted'
    })
    .expect(404);

  assert.deepEqual(leadRepository.getCalls, []);
  assert.deepEqual(leadRepository.updates, []);
  assert.deepEqual(auditRepository.events, []);
});

test('leadRepository runs callbacks inside a database transaction', async () => {
  const { createLeadRepository } = require('../../src/repositories/leadRepository');
  const calls = [];
  const client = {
    async query(sql, params = []) {
      calls.push({ sql, params });
      return { rows: [] };
    },
    release() {
      calls.push({ sql: 'release', params: [] });
    }
  };
  const db = {
    async connect() {
      calls.push({ sql: 'connect', params: [] });
      return client;
    }
  };
  const repository = createLeadRepository(db);

  const result = await repository.withTransaction(async (transactionRepository, transactionClient) => {
    assert.notEqual(transactionRepository, repository);
    assert.equal(transactionClient, client);
    await transactionClient.query('select 1');
    return 'ok';
  });

  assert.equal(result, 'ok');
  assert.deepEqual(calls.map((call) => call.sql), ['connect', 'begin', 'select 1', 'commit', 'release']);

  calls.length = 0;
  await assert.rejects(
    () => repository.withTransaction(async () => {
      throw new Error('audit failed');
    }),
    /audit failed/
  );
  assert.deepEqual(calls.map((call) => call.sql), ['connect', 'begin', 'rollback', 'release']);
});

test('leadRepository withTransaction supports query-only injected clients', async () => {
  const { createLeadRepository } = require('../../src/repositories/leadRepository');
  const calls = [];
  const db = {
    async query(sql, params = []) {
      calls.push({ sql, params });

      if (/update\s+leads/i.test(sql)) {
        return {
          rows: [{
            id: params[0],
            name: 'Alice Lead',
            phone: '212-555-0199',
            email: 'alice@example.com',
            zip: '11201',
            property_type: 'Residential - apartment / condo',
            camera_count: '3-4',
            notes: 'Needs rear door coverage.',
            status: params[1],
            source_path: '/contact/quote',
            ip_address: '203.0.113.10',
            user_agent: 'Lead detail test browser',
            created_at: '2026-06-01T10:15:00Z',
            updated_at: '2026-06-02T15:45:00Z'
          }]
        };
      }

      return { rows: [] };
    }
  };
  const repository = createLeadRepository(db);

  const result = await repository.withTransaction(async (transactionRepository, transactionClient) => {
    assert.notEqual(transactionRepository, repository);
    assert.equal(transactionClient, db);
    return transactionRepository.updateLeadStatus(LEAD_1_ID, 'contacted');
  });

  assert.equal(result.status, 'contacted');
  assert.deepEqual(calls.map((call) => call.sql), [
    `
        update leads
        set status = $2,
            updated_at = now()
        where id = $1
        returning *
      `
  ]);
  assert.deepEqual(calls[0].params, [LEAD_1_ID, 'contacted']);
});
