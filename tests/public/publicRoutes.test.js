const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');
const express = require('express');
const request = require('supertest');

const { createTestApp } = require('../helpers/testApp');
const initialContent = require('../../src/db/seeds/initialContent');
const { createPublicRouter } = require('../../src/routes/publicRoutes');

function cloneContent() {
  return JSON.parse(JSON.stringify(initialContent));
}

function createPublicTestApp(routerOptions) {
  const app = express();

  app.set('views', path.join(__dirname, '..', '..', 'src', 'views'));
  app.set('view engine', 'ejs');
  app.use(createPublicRouter(routerOptions));

  return app;
}

function getBlock(content, slug, blockKey) {
  return content.pages[slug].blocks.find((block) => block.blockKey === blockKey);
}

test('buildPageViewModel groups enabled content and exposes helper functions', async () => {
  const { buildPageViewModel } = require('../../src/services/pageViewModel');

  const page = {
    slug: 'sample',
    template: 'standard',
    path: '/sample.html',
    title: 'Sample title',
    metaDescription: 'Sample meta',
    ogTitle: 'Sample OG',
    ogDescription: 'Sample OG description',
    canonicalPath: '/sample.html',
    headerEyebrow: 'Sample',
    headerTitle: 'Sample page',
    headerLede: 'Sample lede',
    schemaType: 'WebPage',
    schemaData: { '@context': 'https://schema.org', '@type': 'WebPage', name: 'Sample page' },
    isPublished: true,
    blocks: [
      {
        blockKey: 'hero',
        blockType: 'hero',
        title: 'Visible block',
        sortOrder: 20,
        isEnabled: true,
        items: [
          { itemKey: 'visible', title: 'Visible item', sortOrder: 20, isEnabled: true, metadata: {} },
          { itemKey: 'hidden', title: 'Hidden item', sortOrder: 10, isEnabled: false, metadata: {} }
        ]
      },
      {
        blockKey: 'hidden_block',
        blockType: 'rich_text',
        title: 'Hidden block',
        sortOrder: 10,
        isEnabled: false,
        items: []
      }
    ]
  };
  const repository = {
    async getSiteSettings() {
      return { business: { name: 'CamerasNYC Test' } };
    },
    async getPageWithBlocks(slug) {
      return slug === 'sample' ? page : null;
    }
  };

  const viewModel = await buildPageViewModel('sample', { repository });

  assert.equal(viewModel.settings.business.name, 'CamerasNYC Test');
  assert.equal(viewModel.page.slug, 'sample');
  assert.deepEqual(viewModel.enabledBlocks.map((block) => block.blockKey), ['hero']);
  assert.equal(viewModel.blocksByKey.hero.title, 'Visible block');
  assert.deepEqual(viewModel.items('hero').map((item) => item.title), ['Visible item']);
  assert.equal(viewModel.mediaUrl({ media: { publicPath: '/uploads/door.jpg' } }), '/uploads/door.jpg');
  assert.equal(viewModel.mediaUrl({ publicPath: '/uploads/page-og.jpg' }), '/uploads/page-og.jpg');
  assert.equal(viewModel.mediaUrl({ metadata: { imagePlaceholder: 'fallback-only' } }), null);
});

