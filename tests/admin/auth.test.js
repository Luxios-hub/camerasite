const assert = require('node:assert/strict');
const test = require('node:test');
const request = require('supertest');

const { createApp } = require('../../src/app');

const SESSION_OPTIONS = {
  useMemoryStore: true,
  secret: 'admin-auth-test-secret'
};

function csrfTokenFrom(html) {
  const match = html.match(/name="_csrf"\s+value="([^"]+)"/);
  assert.ok(match, 'expected response HTML to include a CSRF token');
  return match[1];
}

function createFakeAdminRepository(admins = []) {
  const byId = new Map();
  const byEmail = new Map();
  const markedLastLogin = [];

  for (const admin of admins) {
    byId.set(admin.id, admin);
    byEmail.set(admin.email.toLowerCase(), admin);
  }

  return {
    markedLastLogin,
    async findAdminByEmail(email) {
      return byEmail.get(String(email).trim().toLowerCase()) || null;
    },
    async findAdminById(id) {
      return byId.get(id) || null;
    },
    async markLastLogin(id) {
      markedLastLogin.push(id);
      const admin = byId.get(id);
      return admin ? { ...admin, lastLoginAt: 'now' } : null;
    }
  };
}

function createFakeAuditRepository() {
  const events = [];

  return {
    events,
    async logAuditEvent(event) {
      events.push(event);
      return { id: `audit-${events.length}`, ...event };
    }
  };
}

async function createAdminAuthTestApp({ isActive = true } = {}) {
  const { hashPassword } = require('../../src/services/passwords');
  const admin = {
    id: 'admin-1',
    email: 'admin@example.com',
    passwordHash: await hashPassword('correct horse battery staple'),
    displayName: 'Admin User',
    isActive
  };
  const adminRepository = createFakeAdminRepository([admin]);
  const auditRepository = createFakeAuditRepository();
  const app = createApp({
    adminRepository,
    auditRepository,
    loginRateLimiter: false,
    session: SESSION_OPTIONS
  });

  return {
    app,
    adminRepository,
    auditRepository
  };
}

async function loginCsrf(agent) {
  const loginPage = await agent.get('/admin/login').expect(200);
  return csrfTokenFrom(loginPage.text);
}

test('GET /admin redirects logged-out users to the admin login page', async () => {
  const { app } = await createAdminAuthTestApp();

  const response = await request(app)
    .get('/admin')
    .expect(302);

  assert.equal(response.headers.location, '/admin/login');
});

test('POST /admin/login rejects bad credentials with a generic error and no session', async () => {
  const { app, adminRepository, auditRepository } = await createAdminAuthTestApp();
  const agent = request.agent(app);
  const loginPage = await agent.get('/admin/login').expect(200);
  const csrfToken = csrfTokenFrom(loginPage.text);

  const response = await agent
    .post('/admin/login')
    .type('form')
    .send({
      _csrf: csrfToken,
      email: 'admin@example.com',
      password: 'wrong password'
    })
    .expect(401)
    .expect('content-type', /html/);

  assert.match(response.text, /Email or password is incorrect\./);
  assert.doesNotMatch(response.text, /wrong password/);
  assert.deepEqual(adminRepository.markedLastLogin, []);
  assert.deepEqual(auditRepository.events, []);

  const dashboard = await agent.get('/admin').expect(302);
  assert.equal(dashboard.headers.location, '/admin/login');
});

test('POST /admin/login accepts good credentials, marks login, audits, and opens /admin', async () => {
  const { app, adminRepository, auditRepository } = await createAdminAuthTestApp();
  const agent = request.agent(app);
  const loginPage = await agent.get('/admin/login').expect(200);
  const csrfToken = csrfTokenFrom(loginPage.text);

  const loginResponse = await agent
    .post('/admin/login')
    .type('form')
    .send({
      _csrf: csrfToken,
      email: ' ADMIN@example.com ',
      password: 'correct horse battery staple'
    })
    .expect(302);

  assert.equal(loginResponse.headers.location, '/admin');
  assert.deepEqual(adminRepository.markedLastLogin, ['admin-1']);
  assert.equal(auditRepository.events.length, 1);
  assert.deepEqual(auditRepository.events[0], {
    adminUserId: 'admin-1',
    action: 'admin.login',
    entityType: 'admin_user',
    entityId: 'admin-1',
    summary: 'Admin User signed in.'
  });

  const dashboard = await agent
    .get('/admin')
    .expect(200)
    .expect('content-type', /html/);

  assert.match(dashboard.text, /Admin dashboard/);
  assert.match(dashboard.text, /Admin User/);
});

