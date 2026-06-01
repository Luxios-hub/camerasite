const assert = require('node:assert/strict');
const test = require('node:test');

const seedSiteContent = require('../../src/db/seed');

test('seed runner migrates first and upserts settings, pages, blocks, and items', async () => {
  const calls = [];
  const content = {
    settings: {
      business: { name: 'CamerasNYC' },
      contact: { office: 'Brooklyn, NY' }
    },
    pages: {
      home: {
        slug: 'home',
        blocks: [
          {
            blockKey: 'hero',
            items: [
              { itemKey: 'stat-500' },
              { itemKey: 'stat-rating' }
            ]
          }
        ]
      },
      contact: {
        slug: 'contact',
        blocks: [
          {
            blockKey: 'contact_info',
            items: [
              { itemKey: 'whatsapp' }
            ]
          },
          {
            blockKey: 'quote_form',
            items: []
          }
        ]
      }
    }
  };
  const repository = {
    async upsertSiteSetting(key, value) {
      calls.push(['setting', key, value]);
      return { key, value };
    },
    async upsertPage(page) {
      calls.push(['page', page.slug]);
      return { id: `page-${page.slug}`, ...page };
    },
    async upsertBlock(pageId, block) {
      calls.push(['block', pageId, block.blockKey]);
      return { id: `block-${block.blockKey}`, ...block };
    },
    async upsertItem(blockId, item) {
      calls.push(['item', blockId, item.itemKey]);
      return { id: `item-${item.itemKey}`, ...item };
    }
  };

  const summary = await seedSiteContent({
    content,
    repository,
    migrate: async () => {
      calls.push(['migrate']);
    },
    logger: { log() {} }
  });

  assert.deepEqual(calls[0], ['migrate']);
  assert.deepEqual(
    calls.map((call) => call[0]),
    ['migrate', 'setting', 'setting', 'page', 'block', 'item', 'item', 'page', 'block', 'item', 'block']
  );
  assert.deepEqual(summary, {
    settings: 2,
    pages: 2,
    blocks: 3,
    items: 3
  });
});
