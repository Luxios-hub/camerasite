const assert = require('node:assert/strict');
const test = require('node:test');

const { createContentRepository } = require('../../src/repositories/contentRepository');

function createFakeDb(handler) {
  const calls = [];

  return {
    calls,
    async query(sql, params = []) {
      calls.push({ sql, params });
      return handler(sql, params);
    }
  };
}

test('content repository upserts settings, pages, blocks, and items conflict-safely', async () => {
  const fakeDb = createFakeDb((sql, params) => {
    if (/insert\s+into\s+site_settings/i.test(sql)) {
      return { rows: [{ key: params[0], value: params[1] }] };
    }
    if (/insert\s+into\s+pages/i.test(sql)) {
      return { rows: [{ id: 'page-1', slug: params[0], title: params[3] }] };
    }
    if (/insert\s+into\s+content_blocks/i.test(sql)) {
      return { rows: [{ id: 'block-1', page_id: params[0], block_key: params[1] }] };
    }
    if (/insert\s+into\s+content_items/i.test(sql)) {
      return { rows: [{ id: 'item-1', block_id: params[0], item_key: params[1] }] };
    }
    throw new Error(`Unexpected SQL: ${sql}`);
  });
  const repository = createContentRepository(fakeDb);

  await repository.upsertSiteSetting('business', { name: 'CamerasNYC' });
  await repository.upsertPage({
    slug: 'home',
    template: 'home',
    path: '/',
    title: 'Home title',
    metaDescription: 'Home meta',
    ogTitle: 'Home og',
    ogDescription: 'Home og desc',
    canonicalPath: '/',
    headerEyebrow: 'Home',
    headerTitle: 'Hero',
    headerLede: 'Lede',
    schemaType: 'LocalBusiness',
    schemaData: { name: 'CamerasNYC' },
    isPublished: true
  });
  await repository.upsertBlock('page-1', {
    blockKey: 'hero',
    blockType: 'hero',
    eyebrow: 'Security cameras',
    title: 'Hero',
    lede: 'Lede',
    body: null,
    settings: { imagePlaceholder: 'hero-front-porch-doorbell' },
    sortOrder: 10,
    isEnabled: true
  });
  await repository.upsertItem('block-1', {
    itemKey: 'stat-500',
    title: '500+ homes secured',
    subtitle: null,
    body: 'Installed across the tri-state',
    linkLabel: null,
    linkUrl: null,
    price: null,
    badge: null,
    metadata: { kind: 'stat' },
    sortOrder: 10,
    isFeatured: false,
    isEnabled: true
  });

  const settingCall = fakeDb.calls.find((call) => /insert\s+into\s+site_settings/i.test(call.sql));
  const pageCall = fakeDb.calls.find((call) => /insert\s+into\s+pages/i.test(call.sql));
  const blockCall = fakeDb.calls.find((call) => /insert\s+into\s+content_blocks/i.test(call.sql));
  const itemCall = fakeDb.calls.find((call) => /insert\s+into\s+content_items/i.test(call.sql));

  assert.match(settingCall.sql, /on\s+conflict\s*\(\s*key\s*\)\s+do\s+update/i);
  assert.match(pageCall.sql, /on\s+conflict\s*\(\s*slug\s*\)\s+do\s+update/i);
  assert.match(blockCall.sql, /on\s+conflict\s*\(\s*page_id\s*,\s*block_key\s*\)\s+do\s+update/i);
  assert.match(itemCall.sql, /on\s+conflict\s*\(\s*block_id\s*,\s*item_key\s*\)\s+where\s+item_key\s+is\s+not\s+null\s+do\s+update/i);
  assert.deepEqual(settingCall.params, ['business', { name: 'CamerasNYC' }]);
  assert.equal(pageCall.params[0], 'home');
  assert.equal(blockCall.params[1], 'hero');
  assert.equal(itemCall.params[1], 'stat-500');
});