test('POST /admin/login does not leave an authenticated session when audit logging fails', async () => {
  const { hashPassword } = require('../../src/services/passwords');
  const admin = {
    id: 'admin-1',
    email: 'admin@example.com',
    passwordHash: await hashPassword('correct horse battery staple'),
    displayName: 'Admin User',
    isActive: true
  };
  const adminRepository = createFakeAdminRepository([admin]);
  const auditRepository = {
    async logAuditEvent() {
      throw new Error('audit write failed');
    }
  };
  const app = createApp({
    adminRepository,
    auditRepository,
    loginRateLimiter: false,
    session: SESSION_OPTIONS
  });
  app.use((error, req, res, next) => {
    res.status(500).send('Internal Server Error');
  });
  const agent = request.agent(app);
  const csrfToken = await loginCsrf(agent);

  await agent
    .post('/admin/login')
    .type('form')
    .send({
      _csrf: csrfToken,
      email: 'admin@example.com',
      password: 'correct horse battery staple'
    })
    .expect(500);

  const dashboard = await agent.get('/admin').expect(302);
  assert.equal(dashboard.headers.location, '/admin/login');
});

test('POST /admin/login runs an injectable login rate limiter before auth work', async () => {
  const { hashPassword } = require('../../src/services/passwords');
  const admin = {
    id: 'admin-1',
    email: 'admin@example.com',
    passwordHash: await hashPassword('correct horse battery staple'),
    displayName: 'Admin User',
    isActive: true
  };
  const adminRepository = createFakeAdminRepository([admin]);
  const auditRepository = createFakeAuditRepository();
  let limiterCalls = 0;
  const app = createApp({
    adminRepository,
    auditRepository,
    loginRateLimiter(req, res) {
      limiterCalls += 1;
      res.status(429).send('Too many login attempts');
    },
    session: SESSION_OPTIONS
  });

  const response = await request(app)
    .post('/admin/login')
    .type('form')
    .send({
      email: 'admin@example.com',
      password: 'correct horse battery staple'
    })
    .expect(429);

  assert.equal(limiterCalls, 1);
  assert.match(response.text, /Too many login attempts/);
  assert.deepEqual(adminRepository.markedLastLogin, []);
  assert.deepEqual(auditRepository.events, []);
});

test('POST /admin/login applies the default rate limiter when not disabled', async () => {
  const app = createApp({
    adminRepository: createFakeAdminRepository(),
    auditRepository: createFakeAuditRepository(),
    loginRateLimit: { limit: 2, windowMs: 60 * 1000 },
    session: SESSION_OPTIONS
  });

  await request(app)
    .post('/admin/login')
    .type('form')
    .send({})
    .expect(403);
  await request(app)
    .post('/admin/login')
    .type('form')
    .send({})
    .expect(403);
  await request(app)
    .post('/admin/login')
    .type('form')
    .send({})
    .expect(429);
});