const pageCases = [
  ['/', /Cameras that actually watch/],
  ['/index.html', /Two operations\. One installer/],
  ['/residential.html', /Home security (?:that's|that&#39;s) actually neighborly/],
  ['/commercial.html', /Surveillance that scales with your business/],
  ['/services.html', /How we work/],
  ['/about.html', /Brooklyn-based\. New York-licensed/],
  ['/contact.html', /Free quote in 24 hours/]
];

for (const [path, expectedText] of pageCases) {
  test(`GET ${path} renders the public page from content`, async () => {
    const app = createTestApp();

    const response = await request(app)
      .get(path)
      .expect(200)
      .expect('content-type', /html/);

    assert.match(response.text, expectedText);
    assert.match(response.text, /<link rel="stylesheet" href="\/css\/styles\.css"/);
    assert.match(response.text, /<script src="\/js\/main\.js" defer><\/script>/);
  });
}

test('GET /residential renders the clean residential alias', async () => {
  const app = createTestApp();

  const response = await request(app)
    .get('/residential')
    .expect(200)
    .expect('content-type', /html/);

  assert.match(response.text, /Home security (?:that's|that&#39;s) actually neighborly/);
  assert.match(response.text, /<link rel="canonical" href="https:\/\/camerasnyc\.com\/residential\.html"/);
});

test('public pages render SEO tags, JSON-LD, and placeholder media fallbacks', async () => {
  const app = createTestApp();

  const response = await request(app)
    .get('/')
    .expect(200)
    .expect('content-type', /html/);

  assert.match(response.text, /<meta property="og:title" content="Security Camera Installation in NYC, Long Island &amp; NJ \| CamerasNYC"/);
  assert.match(response.text, /<script type="application\/ld\+json"(?: nonce="[^"]+")?>/);
  assert.match(response.text, /"@type": "LocalBusiness"/);
  assert.match(response.text, /class="hero__visual photo-ph photo-ph--dusk"/);
  assert.match(response.text, /data-img-placeholder="hero-front-porch-doorbell"/);
});

test('contact form attributes cannot inject raw attributes or scripts from CMS fields', async () => {
  const content = cloneContent();
  const quoteForm = getBlock(content, 'contact', 'quote_form');
  quoteForm.settings.fields[0] = {
    name: 'safeName',
    label: 'Malicious field',
    type: 'text',
    required: true,
    autocomplete: 'name" autofocus onfocus="alert(1)',
    pattern: '[a-z]+" onmouseover="alert(2)',
    maxlength: '5" onclick="alert(3)'
  };
  const app = createPublicTestApp({ content });

  const response = await request(app)
    .get('/contact.html')
    .expect(200)
    .expect('content-type', /html/);

  assert.match(response.text, /Malicious field/);
  assert.doesNotMatch(response.text, /autofocus/i);
  assert.doesNotMatch(response.text, /onfocus/i);
  assert.doesNotMatch(response.text, /onmouseover/i);
  assert.doesNotMatch(response.text, /onclick/i);
  assert.doesNotMatch(response.text, /alert\(/i);
});

test('public templates replace unsafe CMS URLs before rendering links and form actions', async () => {
  const content = cloneContent();
  content.settings.business.phoneHref = 'javascript:alert(1)';
  content.settings.navigation.links[0].href = 'javascript:alert(2)';
  content.settings.navigation.ctaHref = 'javascript:alert(3)';
  content.settings.footer.columns[0].links[0].href = 'javascript:alert(4)';

  const homeHero = getBlock(content, 'home', 'hero');
  homeHero.settings.primaryCta.href = 'javascript:alert(5)';
  homeHero.settings.secondaryCta.href = 'javascript:alert(6)';
  getBlock(content, 'home', 'systems').items[0].linkUrl = 'javascript:alert(7)';
  getBlock(content, 'home', 'recent_work').settings.cta.href = 'javascript:alert(8)';
  getBlock(content, 'home', 'quote_cta').settings.actions[0].href = 'javascript:alert(9)';

  getBlock(content, 'residential', 'sample_packages').items[0].linkUrl = 'javascript:alert(10)';
  getBlock(content, 'commercial', 'recent_jobs').settings.cta.href = 'javascript:alert(11)';
  getBlock(content, 'services', 'emergency').settings.primaryCta.href = 'javascript:alert(12)';
  getBlock(content, 'services', 'quote_cta').settings.actions[0].href = 'data:text/html,<script>alert(13)</script>';
  getBlock(content, 'contact', 'contact_info').items[0].linkUrl = 'javascript:alert(14)';
  getBlock(content, 'contact', 'quote_form').settings.action = 'javascript:alert(15)';

  const app = createPublicTestApp({ content });

  for (const route of ['/', '/residential.html', '/commercial.html', '/services.html', '/contact.html']) {
    const response = await request(app)
      .get(route)
      .expect(200)
      .expect('content-type', /html/);

    assert.doesNotMatch(response.text, /javascript:/i, `${route} rendered javascript URL`);
    assert.doesNotMatch(response.text, /data:text/i, `${route} rendered data URL`);
    assert.doesNotMatch(response.text, /alert\(/i, `${route} rendered executable payload`);
  }
});

test('buildPageViewModel does not use seed fallback for explicit repository misses or errors', async () => {
  const { buildPageViewModel } = require('../../src/services/pageViewModel');
  const missingRepository = {
    async getSiteSettings() {
      return initialContent.settings;
    },
    async getPageWithBlocks() {
      return null;
    }
  };
  const errorRepository = {
    async getSiteSettings() {
      return initialContent.settings;
    },
    async getPageWithBlocks() {
      throw new Error('database unavailable');
    }
  };

  assert.equal(await buildPageViewModel('residential', { repository: missingRepository }), null);
  await assert.rejects(
    () => buildPageViewModel('residential', { repository: errorRepository }),
    /database unavailable/
  );
});

test('explicit repository unpublished pages render not found instead of seed content', async () => {
  const unpublishedRepository = {
    async getSiteSettings() {
      return initialContent.settings;
    },
    async getPageWithBlocks(slug) {
      return {
        ...initialContent.pages[slug],
        isPublished: false
      };
    }
  };
  const app = createPublicTestApp({ repository: unpublishedRepository });

  const response = await request(app)
    .get('/residential')
    .expect(404);

  assert.doesNotMatch(response.text, /Home security (?:that's|that&#39;s) actually neighborly/);
});