test('getPageWithBlocks returns a page with ordered blocks and items', async () => {
  const fakeDb = createFakeDb((sql) => {
    if (/from\s+pages/i.test(sql)) {
      return {
        rows: [{
          id: 'page-1',
          slug: 'home',
          template: 'home',
          path: '/',
          title: 'Home title',
          meta_description: 'Home meta',
          og_title: 'Home og',
          og_description: 'Home og desc',
          canonical_path: '/',
          header_eyebrow: 'Home',
          header_title: 'Hero',
          header_lede: 'Lede',
          schema_type: 'LocalBusiness',
          schema_data: { name: 'CamerasNYC' },
          is_published: true
        }]
      };
    }
    if (/from\s+content_blocks/i.test(sql)) {
      return {
        rows: [
          {
            id: 'block-1',
            page_id: 'page-1',
            block_key: 'hero',
            block_type: 'hero',
            eyebrow: 'Security cameras',
            title: 'Hero',
            lede: 'Lede',
            body: null,
            settings: { imagePlaceholder: 'hero-front-porch-doorbell' },
            sort_order: 10,
            is_enabled: true
          },
          {
            id: 'block-2',
            page_id: 'page-1',
            block_key: 'included',
            block_type: 'feature_grid',
            eyebrow: "What's included",
            title: 'What you get',
            lede: null,
            body: null,
            settings: {},
            sort_order: 20,
            is_enabled: true
          }
        ]
      };
    }
    if (/from\s+content_items/i.test(sql)) {
      return {
        rows: [
          {
            id: 'item-2',
            block_id: 'block-2',
            item_key: 'clean-install',
            title: 'Clean installation',
            subtitle: '02 / Install',
            body: 'Cable runs concealed.',
            image_media_id: null,
            link_label: null,
            link_url: null,
            price: null,
            badge: null,
            metadata: {},
            sort_order: 20,
            is_featured: false,
            is_enabled: true
          },
          {
            id: 'item-1',
            block_id: 'block-1',
            item_key: 'stat-500',
            title: '500+ homes secured',
            subtitle: null,
            body: null,
            image_media_id: null,
            link_label: null,
            link_url: null,
            price: null,
            badge: null,
            metadata: { kind: 'stat' },
            sort_order: 10,
            is_featured: false,
            is_enabled: true
          }
        ]
      };
    }
    throw new Error(`Unexpected SQL: ${sql}`);
  });
  const repository = createContentRepository(fakeDb);

  const page = await repository.getPageWithBlocks('home');

  assert.equal(page.slug, 'home');
  assert.equal(page.metaDescription, 'Home meta');
  assert.equal(page.blocks.length, 2);
  assert.equal(page.blocks[0].blockKey, 'hero');
  assert.equal(page.blocks[0].settings.imagePlaceholder, 'hero-front-porch-doorbell');
  assert.deepEqual(page.blocks[0].items.map((item) => item.itemKey), ['stat-500']);
  assert.equal(page.blocks[1].blockKey, 'included');
  assert.deepEqual(page.blocks[1].items.map((item) => item.title), ['Clean installation']);
});

test('getSiteSettings returns settings keyed by setting name', async () => {
  const fakeDb = createFakeDb((sql) => {
    assert.match(sql, /from\s+site_settings/i);
    return {
      rows: [
        { key: 'business', value: { name: 'CamerasNYC' } },
        { key: 'contact', value: { office: 'Brooklyn, NY' } }
      ]
    };
  });
  const repository = createContentRepository(fakeDb);

  const settings = await repository.getSiteSettings();

  assert.deepEqual(settings, {
    business: { name: 'CamerasNYC' },
    contact: { office: 'Brooklyn, NY' }
  });
});

test('content repository lists pages and counts pages and media assets', async () => {
  const fakeDb = createFakeDb((sql) => {
    if (/count\(\*\)::int\s+as\s+count\s+from\s+pages/i.test(sql)) {
      return { rows: [{ count: 6 }] };
    }
    if (/count\(\*\)::int\s+as\s+count\s+from\s+media_assets/i.test(sql)) {
      return { rows: [{ count: 3 }] };
    }
    if (/from\s+pages/i.test(sql)) {
      return {
        rows: [
          {
            id: 'page-home',
            slug: 'home',
            template: 'home',
            path: '/',
            title: 'Home',
            meta_description: 'Meta',
            og_title: 'OG',
            og_description: 'OG desc',
            canonical_path: '/',
            header_eyebrow: 'Home',
            header_title: 'Hero',
            header_lede: 'Lede',
            is_published: true
          }
        ]
      };
    }
    throw new Error(`Unexpected SQL: ${sql}`);
  });
  const repository = createContentRepository(fakeDb);

  const pages = await repository.listPages();
  const pageCount = await repository.countPages();
  const mediaCount = await repository.countMediaAssets();

  assert.equal(pages.length, 1);
  assert.equal(pages[0].slug, 'home');
  assert.equal(pageCount, 6);
  assert.equal(mediaCount, 3);
  assert.match(fakeDb.calls[0].sql, /order\s+by\s+slug/i);
});