test('POST /admin/login still verifies a password for missing and inactive admins', async () => {
  const verifyCalls = [];
  const passwordService = {
    async verifyPassword(password, passwordHash) {
      verifyCalls.push({ password, passwordHash });
      return false;
    }
  };
  const missingApp = createApp({
    adminRepository: createFakeAdminRepository(),
    auditRepository: createFakeAuditRepository(),
    loginRateLimiter: false,
    passwordService,
    session: SESSION_OPTIONS
  });
  const missingAgent = request.agent(missingApp);
  const missingCsrf = await loginCsrf(missingAgent);

  await missingAgent
    .post('/admin/login')
    .type('form')
    .send({
      _csrf: missingCsrf,
      email: 'missing@example.com',
      password: 'same length work'
    })
    .expect(401);

  const inactiveApp = createApp({
    adminRepository: createFakeAdminRepository([{
      id: 'inactive-admin',
      email: 'inactive@example.com',
      passwordHash: 'inactive-hash',
      displayName: 'Inactive Admin',
      isActive: false
    }]),
    auditRepository: createFakeAuditRepository(),
    loginRateLimiter: false,
    passwordService,
    session: SESSION_OPTIONS
  });
  const inactiveAgent = request.agent(inactiveApp);
  const inactiveCsrf = await loginCsrf(inactiveAgent);

  await inactiveAgent
    .post('/admin/login')
    .type('form')
    .send({
      _csrf: inactiveCsrf,
      email: 'inactive@example.com',
      password: 'same length work'
    })
    .expect(401);

  assert.equal(verifyCalls.length, 2);
  assert.equal(verifyCalls[0].password, 'same length work');
  assert.equal(typeof verifyCalls[0].passwordHash, 'string');
  assert.notEqual(verifyCalls[0].passwordHash.length, 0);
  assert.equal(verifyCalls[1].password, 'same length work');
  assert.equal(verifyCalls[1].passwordHash, 'inactive-hash');
});

test('POST /admin/logout requires CSRF, logs out, audits, and clears admin access', async () => {
  const { app, auditRepository } = await createAdminAuthTestApp();
  const agent = request.agent(app);
  const loginPage = await agent.get('/admin/login').expect(200);
  const loginCsrfToken = csrfTokenFrom(loginPage.text);

  await agent
    .post('/admin/login')
    .type('form')
    .send({
      _csrf: loginCsrfToken,
      email: 'admin@example.com',
      password: 'correct horse battery staple'
    })
    .expect(302);

  await agent
    .post('/admin/logout')
    .type('form')
    .send({})
    .expect(403);

  await agent.get('/admin').expect(200);

  const dashboard = await agent.get('/admin').expect(200);
  const logoutCsrfToken = csrfTokenFrom(dashboard.text);

  const logoutResponse = await agent
    .post('/admin/logout')
    .type('form')
    .send({ _csrf: logoutCsrfToken })
    .expect(302);

  assert.equal(logoutResponse.headers.location, '/admin/login');
  assert.equal(auditRepository.events.length, 2);
  assert.deepEqual(auditRepository.events[1], {
    adminUserId: 'admin-1',
    action: 'admin.logout',
    entityType: 'admin_user',
    entityId: 'admin-1',
    summary: 'Admin User signed out.'
  });

  const dashboardAfterLogout = await agent.get('/admin').expect(302);
  assert.equal(dashboardAfterLogout.headers.location, '/admin/login');
});

test('inactive admin users cannot login even with the right password', async () => {
  const { app, adminRepository, auditRepository } = await createAdminAuthTestApp({ isActive: false });
  const agent = request.agent(app);
  const loginPage = await agent.get('/admin/login').expect(200);
  const csrfToken = csrfTokenFrom(loginPage.text);

  const response = await agent
    .post('/admin/login')
    .type('form')
    .send({
      _csrf: csrfToken,
      email: 'admin@example.com',
      password: 'correct horse battery staple'
    })
    .expect(401)
    .expect('content-type', /html/);

  assert.match(response.text, /Email or password is incorrect\./);
  assert.deepEqual(adminRepository.markedLastLogin, []);
  assert.deepEqual(auditRepository.events, []);
});

test('password helpers hash with bcrypt cost 12 and verify valid or invalid passwords', async () => {
  const { hashPassword, verifyPassword } = require('../../src/services/passwords');

  const passwordHash = await hashPassword('strong admin password');

  assert.match(passwordHash, /^\$2[aby]\$12\$/);
  assert.equal(await verifyPassword('strong admin password', passwordHash), true);
  assert.equal(await verifyPassword('wrong admin password', passwordHash), false);
  assert.equal(await verifyPassword('strong admin password', ''), false);
});

