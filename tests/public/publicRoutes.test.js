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
  assert.equal(viewModel.mediaUrl({ metadata: { publicPath: '/assets/images/seeded.jpg' } }), '/assets/images/seeded.jpg');
  assert.equal(
    viewModel.mediaUrl({ media: { publicPath: '/uploads/door.jpg' }, metadata: { publicPath: '/assets/images/seeded.jpg' } }),
    '/uploads/door.jpg',
    'admin-assigned media wins over the seeded fallback path'
  );
  assert.equal(viewModel.mediaPosition({ settings: { imagePosition: '30% center' } }), '30% center');
  assert.equal(viewModel.mediaPosition({ metadata: { imagePosition: 'url(javascript:alert(1))' } }), null);
  assert.equal(viewModel.mediaPosition({}), null);
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

test('public pages render SEO tags and JSON-LD', async () => {
  const app = createTestApp();

  const response = await request(app)
    .get('/')
    .expect(200)
    .expect('content-type', /html/);

  assert.match(response.text, /<meta property="og:title" content="Security Camera Installation in NYC, Long Island &amp; NJ \| CamerasNYC"/);
  assert.match(response.text, /<script type="application\/ld\+json"(?: nonce="[^"]+")?>/);
  assert.match(response.text, /"@type": "LocalBusiness"/);
});

test('seeded photos render inside the photo-ph wrapper on every image slot', async () => {
  const app = createTestApp();

  const home = await request(app).get('/').expect(200);

  // hero: eager-loaded, wrapper keeps its layout class, no placeholder attribute
  assert.match(home.text, /<div class="hero__visual photo-ph photo-ph--dusk">\s*<img src="\/assets\/images\/hero-front-porch-dusk\.jpg" alt="Warm front entrance of a brick home glowing at dusk" fetchpriority="high" \/>/);
  assert.doesNotMatch(home.text, /data-img-placeholder="hero-front-porch-doorbell"/);
  // track card: photo sits under the audience badge
  assert.match(home.text, /<div class="track-card__media photo-ph photo-ph--porch">\s*<img src="\/assets\/images\/residential-camera\.jpg"[^>]*loading="lazy" \/>\s*<span class="photo-ph__tag">For homeowners<\/span>/);
  assert.match(home.text, /<img src="\/assets\/images\/commercial-camera\.jpg"/);
  // why-local: optional crop offset comes through as object-position
  assert.match(home.text, /<img src="\/assets\/images\/installer-mounting-camera\.jpg"[^>]*style="object-position: 30% center;" \/>\s*<span class="photo-ph__tag">Local crew<\/span>/);
  // recent installs
  assert.match(home.text, /<div class="install-card__media photo-ph photo-ph--brick">\s*<img src="\/assets\/images\/install-bay-ridge-brick\.jpg"/);
  assert.doesNotMatch(home.text, /data-img-placeholder=/);

  const commercial = await request(app).get('/commercial.html').expect(200);
  assert.match(commercial.text, /<div class="case-card__media photo-ph photo-ph--storefront">\s*<img src="\/assets\/images\/case-retail-dome-camera\.jpg"[^>]*\/>\s*<span class="photo-ph__tag">Retail<\/span>/);

  const about = await request(app).get('/about.html').expect(200);
  assert.match(about.text, /<img src="\/assets\/images\/founder-at-work\.jpg"[^>]*\/>\s*<span class="photo-ph__tag">Founder<\/span>/);
});

test('image slots without media fall back to the placeholder treatment', async () => {
  const content = cloneContent();
  const hero = getBlock(content, 'home', 'hero');
  delete hero.settings.publicPath;
  hero.settings.imageCaption = ['Placeholder - front door at dusk', 'Swap in real photo'];
  const app = createPublicTestApp({ content });

  const response = await request(app)
    .get('/')
    .expect(200)
    .expect('content-type', /html/);

  assert.match(response.text, /class="hero__visual photo-ph photo-ph--dusk" data-img-placeholder="hero-front-porch-doorbell"/);
  assert.match(response.text, /<span class="photo-ph__caption">/);
  assert.doesNotMatch(response.text, /hero-front-porch-dusk\.jpg/);
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