test('content repository updates page and block editor fields', async () => {
  const fakeDb = createFakeDb((sql, params) => {
    if (/update\s+pages/i.test(sql)) {
      return {
        rows: [{
          id: 'page-residential',
          slug: params[0],
          title: params[1],
          meta_description: params[2],
          og_title: params[3],
          og_description: params[4],
          canonical_path: params[5],
          header_eyebrow: params[6],
          header_title: params[7],
          header_lede: params[8],
          is_published: params[9]
        }]
      };
    }
    if (/update\s+content_blocks/i.test(sql)) {
      return {
        rows: [{
          id: 'block-page-header',
          page_id: 'page-residential',
          block_key: params[1],
          eyebrow: params[2],
          title: params[3],
          lede: params[4],
          body: params[5],
          is_enabled: params[6]
        }]
      };
    }
    throw new Error(`Unexpected SQL: ${sql}`);
  });
  const repository = createContentRepository(fakeDb);

  const page = await repository.updatePage('residential', {
    title: 'Residential Test',
    metaDescription: 'Meta test',
    ogTitle: 'OG test',
    ogDescription: 'OG desc test',
    canonicalPath: '/residential.html',
    headerEyebrow: 'Homes',
    headerTitle: 'Quiet cameras',
    headerLede: 'Lede test',
    isPublished: false
  });
  const block = await repository.updateBlock('residential', 'page_header', {
    eyebrow: 'Homes',
    title: 'Quiet cameras',
    lede: 'Lede test',
    body: null,
    isEnabled: true
  });

  assert.equal(page.isPublished, false);
  assert.equal(page.headerTitle, 'Quiet cameras');
  assert.equal(block.blockKey, 'page_header');
  assert.equal(block.title, 'Quiet cameras');
  assert.match(fakeDb.calls[0].sql, /where\s+slug\s*=\s*\$1/i);
  assert.match(fakeDb.calls[1].sql, /where\s+page_id\s*=\s*\(/i);
  assert.deepEqual(fakeDb.calls[0].params.slice(0, 3), ['residential', 'Residential Test', 'Meta test']);
});

test('content repository creates, updates, reads, and soft-disables block items', async () => {
  const fakeDb = createFakeDb((sql, params) => {
    if (/insert\s+into\s+content_items/i.test(sql)) {
      return {
        rows: [{
          id: 'item-new',
          block_id: 'block-camera-types',
          item_key: params[2],
          title: params[3],
          subtitle: params[4],
          body: params[5],
          link_label: params[6],
          link_url: params[7],
          price: params[8],
          badge: params[9],
          metadata: params[10],
          sort_order: params[11],
          is_featured: params[12],
          is_enabled: params[13]
        }]
      };
    }
    if (/select\s+content_items\.\*/i.test(sql)) {
      return {
        rows: [{
          id: params[2],
          block_id: 'block-camera-types',
          item_key: 'smart-doorbells',
          title: 'Smart doorbells',
          metadata: {},
          sort_order: 10,
          is_featured: false,
          is_enabled: true
        }]
      };
    }
    if (/set\s+is_enabled\s*=\s*false/i.test(sql)) {
      return {
        rows: [{
          id: params[2],
          block_id: 'block-camera-types',
          item_key: 'smart-doorbells',
          title: 'Smart doorbells',
          metadata: {},
          sort_order: 10,
          is_featured: false,
          is_enabled: false
        }]
      };
    }
    if (/update\s+content_items/i.test(sql)) {
      return {
        rows: [{
          id: params[2],
          block_id: 'block-camera-types',
          item_key: 'smart-doorbells',
          title: params[3],
          subtitle: params[4],
          body: params[5],
          link_label: params[6],
          link_url: params[7],
          price: params[8],
          badge: params[9],
          metadata: params[10],
          sort_order: params[11],
          is_featured: params[12],
          is_enabled: params[13]
        }]
      };
    }
    throw new Error(`Unexpected SQL: ${sql}`);
  });
  const repository = createContentRepository(fakeDb);

  const created = await repository.createBlockItem('residential', 'camera_types', {
    itemKey: 'new-camera',
    title: 'New camera',
    subtitle: '01',
    body: 'Body',
    linkLabel: 'Learn',
    linkUrl: 'contact.html',
    price: '$1',
    badge: 'New',
    metadata: { kind: 'test' },
    sortOrder: 15,
    isFeatured: true,
    isEnabled: true
  });
  const existing = await repository.getBlockItem('residential', 'camera_types', 'smart-doorbells');
  const updated = await repository.updateBlockItem('residential', 'camera_types', 'smart-doorbells', {
    title: 'Updated camera',
    subtitle: '02',
    body: 'Updated body',
    linkLabel: 'Quote',
    linkUrl: 'contact.html',
    price: '$2',
    badge: 'Featured',
    metadata: { updated: true },
    sortOrder: 20,
    isFeatured: false,
    isEnabled: false
  });
  const disabled = await repository.disableBlockItem('residential', 'camera_types', 'smart-doorbells');

  assert.equal(created.itemKey, 'new-camera');
  assert.equal(existing.title, 'Smart doorbells');
  assert.equal(updated.title, 'Updated camera');
  assert.equal(updated.isEnabled, false);
  assert.equal(disabled.isEnabled, false);
  assert.match(fakeDb.calls[0].sql, /join\s+pages/i);
  assert.match(fakeDb.calls[2].sql, /content_items\.id::text\s*=\s*\$3\s+or\s+content_items\.item_key\s*=\s*\$3/i);
  assert.match(fakeDb.calls[3].sql, /set\s+is_enabled\s*=\s*false/i);
});

test('content repository runs callbacks inside a database transaction', async () => {
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
  const repository = createContentRepository(db);

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