test('adminRepository supports admin lookup, upsert, and last-login update with an injected client', async () => {
  const { createAdminRepository } = require('../../src/repositories/adminRepository');
  const calls = [];
  const row = {
    id: 'admin-1',
    email: 'admin@example.com',
    password_hash: 'hash',
    display_name: 'Admin User',
    is_active: true,
    last_login_at: null,
    created_at: 'created-at',
    updated_at: 'updated-at'
  };
  const db = {
    async query(sql, params = []) {
      calls.push({ sql, params });

      if (/insert\s+into\s+admin_users/i.test(sql)) {
        return {
          rows: [{
            ...row,
            email: params[0],
            password_hash: params[1],
            display_name: params[2],
            updated_at: 'updated-now'
          }]
        };
      }

      if (/update\s+admin_users/i.test(sql)) {
        return { rows: [{ ...row, last_login_at: 'login-now', updated_at: 'updated-now' }] };
      }

      return { rows: [row] };
    }
  };
  const repository = createAdminRepository(db);

  const byEmail = await repository.findAdminByEmail(' ADMIN@EXAMPLE.COM ');
  const byId = await repository.findAdminById('admin-1');
  const upserted = await repository.upsertAdmin({
    email: ' ADMIN@EXAMPLE.COM ',
    passwordHash: 'new-hash',
    displayName: ' Admin User '
  });
  const marked = await repository.markLastLogin('admin-1');

  assert.match(calls[0].sql, /from\s+admin_users/i);
  assert.match(calls[0].sql, /lower\(email\)\s*=\s*\$1/i);
  assert.deepEqual(calls[0].params, ['admin@example.com']);
  assert.match(calls[1].sql, /where\s+id\s*=\s*\$1/i);
  assert.deepEqual(calls[1].params, ['admin-1']);
  assert.match(calls[2].sql, /insert\s+into\s+admin_users/i);
  assert.match(calls[2].sql, /on\s+conflict\s*\(\s*email\s*\)\s+do\s+update/i);
  assert.deepEqual(calls[2].params, ['admin@example.com', 'new-hash', 'Admin User']);
  assert.match(calls[3].sql, /last_login_at\s*=\s*now\(\)/i);
  assert.deepEqual(calls[3].params, ['admin-1']);
  assert.equal(byEmail.passwordHash, 'hash');
  assert.equal(byId.displayName, 'Admin User');
  assert.equal(upserted.email, 'admin@example.com');
  assert.equal(marked.lastLoginAt, 'login-now');
});

test('auditRepository logs admin events with an injected client', async () => {
  const { createAuditRepository } = require('../../src/repositories/auditRepository');
  const calls = [];
  const db = {
    async query(sql, params = []) {
      calls.push({ sql, params });
      return {
        rows: [{
          id: 'audit-1',
          admin_user_id: params[0],
          action: params[1],
          entity_type: params[2],
          entity_id: params[3],
          summary: params[4],
          created_at: 'created-at'
        }]
      };
    }
  };
  const repository = createAuditRepository(db);

  const event = await repository.logAuditEvent({
    adminUserId: 'admin-1',
    action: 'admin.login',
    entityType: 'admin_user',
    entityId: 'admin-1',
    summary: 'Admin User signed in.'
  });

  assert.match(calls[0].sql, /insert\s+into\s+admin_audit_log/i);
  assert.deepEqual(calls[0].params, [
    'admin-1',
    'admin.login',
    'admin_user',
    'admin-1',
    'Admin User signed in.'
  ]);
  assert.equal(event.adminUserId, 'admin-1');
  assert.equal(event.entityType, 'admin_user');
});

test('create-admin hashes the password and upserts an admin through injected dependencies', async () => {
  const { createAdmin, parseArgs } = require('../../scripts/create-admin');
  const upserts = [];
  const adminRepository = {
    async upsertAdmin(input) {
      upserts.push(input);
      return { id: 'admin-1', isActive: true, ...input };
    }
  };

  const parsedArgs = parseArgs([
    '--email',
    'admin@example.com',
    '--name',
    'Admin'
  ]);
  const admin = await createAdmin(
    {
      email: ' ADMIN@Example.COM ',
      password: 'strong password',
      name: ' Admin '
    },
    {
      adminRepository,
      hashPassword: async (password) => `hashed:${password}`
    }
  );

  assert.deepEqual(parsedArgs, {
    email: 'admin@example.com',
    name: 'Admin'
  });
  assert.deepEqual(upserts, [{
    email: 'admin@example.com',
    passwordHash: 'hashed:strong password',
    displayName: 'Admin'
  }]);
  assert.equal(admin.id, 'admin-1');
  assert.equal(admin.email, 'admin@example.com');
});

