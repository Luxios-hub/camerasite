const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const test = require('node:test');
const request = require('supertest');

const { createApp } = require('../../src/app');
const initialContent = require('../../src/db/seeds/initialContent');
const { createMediaRepository } = require('../../src/repositories/mediaRepository');
const { createMediaStorage, MAX_IMAGE_BYTES } = require('../../src/services/mediaStorage');

const SESSION_OPTIONS = {
  useMemoryStore: true,
  secret: 'admin-media-test-secret'
};

function csrfTokenFrom(html) {
  const match = html.match(/name="_csrf"\s+value="([^"]+)"/);
  assert.ok(match, 'expected response HTML to include a CSRF token');
  return match[1];
}

function pngBuffer(width = 2, height = 1) {
  const buffer = Buffer.alloc(33);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(buffer, 0);
  buffer.writeUInt32BE(13, 8);
  buffer.write('IHDR', 12, 'ascii');
  buffer.writeUInt32BE(width, 16);
  buffer.writeUInt32BE(height, 20);
  buffer[24] = 8;
  buffer[25] = 2;
  buffer[26] = 0;
  buffer[27] = 0;
  buffer[28] = 0;
  return buffer;
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
  const events = [];

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

function createFakeMediaRepository(seedAssets = [], options = {}) {
  const assets = seedAssets.map((asset) => ({ ...asset }));
  const usedIds = new Set();
  const failDeleteIds = options.failDeleteIds || new Set();
  const conditionalDeleteMissIds = options.conditionalDeleteMissIds || new Set();

  return {
    assets,
    usedIds,
    async createMediaAsset(input) {
      const asset = {
        id: input.id || `media-${assets.length + 1}`,
        createdAt: 'now',
        updatedAt: 'now',
        ...input
      };
      assets.push(asset);
      return asset;
    },
    async listMediaAssets({ limit = 100 } = {}) {
      return assets.slice(-limit).reverse();
    },
    async getMediaAsset(id) {
      return assets.find((asset) => asset.id === id) || null;
    },
    async deleteMediaAsset(id) {
      if (failDeleteIds.has(id)) {
        throw new Error(`metadata delete failed for ${id}`);
      }

      const index = assets.findIndex((asset) => asset.id === id);
      if (index === -1) {
        return null;
      }
      return assets.splice(index, 1)[0];
    },
    async deleteUnusedMediaAsset(id) {
      if (conditionalDeleteMissIds.has(id) || usedIds.has(id)) {
        return null;
      }

      return this.deleteMediaAsset(id);
    },
    async isMediaAssetUsed(id) {
      return usedIds.has(id);
    },
    async countMediaAssets() {
      return assets.length;
    },
    async withTransaction(callback) {
      const transactionRepository = createFakeMediaRepository(assets.map((asset) => ({ ...asset })), options);
      for (const id of usedIds) {
        transactionRepository.usedIds.add(id);
      }
      if (typeof options.beforeTransactionCallback === 'function') {
        await options.beforeTransactionCallback(transactionRepository);
      }
      const result = await callback(transactionRepository);

      assets.splice(0, assets.length, ...transactionRepository.assets.map((asset) => ({ ...asset })));
      usedIds.clear();
      for (const id of transactionRepository.usedIds) {
        usedIds.add(id);
      }
      return result;
    }
  };
}

function createFakeContentRepository(content = cloneContent(), mediaRepository = createFakeMediaRepository()) {
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

  function mediaById(id) {
    return mediaRepository.assets.find((asset) => asset.id === id) || null;
  }

  function hydratePage(page) {
    const hydrated = JSON.parse(JSON.stringify(page));
    const ogImage = mediaById(hydrated.ogImageMediaId);

    if (ogImage) {
      hydrated.ogImage = ogImage;
      hydrated.ogImageMedia = ogImage;
    }

    for (const block of hydrated.blocks || []) {
      for (const item of block.items || []) {
        const itemMedia = mediaById(item.imageMediaId);
        if (itemMedia) {
          item.media = itemMedia;
          item.image = itemMedia;
          item.imageMedia = itemMedia;
        }
      }
    }

    return hydrated;
  }

  return {
    content,
    async getSiteSettings() {
      return content.settings;
    },
    async listPages() {
      return Object.values(content.pages);
    },
    async countPages() {
      return Object.keys(content.pages).length;
    },
    async getPageWithBlocks(slug) {
      const page = content.pages[slug];
      return page ? hydratePage(page) : null;
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
      return callback(this);
    }
  };
}

async function createAdminMediaTestApp(options = {}) {
  const { hashPassword } = require('../../src/services/passwords');
  const admin = {
    id: 'admin-1',
    email: 'admin@example.com',
    passwordHash: await hashPassword('correct horse battery staple'),
    displayName: 'Admin User',
    isActive: true
  };
  const mediaRepository = options.mediaRepository || createFakeMediaRepository();
  const contentRepository = options.contentRepository || createFakeContentRepository(cloneContent(), mediaRepository);
  const auditRepository = options.auditRepository || createFakeAuditRepository();
  const app = createApp({
    adminRepository: createFakeAdminRepository(admin),
    auditRepository,
    contentRepository,
    mediaRepository,
    mediaStorage: options.mediaStorage,
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
    contentRepository,
    mediaRepository
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

async function createTempStorage() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'camerasnyc-media-'));
  const storage = createMediaStorage({
    root,
    now: () => new Date('2026-06-02T14:05:00Z'),
    randomBytes: (size) => Buffer.alloc(size, 0xab)
  });

  return { root, storage };
}

test('valid image upload creates a media record and randomized stored file', async () => {
  const { root, storage } = await createTempStorage();
  const mediaRepository = createFakeMediaRepository();
  const { app } = await createAdminMediaTestApp({ mediaRepository, mediaStorage: storage });
  const agent = request.agent(app);

  try {
    await login(agent);
    const mediaPage = await agent.get('/admin/media').expect(200);
    const csrfToken = csrfTokenFrom(mediaPage.text);

    await agent
      .post('/admin/media')
      .field('_csrf', csrfToken)
      .field('altText', 'Technician installing a camera')
      .field('caption', 'Front door install')
      .attach('image', pngBuffer(), { filename: 'front-door.png', contentType: 'image/png' })
      .expect(302)
      .expect('location', '/admin/media?uploaded=1');

    assert.equal(mediaRepository.assets.length, 1);
    const asset = mediaRepository.assets[0];
    assert.equal(asset.originalName, 'front-door.png');
    assert.equal(asset.mimeType, 'image/png');
    assert.equal(asset.sizeBytes, pngBuffer().length);
    assert.equal(asset.width, 2);
    assert.equal(asset.height, 1);
    assert.equal(asset.altText, 'Technician installing a camera');
    assert.equal(asset.caption, 'Front door install');
    assert.match(asset.storedName, /^2026\/06\/[a-f0-9-]+\.png$/);
    assert.equal(asset.publicPath, `/uploads/media/${asset.storedName}`);

    const stored = await fs.stat(path.join(root, 'media', asset.storedName));
    assert.equal(stored.isFile(), true);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('upload audit failure rolls back media metadata and removes the stored file', async () => {
  const { root, storage } = await createTempStorage();
  const mediaRepository = createFakeMediaRepository();
  const { app } = await createAdminMediaTestApp({
    mediaRepository,
    mediaStorage: storage,
    auditRepository: createThrowingAuditRepository('admin.media.create')
  });
  const agent = request.agent(app);
  const storedPath = path.join(root, 'media', '2026', '06', `${'ab'.repeat(16)}.png`);

  try {
    await login(agent);
    const mediaPage = await agent.get('/admin/media').expect(200);
    const csrfToken = csrfTokenFrom(mediaPage.text);

    await agent
      .post('/admin/media')
      .field('_csrf', csrfToken)
      .field('altText', 'Camera over a glass entry')
      .attach('image', pngBuffer(), { filename: 'entry.png', contentType: 'image/png' })
      .expect(500);

    assert.equal(mediaRepository.assets.length, 0);
    await assert.rejects(() => fs.stat(storedPath), /ENOENT/);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('upload rejects invalid extensions, MIME mismatches, and missing alt text', async () => {
  const { root, storage } = await createTempStorage();
  const mediaRepository = createFakeMediaRepository();
  const { app } = await createAdminMediaTestApp({ mediaRepository, mediaStorage: storage });
  const agent = request.agent(app);

  try {
    await login(agent);

    for (const scenario of [
      {
        filename: 'camera.svg',
        contentType: 'image/svg+xml',
        body: '<svg></svg>',
        altText: 'SVG should fail',
        expected: /Only JPG, PNG, and WebP images are allowed\./
      },
      {
        filename: 'camera.jpg',
        contentType: 'image/png',
        body: pngBuffer(),
        altText: 'Mismatch should fail',
        expected: /File extension does not match MIME type\./
      },
      {
        filename: 'camera.png',
        contentType: 'image/png',
        body: pngBuffer(),
        altText: '',
        expected: /Alt text is required\./
      }
    ]) {
      const mediaPage = await agent.get('/admin/media').expect(200);
      const csrfToken = csrfTokenFrom(mediaPage.text);

      const response = await agent
        .post('/admin/media')
        .field('_csrf', csrfToken)
        .field('altText', scenario.altText)
        .attach('image', Buffer.from(scenario.body), {
          filename: scenario.filename,
          contentType: scenario.contentType
        })
        .expect(400)
        .expect('content-type', /html/);

      assert.match(response.text, scenario.expected);
    }

    assert.equal(mediaRepository.assets.length, 0);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('media storage rejects empty and oversized image files before writing', async () => {
  const { root, storage } = await createTempStorage();

  try {
    await assert.rejects(
      () => storage.storeMediaFile({
        originalname: 'empty.png',
        mimetype: 'image/png',
        size: 0,
        buffer: Buffer.alloc(0)
      }, { altText: 'Empty image' }),
      /Uploaded image is empty\./
    );

    await assert.rejects(
      () => storage.storeMediaFile({
        originalname: 'large.png',
        mimetype: 'image/png',
        size: MAX_IMAGE_BYTES + 1,
        buffer: Buffer.concat([pngBuffer(), Buffer.alloc(MAX_IMAGE_BYTES + 1)])
      }, { altText: 'Large image' }),
      /Uploaded image must be 8MB or smaller\./
    );

    const mediaDir = path.join(root, 'media');
    await assert.rejects(() => fs.stat(mediaDir), /ENOENT/);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('selecting item media in admin renders the assigned image in public HTML', async () => {
  const mediaRepository = createFakeMediaRepository([{
    id: 'media-1',
    originalName: 'door.png',
    storedName: '2026/06/door.png',
    mimeType: 'image/png',
    sizeBytes: 33,
    width: 2,
    height: 1,
    altText: 'Installed camera above a storefront door',
    caption: 'Storefront door camera',
    publicPath: '/uploads/media/2026/06/door.png'
  }]);
  const contentRepository = createFakeContentRepository(cloneContent(), mediaRepository);
  const { app } = await createAdminMediaTestApp({ contentRepository, mediaRepository });
  const agent = request.agent(app);

  await login(agent);
  const editorPage = await agent
    .get('/admin/pages/home/blocks/recent_work/items/bay-ridge-hardware/edit')
    .expect(200);
  const csrfToken = csrfTokenFrom(editorPage.text);

  assert.match(editorPage.text, /Installed camera above a storefront door/);

  await agent
    .post('/admin/pages/home/blocks/recent_work/items/bay-ridge-hardware')
    .type('form')
    .send({
      _csrf: csrfToken,
      title: 'Hardware store - 12-camera multi-angle',
      subtitle: 'Bay Ridge, Brooklyn',
      body: '',
      price: '',
      badge: '',
      linkLabel: '',
      linkUrl: '',
      imageMediaId: 'media-1',
      sortOrder: '10',
      isEnabled: 'on',
      metadata: JSON.stringify({
        imagePlaceholder: 'install-bay-ridge',
        imageSlot: 'home.recent_work.bay_ridge',
        placeholderClass: 'photo-ph--brick'
      })
    })
    .expect(302)
    .expect('location', '/admin/pages/home?saved=1');

  const publicHome = await agent
    .get('/')
    .expect(200)
    .expect('content-type', /html/);

  assert.match(publicHome.text, /src="\/uploads\/media\/2026\/06\/door\.png"/);
  assert.match(publicHome.text, /alt="Installed camera above a storefront door"/);
  assert.doesNotMatch(publicHome.text, /data-img-placeholder="install-bay-ridge"/);
});

test('unassigned public media slots still render fallback placeholders', async () => {
  const mediaRepository = createFakeMediaRepository();
  const contentRepository = createFakeContentRepository(cloneContent(), mediaRepository);
  const { app } = await createAdminMediaTestApp({ contentRepository, mediaRepository });

  const response = await request(app)
    .get('/')
    .expect(200)
    .expect('content-type', /html/);

  assert.match(response.text, /data-img-placeholder="install-bay-ridge"/);
  assert.match(response.text, /photo-ph--brick/);
});

test('delete rejects used media and deletes unused media metadata and file', async () => {
  const deleted = [];
  const mediaRepository = createFakeMediaRepository([
    {
      id: 'used-media',
      originalName: 'used.png',
      storedName: '2026/06/used.png',
      mimeType: 'image/png',
      sizeBytes: 33,
      altText: 'Used media',
      caption: '',
      publicPath: '/uploads/media/2026/06/used.png'
    },
    {
      id: 'unused-media',
      originalName: 'unused.png',
      storedName: '2026/06/unused.png',
      mimeType: 'image/png',
      sizeBytes: 33,
      altText: 'Unused media',
      caption: '',
      publicPath: '/uploads/media/2026/06/unused.png'
    }
  ]);
  mediaRepository.usedIds.add('used-media');
  const mediaStorage = {
    async deleteMediaFile(asset) {
      deleted.push(asset.id);
    }
  };
  const { app } = await createAdminMediaTestApp({ mediaRepository, mediaStorage });
  const agent = request.agent(app);

  await login(agent);
  const mediaPage = await agent.get('/admin/media').expect(200);
  const csrfToken = csrfTokenFrom(mediaPage.text);

  const usedResponse = await agent
    .post('/admin/media/used-media/delete')
    .type('form')
    .send({ _csrf: csrfToken })
    .expect(409)
    .expect('content-type', /html/);

  assert.match(usedResponse.text, /Media asset is currently assigned and cannot be deleted\./);
  assert.ok(mediaRepository.assets.some((asset) => asset.id === 'used-media'));
  assert.deepEqual(deleted, []);

  await agent
    .post('/admin/media/unused-media/delete')
    .type('form')
    .send({ _csrf: csrfToken })
    .expect(302)
    .expect('location', '/admin/media?deleted=1');

  assert.ok(!mediaRepository.assets.some((asset) => asset.id === 'unused-media'));
  assert.deepEqual(deleted, ['unused-media']);
});

test('delete removes metadata before reporting a retryable file deletion failure', async () => {
  const mediaRepository = createFakeMediaRepository([{
    id: 'delete-file-fails',
    originalName: 'delete-file-fails.png',
    storedName: '2026/06/delete-file-fails.png',
    mimeType: 'image/png',
    sizeBytes: 33,
    altText: 'Delete file failure media',
    caption: '',
    publicPath: '/uploads/media/2026/06/delete-file-fails.png'
  }]);
  const mediaStorage = {
    async deleteMediaFile() {
      throw new Error('file delete failed');
    }
  };
  const { app } = await createAdminMediaTestApp({ mediaRepository, mediaStorage });
  const agent = request.agent(app);

  await login(agent);
  const mediaPage = await agent.get('/admin/media').expect(200);
  const csrfToken = csrfTokenFrom(mediaPage.text);

  await agent
    .post('/admin/media/delete-file-fails/delete')
    .type('form')
    .send({ _csrf: csrfToken })
    .expect(500)
    .expect('content-type', /html/);

  assert.ok(!mediaRepository.assets.some((asset) => asset.id === 'delete-file-fails'));
});

test('delete audit failure keeps metadata and does not delete the file', async () => {
  const deleted = [];
  const mediaRepository = createFakeMediaRepository([{
    id: 'delete-audit-fails',
    originalName: 'delete-audit-fails.png',
    storedName: '2026/06/delete-audit-fails.png',
    mimeType: 'image/png',
    sizeBytes: 33,
    altText: 'Delete audit failure media',
    caption: '',
    publicPath: '/uploads/media/2026/06/delete-audit-fails.png'
  }]);
  const mediaStorage = {
    async deleteMediaFile(asset) {
      deleted.push(asset.id);
    }
  };
  const { app } = await createAdminMediaTestApp({
    mediaRepository,
    mediaStorage,
    auditRepository: createThrowingAuditRepository('admin.media.delete')
  });
  const agent = request.agent(app);

  await login(agent);
  const mediaPage = await agent.get('/admin/media').expect(200);
  const csrfToken = csrfTokenFrom(mediaPage.text);

  await agent
    .post('/admin/media/delete-audit-fails/delete')
    .type('form')
    .send({ _csrf: csrfToken })
    .expect(500);

  assert.ok(mediaRepository.assets.some((asset) => asset.id === 'delete-audit-fails'));
  assert.deepEqual(deleted, []);
});

test('delete rechecks usage inside transaction and aborts if media becomes used', async () => {
  const deleted = [];
  const mediaRepository = createFakeMediaRepository([{
    id: 'race-media',
    originalName: 'race.png',
    storedName: '2026/06/race.png',
    mimeType: 'image/png',
    sizeBytes: 33,
    altText: 'Race media',
    caption: '',
    publicPath: '/uploads/media/2026/06/race.png'
  }], {
    beforeTransactionCallback(transactionRepository) {
      transactionRepository.usedIds.add('race-media');
    }
  });
  const mediaStorage = {
    async deleteMediaFile(asset) {
      deleted.push(asset.id);
    }
  };
  const { app } = await createAdminMediaTestApp({ mediaRepository, mediaStorage });
  const agent = request.agent(app);

  await login(agent);
  const mediaPage = await agent.get('/admin/media').expect(200);
  const csrfToken = csrfTokenFrom(mediaPage.text);

  const response = await agent
    .post('/admin/media/race-media/delete')
    .type('form')
    .send({ _csrf: csrfToken })
    .expect(409)
    .expect('content-type', /html/);

  assert.match(response.text, /Media asset is currently assigned and cannot be deleted\./);
  assert.ok(mediaRepository.assets.some((asset) => asset.id === 'race-media'));
  assert.deepEqual(deleted, []);
});

test('delete relies on conditional metadata delete and does not remove file when it deletes no rows', async () => {
  const deleted = [];
  const mediaRepository = createFakeMediaRepository([{
    id: 'conditional-race-media',
    originalName: 'conditional-race.png',
    storedName: '2026/06/conditional-race.png',
    mimeType: 'image/png',
    sizeBytes: 33,
    altText: 'Conditional race media',
    caption: '',
    publicPath: '/uploads/media/2026/06/conditional-race.png'
  }], {
    conditionalDeleteMissIds: new Set(['conditional-race-media'])
  });
  const mediaStorage = {
    async deleteMediaFile(asset) {
      deleted.push(asset.id);
    }
  };
  const { app } = await createAdminMediaTestApp({ mediaRepository, mediaStorage });
  const agent = request.agent(app);

  await login(agent);
  const mediaPage = await agent.get('/admin/media').expect(200);
  const csrfToken = csrfTokenFrom(mediaPage.text);

  const response = await agent
    .post('/admin/media/conditional-race-media/delete')
    .type('form')
    .send({ _csrf: csrfToken })
    .expect(409)
    .expect('content-type', /html/);

  assert.match(response.text, /Media asset is currently assigned and cannot be deleted\./);
  assert.ok(mediaRepository.assets.some((asset) => asset.id === 'conditional-race-media'));
  assert.deepEqual(deleted, []);
});

test('delete metadata failure does not remove the file first', async () => {
  const deleted = [];
  const mediaRepository = createFakeMediaRepository([{
    id: 'db-delete-fails',
    originalName: 'db-delete-fails.png',
    storedName: '2026/06/db-delete-fails.png',
    mimeType: 'image/png',
    sizeBytes: 33,
    altText: 'DB delete failure media',
    caption: '',
    publicPath: '/uploads/media/2026/06/db-delete-fails.png'
  }], {
    failDeleteIds: new Set(['db-delete-fails'])
  });
  const mediaStorage = {
    async deleteMediaFile(asset) {
      deleted.push(asset.id);
    }
  };
  const { app } = await createAdminMediaTestApp({ mediaRepository, mediaStorage });
  const agent = request.agent(app);

  await login(agent);
  const mediaPage = await agent.get('/admin/media').expect(200);
  const csrfToken = csrfTokenFrom(mediaPage.text);

  await agent
    .post('/admin/media/db-delete-fails/delete')
    .type('form')
    .send({ _csrf: csrfToken })
    .expect(500);

  assert.ok(mediaRepository.assets.some((asset) => asset.id === 'db-delete-fails'));
  assert.deepEqual(deleted, []);
});

test('media repository supports CRUD, listing, counting, and usage checks with an injected client', async () => {
  const calls = [];
  const assetRow = {
    id: 'media-1',
    original_name: 'door.png',
    stored_name: '2026/06/random.png',
    mime_type: 'image/png',
    size_bytes: 33,
    width: 2,
    height: 1,
    alt_text: 'Door camera',
    caption: 'Front door',
    public_path: '/uploads/media/2026/06/random.png',
    created_at: 'created-at',
    updated_at: 'updated-at'
  };
  const db = {
    async query(sql, params = []) {
      calls.push({ sql, params });

      if (/insert\s+into\s+media_assets/i.test(sql)) {
        return {
          rows: [{
            ...assetRow,
            original_name: params[0],
            stored_name: params[1],
            mime_type: params[2],
            size_bytes: params[3],
            width: params[4],
            height: params[5],
            alt_text: params[6],
            caption: params[7],
            public_path: params[8]
          }]
        };
      }
      if (/count\(\*\)::int\s+as\s+count/i.test(sql)) {
        return { rows: [{ count: 1 }] };
      }
      if (/select\s+exists/i.test(sql)) {
        return { rows: [{ is_used: true }] };
      }
      if (/delete\s+from\s+media_assets/i.test(sql)) {
        return { rows: [assetRow] };
      }
      if (/where\s+id\s*=\s*\$1/i.test(sql)) {
        return { rows: [assetRow] };
      }
      if (/order\s+by\s+created_at\s+desc/i.test(sql)) {
        return { rows: [assetRow] };
      }

      throw new Error(`Unexpected SQL: ${sql}`);
    }
  };
  const repository = createMediaRepository(db);

  const created = await repository.createMediaAsset({
    originalName: 'door.png',
    storedName: '2026/06/random.png',
    mimeType: 'image/png',
    sizeBytes: 33,
    width: 2,
    height: 1,
    altText: 'Door camera',
    caption: 'Front door',
    publicPath: '/uploads/media/2026/06/random.png'
  });
  const listed = await repository.listMediaAssets({ limit: 2 });
  const fetched = await repository.getMediaAsset('media-1');
  const isUsed = await repository.isMediaAssetUsed('media-1');
  const count = await repository.countMediaAssets();
  const deleted = await repository.deleteMediaAsset('media-1');

  assert.equal(created.originalName, 'door.png');
  assert.equal(created.publicPath, '/uploads/media/2026/06/random.png');
  assert.deepEqual(listed.map((asset) => asset.id), ['media-1']);
  assert.equal(fetched.altText, 'Door camera');
  assert.equal(isUsed, true);
  assert.equal(count, 1);
  assert.equal(deleted.id, 'media-1');
  assert.match(calls[0].sql, /insert\s+into\s+media_assets/i);
  assert.deepEqual(calls[0].params, [
    'door.png',
    '2026/06/random.png',
    'image/png',
    33,
    2,
    1,
    'Door camera',
    'Front door',
    '/uploads/media/2026/06/random.png'
  ]);
  assert.match(calls[1].sql, /order\s+by\s+created_at\s+desc/i);
  assert.deepEqual(calls[1].params, [2]);
  assert.match(calls[3].sql, /from\s+pages/i);
  assert.match(calls[3].sql, /from\s+content_items/i);
});

test('media repository conditionally deletes unused assets with SQL-level FK checks', async () => {
  const calls = [];
  const assetRow = {
    id: 'media-1',
    original_name: 'door.png',
    stored_name: '2026/06/random.png',
    mime_type: 'image/png',
    size_bytes: 33,
    width: 2,
    height: 1,
    alt_text: 'Door camera',
    caption: 'Front door',
    public_path: '/uploads/media/2026/06/random.png',
    created_at: 'created-at',
    updated_at: 'updated-at'
  };
  const db = {
    async query(sql, params = []) {
      calls.push({ sql, params });
      return { rows: [assetRow] };
    }
  };
  const repository = createMediaRepository(db);

  const deleted = await repository.deleteUnusedMediaAsset('media-1');

  assert.equal(deleted.id, 'media-1');
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].params, ['media-1']);
  assert.match(calls[0].sql, /delete\s+from\s+media_assets\s+m/i);
  assert.match(calls[0].sql, /not\s+exists\s*\(\s*select\s+1\s+from\s+pages/i);
  assert.match(calls[0].sql, /og_image_media_id\s*=\s*m\.id/i);
  assert.match(calls[0].sql, /not\s+exists\s*\(\s*select\s+1\s+from\s+content_items/i);
  assert.match(calls[0].sql, /image_media_id\s*=\s*m\.id/i);
  assert.match(calls[0].sql, /returning\s+m\.\*/i);
});

test('media repository runs callbacks inside a database transaction', async () => {
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
  const repository = createMediaRepository(db);

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
