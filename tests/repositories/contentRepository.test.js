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