test('create-admin rejects command-line passwords and reads ADMIN_PASSWORD from the environment', async () => {
  const { createAdmin, parseArgs } = require('../../scripts/create-admin');
  const upserts = [];
  const adminRepository = {
    async upsertAdmin(input) {
      upserts.push(input);
      return { id: 'admin-1', isActive: true, ...input };
    }
  };

  assert.throws(
    () => parseArgs(['--email', 'admin@example.com', '--password', 'secret']),
    /Use ADMIN_PASSWORD or --password-stdin/i
  );

  const admin = await createAdmin(
    {
      email: 'admin@example.com',
      name: 'Admin'
    },
    {
      adminRepository,
      env: { ADMIN_PASSWORD: 'env password' },
      hashPassword: async (password) => `hashed:${password}`
    }
  );

  assert.deepEqual(upserts, [{
    email: 'admin@example.com',
    passwordHash: 'hashed:env password',
    displayName: 'Admin'
  }]);
  assert.equal(admin.id, 'admin-1');
});

test('create-admin rejects --password=value without leaking the secret in the error', () => {
  const { parseArgs } = require('../../scripts/create-admin');
  const secret = 'secret-from-argv';

  assert.throws(
    () => parseArgs(['--email', 'admin@example.com', `--password=${secret}`]),
    (error) => {
      assert.match(error.message, /Do not pass admin passwords on the command line/i);
      assert.doesNotMatch(error.message, new RegExp(secret));
      return true;
    }
  );
});

test('create-admin redacts unknown secret-bearing argv values in errors', () => {
  const { parseArgs } = require('../../scripts/create-admin');

  for (const arg of ['--password-stdin=topsecret', '--admin-password=topsecret']) {
    assert.throws(
      () => parseArgs(['--email', 'admin@example.com', arg]),
      (error) => {
        assert.match(error.message, /Unknown argument:/);
        assert.doesNotMatch(error.message, /topsecret/);
        assert.match(error.message, /\[redacted\]/);
        return true;
      },
      `${arg} should not leak its value`
    );
  }
});

test('create-admin redacts bare tokens after --password-stdin in errors', () => {
  const { parseArgs } = require('../../scripts/create-admin');

  assert.throws(
    () => parseArgs(['--email', 'admin@example.com', '--name', 'Admin', '--password-stdin', 'topsecret']),
    (error) => {
      assert.match(error.message, /Unknown argument:/);
      assert.doesNotMatch(error.message, /topsecret/);
      assert.match(error.message, /\[redacted\]/);
      return true;
    }
  );
});

test('create-admin exposes help for safe password sources', () => {
  const { parseArgs, formatHelp } = require('../../scripts/create-admin');

  assert.deepEqual(parseArgs(['--help']), { help: true });
  assert.match(formatHelp(), /ADMIN_PASSWORD/);
  assert.match(formatHelp(), /--password-stdin/);
  assert.doesNotMatch(formatHelp(), /--password\s/);
});

test('create-admin supports --password-stdin for automation without echoing passwords in argv', async () => {
  const { main } = require('../../scripts/create-admin');
  const upserts = [];
  const adminRepository = {
    async upsertAdmin(input) {
      upserts.push(input);
      return { id: 'admin-1', isActive: true, ...input };
    }
  };

  await main(
    ['--email', 'admin@example.com', '--name', 'Admin', '--password-stdin'],
    {
      adminRepository,
      hashPassword: async (password) => `hashed:${password}`,
      readStdin: async () => 'stdin password\n',
      silent: true
    }
  );

  assert.deepEqual(upserts, [{
    email: 'admin@example.com',
    passwordHash: 'hashed:stdin password',
    displayName: 'Admin'
  }]);
});
