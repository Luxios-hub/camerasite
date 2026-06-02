const assert = require('node:assert/strict');
const test = require('node:test');
const request = require('supertest');

const { createApp } = require('../../src/app');
const initialContent = require('../../src/db/seeds/initialContent');

const SESSION_OPTIONS = {
  useMemoryStore: true,
  secret: 'admin-page-editing-test-secret'
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

  function repositoryFor(store, options = {}) {
    function pageFor(slug) {
      const page = store.pages[slug];
      if (!page) {
        throw new Error(`Missing test page: ${slug}`);
      }
      return page;
    }

    function blockFor(slug, blockKey) {
      const block = (pageFor(slug).blocks || []).find((currentBlock) => currentBlock.blockKey === blockKey);
      if (!block) {
        throw new Error(`Missing test block: ${slug}/${blockKey}`);
      }
      return block;
    }

    function itemFor(slug, blockKey, itemId) {
      const item = (blockFor(slug, blockKey).items || []).find((currentItem) => {
        return currentItem.id === itemId || currentItem.itemKey === itemId;
      });
      if (!item) {
        throw new Error(`Missing test item: ${slug}/${blockKey}/${itemId}`);
      }
      return item;
    }

    return {
      content: store,
      async getSiteSettings() {
        return store.settings;
      },
      async upsertSiteSetting(key, value) {
        store.settings[key] = value;
        return { key, value, updatedAt: 'now' };
      },
      async listPages() {
        return Object.values(store.pages);
      },
      async countPages() {
        return Object.keys(store.pages).length;
      },
      async countMediaAssets() {
        return 3;
      },
      async getPageWithBlocks(slug) {
        return store.pages[slug] || null;
      },
      async updatePage(slug, input) {
        const page = pageFor(slug);
        Object.assign(page, input, { updatedAt: 'now' });
        return page;
      },
      async updateBlock(slug, blockKey, input) {
        const block = blockFor(slug, blockKey);
        Object.assign(block, input, { updatedAt: 'now' });
        return block;
      },
      async getBlockItem(slug, blockKey, itemId) {
        return itemFor(slug, blockKey, itemId);
      },
      async createBlockItem(slug, blockKey, input) {
        const block = blockFor(slug, blockKey);
        const itemKey = input.itemKey || `item-${block.items.length + 1}`;
        const item = {
          id: itemKey,
          blockId: block.id,
          itemKey,
          ...input
        };
        block.items.push(item);
        return item;
      },
      async updateBlockItem(slug, blockKey, itemId, input) {
        const item = itemFor(slug, blockKey, itemId);
        Object.assign(item, input, { updatedAt: 'now' });
        return item;
      },
      async disableBlockItem(slug, blockKey, itemId) {
        const item = itemFor(slug, blockKey, itemId);
        item.isEnabled = false;
        item.updatedAt = 'now';
        return item;
      },
      async withTransaction(callback) {
        if (options.isTransaction) {
          return callback(this);
        }

        const transactionContent = JSON.parse(JSON.stringify(store));
        assignIds(transactionContent);
        const transactionRepository = repositoryFor(transactionContent, { isTransaction: true });
        const result = await callback(transactionRepository);

        store.settings = transactionContent.settings;
        store.pages = transactionContent.pages;
        return result;
      }
    };
  }

  return repositoryFor(content);
}

