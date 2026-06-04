const assert = require('node:assert/strict');
const test = require('node:test');
const request = require('supertest');

const { createApp } = require('../../src/app');
const initialContent = require('../../src/db/seeds/initialContent');
const { hashPassword } = require('../../src/services/passwords');

const SESSION_OPTIONS = {
  useMemoryStore: true,
  secret: 'admin-visual-editor-test-secret'
};

function csrfTokenFrom(html) {
  const match = html.match(/name="_csrf"\s+value="([^"]+)"/);
  assert.ok(match, 'expected response HTML to include a CSRF token');
  return match[1];
}

function cloneContent() {
  return JSON.parse(JSON.stringify(initialContent));
}

function assignIds(content) {
  for (const page of Object.values(content.pages)) {
    page.id = `page-${page.slug}`;

    for (const block of page.blocks || []) {
      block.id = `block-${page.slug}-${block.blockKey}`;
      block.pageId = page.id;

      for (const item of block.items || []) {
        item.id = item.itemKey;
        item.blockId = block.id;
      }
    }
  }
}

function createFakeContentRepository(content = cloneContent()) {
  assignIds(content);

  return {
    async getSiteSettings() {
      return content.settings;
    },
    async listPages() {
      return Object.values(content.pages);
    },
    async countPages() {
      return Object.keys(content.pages).length;
    },
    async countMediaAssets() {
      return 0;
    },
    async getPageWithBlocks(slug) {
      return content.pages[slug] || null;
    }
  };
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

function createFakeAuditRepository() {
  return {
    async logAuditEvent() {
      return { id: 'audit-1' };
    },
    async listAuditEvents() {
      return [];
    }
  };
}

async function createVisualEditorTestApp(options = {}) {
  const admin = {
    id: 'admin-1',
    email: 'admin@example.com',
    passwordHash: await hashPassword('correct horse battery staple'),
    displayName: 'Admin User',
    isActive: true
  };
  const contentRepository = options.contentRepository || createFakeContentRepository(options.content);
  const app = createApp({
    adminRepository: createFakeAdminRepository(admin),
    auditRepository: createFakeAuditRepository(),
    contentRepository,
    loginRateLimiter: false,
    session: SESSION_OPTIONS,
    public: {
      repository: contentRepository
    }
  });

  app.use((error, req, res, next) => {
    if (res.headersSent) {
      next(error);
      return;
    }

    res.status(500).send(error.message);
  });

  return { app };
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

test('visual editor routes require authentication', async () => {
  const { app } = await createVisualEditorTestApp();

  for (const path of ['/admin/visual', '/admin/visual/home']) {
    const response = await request(app)
      .get(path)
      .expect(302);

    assert.equal(response.headers.location, '/admin/login');
  }
});

test('GET /admin/visual redirects to the home visual editor', async () => {
  const { app } = await createVisualEditorTestApp();
  const agent = request.agent(app);

  await login(agent);

  const response = await agent
    .get('/admin/visual')
    .expect(302);

  assert.equal(response.headers.location, '/admin/visual/home');
});

test('visual editor renders the real public page with labeled edit controls', async () => {
  const { app } = await createVisualEditorTestApp();
  const agent = request.agent(app);

  await login(agent);

  const response = await agent
    .get('/admin/visual/home')
    .expect(200)
    .expect('content-type', /html/);

  assert.match(response.text, /Cameras that actually watch\. Installed right the first time\./);
  assert.match(response.text, /<link rel="stylesheet" href="\/css\/styles\.css"/);
  assert.match(response.text, /<link rel="stylesheet" href="\/admin\/css\/visual-editor\.css"/);
  assert.match(response.text, /<script src="\/admin\/js\/visual-editor\.js" defer><\/script>/);
  assert.match(response.text, /class="admin-visual-toolbar"/);
  assert.match(response.text, /Visual editor/);
  assert.match(response.text, /Viewing home/);
  assert.match(response.text, /href="\/admin\/visual\/residential"/);
  assert.match(response.text, /data-admin-visual-region="hero"/);
  assert.match(response.text, /href="\/admin\/pages\/home#block-hero"/);
  assert.match(response.text, /Edit Hero section/);
  assert.match(response.text, /href="\/admin\/pages\/home\/blocks\/systems\/items\/residential\/edit"/);
  assert.match(response.text, /Edit Residential card/);
  assert.match(response.text, /Edit image/);
});

test('public pages do not render visual editor controls or admin assets', async () => {
  const { app } = await createVisualEditorTestApp();
  const agent = request.agent(app);

  await login(agent);

  const response = await agent
    .get('/')
    .expect(200)
    .expect('content-type', /html/);

  assert.match(response.text, /Cameras that actually watch\. Installed right the first time\./);
  assert.doesNotMatch(response.text, /admin-visual-toolbar/);
  assert.doesNotMatch(response.text, /admin-visual-edit/);
  assert.doesNotMatch(response.text, /admin-visual-item-frame/);
  assert.doesNotMatch(response.text, /data-admin-visual-/);
  assert.doesNotMatch(response.text, /\/admin\/css\/visual-editor\.css/);
  assert.doesNotMatch(response.text, /\/admin\/js\/visual-editor\.js/);
  assert.doesNotMatch(response.text, /\/admin\/pages\/home#block-hero/);
});

test('admin screens expose visual editor entry points', async () => {
  const { app } = await createVisualEditorTestApp();
  const agent = request.agent(app);

  await login(agent);

  const dashboard = await agent
    .get('/admin')
    .expect(200)
    .expect('content-type', /html/);
  assert.match(dashboard.text, /href="\/admin\/visual\/home"/);
  assert.match(dashboard.text, /Visual editor/);

  const pages = await agent
    .get('/admin/pages')
    .expect(200)
    .expect('content-type', /html/);
  assert.match(pages.text, /href="\/admin\/visual\/home"/);
  assert.match(pages.text, /Preview\/edit/);

  const pageEditor = await agent
    .get('/admin/pages/home')
    .expect(200)
    .expect('content-type', /html/);
  assert.match(pageEditor.text, /href="\/admin\/visual\/home"/);
  assert.match(pageEditor.text, /id="block-hero"/);
});

test('admin screens do not link draft pages to visual editor routes that render public pages', async () => {
  const content = cloneContent();
  content.pages.about.isPublished = false;
  const { app } = await createVisualEditorTestApp({ content });
  const agent = request.agent(app);

  await login(agent);

  const pages = await agent
    .get('/admin/pages')
    .expect(200)
    .expect('content-type', /html/);

  assert.match(pages.text, /Draft/);
  assert.match(pages.text, /Publish to preview/);
  assert.doesNotMatch(pages.text, /href="\/admin\/visual\/about"/);

  const pageEditor = await agent
    .get('/admin/pages/about')
    .expect(200)
    .expect('content-type', /html/);

  assert.match(pageEditor.text, /Publish this page to use visual edit/);
  assert.doesNotMatch(pageEditor.text, /href="\/admin\/visual\/about"/);
});