function createPlainFakeContentRepository(content = cloneContent()) {
  assignIds(content);

  function pageFor(slug) {
    const page = content.pages[slug];
    if (!page) {
      throw new Error(`Missing test page: ${slug}`);
    }
    return page;
  }

  function blockFor(slug, blockKey) {
    const block = (pageFor(slug).blocks || []).find((currentBlock) => currentBlock.blockKey === blockKey);
    if (!block) {
      throw new Error(`Missing test block: ${slug}/${blockKey}`);
    }
    return block;
  }

  function itemFor(slug, blockKey, itemId) {
    const item = (blockFor(slug, blockKey).items || []).find((currentItem) => {
      return currentItem.id === itemId || currentItem.itemKey === itemId;
    });
    if (!item) {
      throw new Error(`Missing test item: ${slug}/${blockKey}/${itemId}`);
    }
    return item;
  }

  return {
    content,
    async getSiteSettings() {
      return content.settings;
    },
    async upsertSiteSetting(key, value) {
      content.settings[key] = value;
      return { key, value, updatedAt: 'now' };
    },
    async listPages() {
      return Object.values(content.pages);
    },
    async countPages() {
      return Object.keys(content.pages).length;
    },
    async countMediaAssets() {
      return 3;
    },
    async getPageWithBlocks(slug) {
      return content.pages[slug] || null;
    },
    async updatePage(slug, input) {
      const page = pageFor(slug);
      Object.assign(page, input, { updatedAt: 'now' });
      return page;
    },
    async updateBlock(slug, blockKey, input) {
      const block = blockFor(slug, blockKey);
      Object.assign(block, input, { updatedAt: 'now' });
      return block;
    },
    async getBlockItem(slug, blockKey, itemId) {
      return itemFor(slug, blockKey, itemId);
    },
    async createBlockItem(slug, blockKey, input) {
      const block = blockFor(slug, blockKey);
      const itemKey = input.itemKey || `item-${block.items.length + 1}`;
      const item = {
        id: itemKey,
        blockId: block.id,
        itemKey,
        ...input
      };
      block.items.push(item);
      return item;
    },
    async updateBlockItem(slug, blockKey, itemId, input) {
      const item = itemFor(slug, blockKey, itemId);
      Object.assign(item, input, { updatedAt: 'now' });
      return item;
    },
    async disableBlockItem(slug, blockKey, itemId) {
      const item = itemFor(slug, blockKey, itemId);
      item.isEnabled = false;
      item.updatedAt = 'now';
      return item;
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

function createFakeLeadRepository() {
  return {
    async countLeadsByStatus() {
      return [
        { status: 'new', count: 2 },
        { status: 'quoted', count: 1 }
      ];
    },
    async listLeads() {
      return [
        {
          id: 'lead-1',
          name: 'Alice Lead',
          email: 'alice@example.com',
          phone: '212-555-0199',
          status: 'new',
          createdAt: '2026-06-01T10:00:00Z'
        }
      ];
    }
  };
}

async function createAdminEditingTestApp(options = {}) {
  const { hashPassword } = require('../../src/services/passwords');
  const admin = {
    id: 'admin-1',
    email: 'admin@example.com',
    passwordHash: await hashPassword('correct horse battery staple'),
    displayName: 'Admin User',
    isActive: true
  };
  const contentRepository = options.contentRepository || createFakeContentRepository();
  const auditRepository = options.auditRepository || createFakeAuditRepository([{
    id: 'audit-seed',
    action: 'admin.seed',
    entityType: 'page',
    entityId: 'home',
    summary: 'Updated settings before login.',
    createdAt: '2026-06-01T09:00:00Z'
  }]);
  const app = createApp({
    adminRepository: createFakeAdminRepository(admin),
    auditRepository,
    contentRepository,
    leadRepository: createFakeLeadRepository(),
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

  return {
    app,
    auditRepository,
    contentRepository
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

test('admin editor routes require authentication', async () => {
  const { app } = await createAdminEditingTestApp();

  for (const path of [
    '/admin/settings',
    '/admin/pages',
    '/admin/pages/residential',
    '/admin/pages/residential/blocks/camera_types/items/smart-doorbells/edit',
    '/admin/pages/residential/blocks/camera_types/items/new'
  ]) {
    const response = await request(app)
      .get(path)
      .expect(302);

    assert.equal(response.headers.location, '/admin/login', `${path} should redirect to login`);
  }
});

test('dashboard displays available counts, recent leads, and audit events with fake repositories', async () => {
  const { app } = await createAdminEditingTestApp();
  const agent = request.agent(app);

  await login(agent);

  const response = await agent
    .get('/admin')
    .expect(200)
    .expect('content-type', /html/);

  assert.match(response.text, /Admin dashboard/);
  assert.match(response.text, /Pages/);
  assert.match(response.text, /6/);
  assert.match(response.text, /Media/);
  assert.match(response.text, /3/);
  assert.match(response.text, /new/i);
  assert.match(response.text, /2/);
  assert.match(response.text, /Alice Lead/);
  assert.match(response.text, /Updated settings before login\./);
});

test('saving settings changes public nav and footer content and writes an audit event', async () => {
  const { app, auditRepository } = await createAdminEditingTestApp();
  const agent = request.agent(app);

  await login(agent);
  const settingsPage = await agent.get('/admin/settings').expect(200);
  const csrfToken = csrfTokenFrom(settingsPage.text);

  await agent
    .post('/admin/settings')
    .type('form')
    .send({
      _csrf: csrfToken,
      businessName: 'NYC Camera Pros',
      phoneDisplay: '212-555-0101',
      phoneTel: '+12125550101',
      whatsappNumber: '12125550101',
      whatsappMessage: 'Need a camera quote',
      reviewRating: '5.0',
      reviewCount: '222',
      serviceAreaText: 'Manhattan and Queens',
      officeText: 'Long Island City, NY',
      credentialLabels: 'Licensed in NY\nInsured for commercial work'
    })
    .expect(302)
    .expect('location', '/admin/settings?saved=1');

  const publicHome = await agent
    .get('/')
    .expect(200)
    .expect('content-type', /html/);

  assert.match(publicHome.text, /NYC Camera Pros/);
  assert.match(publicHome.text, /212-555-0101/);
  assert.match(publicHome.text, /Licensed in NY/);
  assert.match(publicHome.text, /Insured for commercial work/);
  assert.equal(auditRepository.events.at(-1).action, 'admin.settings.update');
});

test('saving a page header changes the public page output', async () => {
  const { app, auditRepository } = await createAdminEditingTestApp();
  const agent = request.agent(app);

  await login(agent);
  const editorPage = await agent.get('/admin/pages/residential').expect(200);
  const csrfToken = csrfTokenFrom(editorPage.text);

  await agent
    .post('/admin/pages/residential')
    .type('form')
    .send({
      _csrf: csrfToken,
      title: 'Residential Camera Installation | Test',
      metaDescription: 'Updated residential meta.',
      ogTitle: 'Residential OG Test',
      ogDescription: 'Updated residential og.',
      canonicalPath: '/residential.html',
      headerEyebrow: 'Homes',
      headerTitle: 'Quiet cameras for city homes.',
      headerLede: 'Updated page lede.',
      isPublished: 'on'
    })
    .expect(302)
    .expect('location', '/admin/pages/residential?saved=1');

  const publicResidential = await agent
    .get('/residential')
    .expect(200)
    .expect('content-type', /html/);

  assert.match(publicResidential.text, /Quiet cameras for city homes\./);
  assert.doesNotMatch(publicResidential.text, /Home security (?:that&#39;s|that's) actually neighborly/);
  assert.equal(auditRepository.events.at(-1).action, 'admin.page.update');
});

test('disabling an item through the editor removes it from public output', async () => {
  const { app, auditRepository } = await createAdminEditingTestApp();
  const agent = request.agent(app);

  await login(agent);
  const editPage = await agent
    .get('/admin/pages/residential/blocks/camera_types/items/smart-doorbells/edit')
    .expect(200);
  const csrfToken = csrfTokenFrom(editPage.text);

  await agent
    .post('/admin/pages/residential/blocks/camera_types/items/smart-doorbells')
    .type('form')
    .send({
      _csrf: csrfToken,
      title: 'Smart doorbells',
      subtitle: '01 / Front door',
      body: 'Wired or battery.',
      price: '',
      badge: '',
      linkLabel: '',
      linkUrl: '',
      sortOrder: '10',
      metadata: '{}'
    })
    .expect(302)
    .expect('location', '/admin/pages/residential?saved=1');

  const publicResidential = await agent
    .get('/residential')
    .expect(200)
    .expect('content-type', /html/);

  assert.doesNotMatch(publicResidential.text, /Smart doorbells/);
  assert.equal(auditRepository.events.at(-1).action, 'admin.item.update');
});

test('invalid metadata JSON returns an admin form error and preserves public item output', async () => {
  const { app } = await createAdminEditingTestApp();
  const agent = request.agent(app);

  await login(agent);
  const editPage = await agent
    .get('/admin/pages/residential/blocks/camera_types/items/smart-doorbells/edit')
    .expect(200);
  const csrfToken = csrfTokenFrom(editPage.text);

  const response = await agent
    .post('/admin/pages/residential/blocks/camera_types/items/smart-doorbells')
    .type('form')
    .send({
      _csrf: csrfToken,
      title: 'Smart doorbells',
      subtitle: '01 / Front door',
      body: 'Wired or battery.',
      sortOrder: '10',
      isEnabled: 'on',
      metadata: '{not valid json'
    })
    .expect(400)
    .expect('content-type', /html/);

  assert.match(response.text, /Metadata must be valid JSON\./);

  const publicResidential = await agent
    .get('/residential')
    .expect(200)
    .expect('content-type', /html/);

  assert.match(publicResidential.text, /Smart doorbells/);
});

test('invalid metadata areas shape returns an admin error and leaves public home render intact', async () => {
  const { app } = await createAdminEditingTestApp();
  const agent = request.agent(app);

  await login(agent);
  const editPage = await agent
    .get('/admin/pages/home/blocks/service_area/items/nyc/edit')
    .expect(200);
  const csrfToken = csrfTokenFrom(editPage.text);

  const response = await agent
    .post('/admin/pages/home/blocks/service_area/items/nyc')
    .type('form')
    .send({
      _csrf: csrfToken,
      title: 'New York City',
      body: '',
      sortOrder: '10',
      isEnabled: 'on',
      metadata: JSON.stringify({ areas: { bad: true } })
    })
    .expect(400)
    .expect('content-type', /html/);

  assert.match(response.text, /Metadata field areas must be an array\./);

  const publicHome = await agent
    .get('/')
    .expect(200)
    .expect('content-type', /html/);

  assert.match(publicHome.text, /Brooklyn/);
});

test('invalid metadata includes shape returns an admin error and leaves public package render intact', async () => {
  const { app } = await createAdminEditingTestApp();
  const agent = request.agent(app);

  await login(agent);
  const editPage = await agent
    .get('/admin/pages/residential/blocks/sample_packages/items/starter/edit')
    .expect(200);
  const csrfToken = csrfTokenFrom(editPage.text);

  const response = await agent
    .post('/admin/pages/residential/blocks/sample_packages/items/starter')
    .type('form')
    .send({
      _csrf: csrfToken,
      title: 'Starter',
      body: 'Apartment, condo, or small home.',
      price: '$900-$1,400',
      sortOrder: '10',
      isEnabled: 'on',
      metadata: JSON.stringify({ includes: { bad: true }, priceSuffix: 'installed' })
    })
    .expect(400)
    .expect('content-type', /html/);

  assert.match(response.text, /Metadata field includes must be an array\./);

  const publicResidential = await agent
    .get('/residential')
    .expect(200)
    .expect('content-type', /html/);

  assert.match(publicResidential.text, /2-3 cameras/);
});

test('off-domain canonical URL returns a page form error and does not update public output', async () => {
  const { app } = await createAdminEditingTestApp();
  const agent = request.agent(app);

  await login(agent);
  const editorPage = await agent.get('/admin/pages/residential').expect(200);
  const csrfToken = csrfTokenFrom(editorPage.text);

  const response = await agent
    .post('/admin/pages/residential')
    .type('form')
    .send({
      _csrf: csrfToken,
      title: 'Off-domain title',
      metaDescription: 'Bad canonical test.',
      ogTitle: 'Off-domain OG',
      ogDescription: 'Bad canonical og.',
      canonicalPath: 'https://evil.example/residential.html',
      headerEyebrow: 'Homes',
      headerTitle: 'Off-domain public title',
      headerLede: 'This should not publish.',
      isPublished: 'on'
    })
    .expect(400)
    .expect('content-type', /html/);

  assert.match(response.text, /Canonical path must be a relative path or same-site URL\./);

  const publicResidential = await agent
    .get('/residential')
    .expect(200)
    .expect('content-type', /html/);

  assert.doesNotMatch(publicResidential.text, /Off-domain public title/);
  assert.match(publicResidential.text, /Home security (?:that&#39;s|that's) actually neighborly/);
});

test('malformed page media id returns a page form error before updating content', async () => {
  const { app, auditRepository } = await createAdminEditingTestApp();
  const agent = request.agent(app);

  await login(agent);
  const editorPage = await agent.get('/admin/pages/residential').expect(200);
  const csrfToken = csrfTokenFrom(editorPage.text);

  const response = await agent
    .post('/admin/pages/residential')
    .type('form')
    .send({
      _csrf: csrfToken,
      title: 'Bad media title',
      metaDescription: 'Bad media meta.',
      ogTitle: 'Bad media OG',
      ogDescription: 'Bad media og.',
      ogImageMediaId: 'not-a-uuid',
      canonicalPath: '/residential.html',
      headerEyebrow: 'Homes',
      headerTitle: 'Bad media public title',
      headerLede: 'This should not publish.',
      isPublished: 'on'
    })
    .expect(400)
    .expect('content-type', /html/);

  assert.match(response.text, /Select a valid media asset\./);
  assert.notEqual(auditRepository.events.at(-1).action, 'admin.page.update');

  const publicResidential = await agent
    .get('/residential')
    .expect(200)
    .expect('content-type', /html/);

  assert.doesNotMatch(publicResidential.text, /Bad media public title/);
  assert.match(publicResidential.text, /Home security (?:that&#39;s|that's) actually neighborly/);
});

test('malformed item media id returns an item form error before updating content', async () => {
  const { app, auditRepository } = await createAdminEditingTestApp();
  const agent = request.agent(app);

  await login(agent);
  const editPage = await agent
    .get('/admin/pages/residential/blocks/camera_types/items/smart-doorbells/edit')
    .expect(200);
  const csrfToken = csrfTokenFrom(editPage.text);

  const response = await agent
    .post('/admin/pages/residential/blocks/camera_types/items/smart-doorbells')
    .type('form')
    .send({
      _csrf: csrfToken,
      title: 'Tampered media item',
      subtitle: '01 / Front door',
      body: 'This should not publish.',
      imageMediaId: 'not-a-uuid',
      sortOrder: '10',
      isEnabled: 'on',
      metadata: '{}'
    })
    .expect(400)
    .expect('content-type', /html/);

  assert.match(response.text, /Select a valid media asset\./);
  assert.notEqual(auditRepository.events.at(-1).action, 'admin.item.update');

  const publicResidential = await agent
    .get('/residential')
    .expect(200)
    .expect('content-type', /html/);

  assert.doesNotMatch(publicResidential.text, /Tampered media item/);
  assert.match(publicResidential.text, /Smart doorbells/);
});

test('settings update rolls back when audit logging fails inside a transaction', async () => {
  const contentRepository = createFakeContentRepository();
  const { app } = await createAdminEditingTestApp({
    contentRepository,
    auditRepository: createThrowingAuditRepository('admin.settings.update')
  });
  const agent = request.agent(app);

  await login(agent);
  const settingsPage = await agent.get('/admin/settings').expect(200);
  const csrfToken = csrfTokenFrom(settingsPage.text);

  await agent
    .post('/admin/settings')
    .type('form')
    .send({
      _csrf: csrfToken,
      businessName: 'Rollback Camera Pros',
      phoneDisplay: '212-555-0101',
      phoneTel: '+12125550101',
      whatsappNumber: '12125550101',
      whatsappMessage: 'Need a camera quote',
      reviewRating: '5.0',
      reviewCount: '222',
      serviceAreaText: 'Manhattan and Queens',
      officeText: 'Long Island City, NY',
      credentialLabels: 'Licensed in NY'
    })
    .expect(500);

  const publicHome = await agent
    .get('/')
    .expect(200)
    .expect('content-type', /html/);

  assert.doesNotMatch(publicHome.text, /Rollback Camera Pros/);
  assert.match(publicHome.text, /CamerasNYC/);
});

test('page update rolls back when audit logging fails inside a transaction', async () => {
  const contentRepository = createFakeContentRepository();
  const { app } = await createAdminEditingTestApp({
    contentRepository,
    auditRepository: createThrowingAuditRepository('admin.page.update')
  });
  const agent = request.agent(app);

  await login(agent);
  const editorPage = await agent.get('/admin/pages/residential').expect(200);
  const csrfToken = csrfTokenFrom(editorPage.text);

  await agent
    .post('/admin/pages/residential')
    .type('form')
    .send({
      _csrf: csrfToken,
      title: 'Rollback Residential Test',
      metaDescription: 'Rollback meta.',
      ogTitle: 'Rollback OG',
      ogDescription: 'Rollback og.',
      canonicalPath: '/residential.html',
      headerEyebrow: 'Homes',
      headerTitle: 'Rollback public header',
      headerLede: 'This should roll back.',
      isPublished: 'on'
    })
    .expect(500);

  const publicResidential = await agent
    .get('/residential')
    .expect(200)
    .expect('content-type', /html/);

  assert.doesNotMatch(publicResidential.text, /Rollback public header/);
  assert.match(publicResidential.text, /Home security (?:that&#39;s|that's) actually neighborly/);
});
