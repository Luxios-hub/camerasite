const assert = require('node:assert/strict');
const test = require('node:test');

const initialContent = require('../../src/db/seeds/initialContent');

const REQUIRED_SETTINGS = [
  'business',
  'navigation',
  'footer',
  'trust_bar',
  'contact',
  'seo_defaults'
];

const REQUIRED_PAGE_KEYS = [
  'home',
  'residential',
  'commercial',
  'services',
  'about',
  'contact'
];

const REQUIRED_PAGE_FIELDS = [
  'slug',
  'template',
  'path',
  'title',
  'metaDescription',
  'ogTitle',
  'ogDescription',
  'canonicalPath',
  'headerEyebrow',
  'headerTitle',
  'headerLede',
  'schemaType',
  'schemaData',
  'isPublished',
  'blocks'
];

function getBlock(page, blockKey) {
  return page.blocks.find((block) => block.blockKey === blockKey);
}

function assertImageMetadata(container, expected) {
  const metadata = container.metadata || container.settings;

  assert.equal(metadata.imagePlaceholder, expected.imagePlaceholder);
  assert.equal(metadata.imageSlot, expected.imageSlot);
  assert.equal(metadata.placeholderClass, expected.placeholderClass);
}

test('initial content exposes required site settings and six pages', () => {
  for (const key of REQUIRED_SETTINGS) {
    assert.ok(initialContent.settings[key], `missing settings.${key}`);
  }

  assert.equal(initialContent.settings.business.name, 'CamerasNYC');
  assert.equal(initialContent.settings.business.phoneDisplay, '929-801-7756');
  assert.equal(initialContent.settings.business.phoneHref, 'tel:+19298017756');
  assert.equal(initialContent.settings.contact.office, 'Brooklyn, NY');
  assert.equal(initialContent.settings.trust_bar.items.includes('Licensed & Insured'), true);
  assert.equal(initialContent.settings.navigation.links.length, 5);

  assert.deepEqual(Object.keys(initialContent.pages), REQUIRED_PAGE_KEYS);
});

test('each seeded page has the required editable page fields and stable blocks', () => {
  for (const [pageKey, page] of Object.entries(initialContent.pages)) {
    for (const field of REQUIRED_PAGE_FIELDS) {
      assert.equal(Object.hasOwn(page, field), true, `${pageKey} missing ${field}`);
    }

    assert.equal(typeof page.slug, 'string');
    assert.equal(typeof page.template, 'string');
    assert.equal(typeof page.path, 'string');
    assert.equal(typeof page.title, 'string');
    assert.equal(typeof page.metaDescription, 'string');
    assert.equal(typeof page.ogTitle, 'string');
    assert.equal(typeof page.ogDescription, 'string');
    assert.equal(typeof page.canonicalPath, 'string');
    assert.equal(typeof page.headerEyebrow, 'string');
    assert.equal(typeof page.headerTitle, 'string');
    assert.equal(typeof page.headerLede, 'string');
    assert.equal(typeof page.schemaType, 'string');
    assert.equal(typeof page.schemaData, 'object');
    assert.equal(page.isPublished, true);
    assert.equal(Array.isArray(page.blocks), true);
    assert.ok(page.blocks.length > 0, `${pageKey} should have editable blocks`);

    const blockKeys = new Set();
    for (const block of page.blocks) {
      assert.equal(typeof block.blockKey, 'string', `${pageKey} block missing blockKey`);
      assert.equal(blockKeys.has(block.blockKey), false, `${pageKey} duplicate block ${block.blockKey}`);
      blockKeys.add(block.blockKey);
      assert.equal(typeof block.blockType, 'string', `${pageKey}.${block.blockKey} missing blockType`);
      assert.equal(typeof block.sortOrder, 'number', `${pageKey}.${block.blockKey} missing sortOrder`);
      assert.equal(typeof block.isEnabled, 'boolean', `${pageKey}.${block.blockKey} missing isEnabled`);

      for (const item of block.items || []) {
        assert.equal(typeof item.itemKey, 'string', `${pageKey}.${block.blockKey} item missing itemKey`);
        assert.equal(typeof item.sortOrder, 'number', `${pageKey}.${block.blockKey}.${item.itemKey} missing sortOrder`);
        assert.equal(typeof item.isFeatured, 'boolean', `${pageKey}.${block.blockKey}.${item.itemKey} missing isFeatured`);
        assert.equal(typeof item.isEnabled, 'boolean', `${pageKey}.${block.blockKey}.${item.itemKey} missing isEnabled`);
        assert.equal(typeof item.metadata, 'object', `${pageKey}.${block.blockKey}.${item.itemKey} missing metadata`);
      }
    }
  }
});

test('home seed preserves major homepage sections and image placeholders', () => {
  const home = initialContent.pages.home;

  assert.equal(home.slug, 'home');
  assert.equal(home.path, '/');
  assert.equal(home.headerEyebrow, 'Security cameras · NYC, LI, NJ');
  assert.equal(home.headerTitle, 'Cameras that actually watch. Installed right the first time.');
  assert.match(home.headerLede, /No call centers, no 36-month contracts/);

  assert.ok(getBlock(home, 'hero'));
  assert.ok(getBlock(home, 'systems'));
  assert.ok(getBlock(home, 'included'));
  assert.ok(getBlock(home, 'why_local'));
  assert.ok(getBlock(home, 'service_area'));
  assert.ok(getBlock(home, 'recent_work'));
  assert.ok(getBlock(home, 'quote_cta'));

  const hero = getBlock(home, 'hero');
  assert.equal(hero.blockType, 'hero');
  assertImageMetadata(hero, {
    imagePlaceholder: 'hero-front-porch-doorbell',
    imageSlot: 'hero',
    placeholderClass: 'photo-ph--dusk'
  });
  assert.deepEqual(
    hero.items.map((item) => item.title),
    ['500+ homes secured', '4.9 on Google', 'Same-day emergency service']
  );

  const systems = getBlock(home, 'systems');
  assert.deepEqual(
    systems.items.map((item) => item.title),
    ['Residential', 'Commercial']
  );
  assertImageMetadata(systems.items[0], {
    imagePlaceholder: 'residential-doorbell',
    imageSlot: 'home.two_track.residential',
    placeholderClass: 'photo-ph--porch'
  });
  assertImageMetadata(systems.items[1], {
    imagePlaceholder: 'commercial-storefront',
    imageSlot: 'home.two_track.commercial',
    placeholderClass: 'photo-ph--storefront'
  });

  assertImageMetadata(getBlock(home, 'why_local'), {
    imagePlaceholder: 'local-installer-photo',
    imageSlot: 'home.why_local',
    placeholderClass: 'photo-ph--interior'
  });

  const recentWork = getBlock(home, 'recent_work');
  assert.equal(recentWork.blockType, 'case_studies');
  assert.equal(recentWork.items.length, 3);
  assertImageMetadata(recentWork.items[0], {
    imagePlaceholder: 'install-bay-ridge',
    imageSlot: 'home.recent_work.bay_ridge',
    placeholderClass: 'photo-ph--brick'
  });
  assertImageMetadata(recentWork.items[1], {
    imagePlaceholder: 'install-glen-cove',
    imageSlot: 'home.recent_work.glen_cove',
    placeholderClass: 'photo-ph--garden'
  });
  assertImageMetadata(recentWork.items[2], {
    imagePlaceholder: 'install-jersey-city',
    imageSlot: 'home.recent_work.jersey_city',
    placeholderClass: 'photo-ph--lobby'
  });
});

test('service pages preserve products, packages, process, FAQs, image fallback metadata, and contact form content', () => {
  const residential = initialContent.pages.residential;
  const commercial = initialContent.pages.commercial;
  const services = initialContent.pages.services;
  const about = initialContent.pages.about;
  const contact = initialContent.pages.contact;

  assert.equal(residential.headerTitle, "Home security that's actually neighborly.");
  assert.equal(getBlock(residential, 'camera_types').blockType, 'feature_grid');
  assert.equal(getBlock(residential, 'sample_packages').blockType, 'pricing_packages');
  assert.equal(getBlock(residential, 'sample_packages').items[0].price, '$900-$1,400');
  assert.equal(getBlock(residential, 'sample_packages').items[1].isFeatured, true);
  assert.equal(getBlock(residential, 'install_process').items.length, 4);
  assert.equal(getBlock(residential, 'faq').items.length, 6);
  assert.match(getBlock(residential, 'faq').items[0].body, /small fastener holes/);

  assert.equal(commercial.headerTitle, 'Surveillance that scales with your business.');
  assert.equal(getBlock(commercial, 'industries').items.length, 6);
  assert.equal(getBlock(commercial, 'capabilities').blockType, 'feature_grid');
  assert.equal(getBlock(commercial, 'recent_jobs').blockType, 'case_studies');
  assertImageMetadata(getBlock(commercial, 'recent_jobs').items[0], {
    imagePlaceholder: 'case-brooklyn-retail',
    imageSlot: 'commercial.recent_jobs.brooklyn_retail',
    placeholderClass: 'photo-ph--storefront'
  });
  assertImageMetadata(getBlock(commercial, 'recent_jobs').items[1], {
    imagePlaceholder: 'case-warehouse',
    imageSlot: 'commercial.recent_jobs.warehouse',
    placeholderClass: 'photo-ph--warehouse'
  });
  assertImageMetadata(getBlock(commercial, 'recent_jobs').items[2], {
    imagePlaceholder: 'case-jersey-city',
    imageSlot: 'commercial.recent_jobs.jersey_city',
    placeholderClass: 'photo-ph--lobby'
  });

  assert.equal(services.headerTitle, 'How we work — honest from the first call.');
  assert.equal(
    services.headerLede,
    'Four steps, in order. No surprise add-ons. No "platinum-package" upsells once the trucks are out. The quote you accept is the bill you pay.'
  );
  assert.equal(getBlock(services, 'page_header').title, 'How we work — honest from the first call.');
  assert.equal(
    getBlock(services, 'page_header').lede,
    'Four steps, in order. No surprise add-ons. No "platinum-package" upsells once the trucks are out. The quote you accept is the bill you pay.'
  );
  assert.equal(getBlock(services, 'process').blockType, 'process_steps');
  assert.equal(getBlock(services, 'service_tiers').blockType, 'pricing_packages');
  assert.equal(getBlock(services, 'emergency').blockType, 'rich_text');

  assert.equal(about.title, 'About CamerasNYC — Locally-Owned Security Installers');
  assert.equal(about.ogTitle, 'About CamerasNYC — Locally-Owned Security Installers');
  assert.equal(about.headerTitle, 'Brooklyn-based. New York-licensed. Built for the neighborhood.');
  assert.match(getBlock(about, 'origin_story').body, /Marcus Chen spent 12 years/);
  assertImageMetadata(getBlock(about, 'founder'), {
    imagePlaceholder: 'founder-photo',
    imageSlot: 'about.founder',
    placeholderClass: 'photo-ph--interior'
  });
  assert.equal(getBlock(about, 'differentiators').items.length, 3);

  assert.equal(
    contact.metaDescription,
    'Get a free security camera quote in 24 hours. Serving NYC, Long Island, and Northern NJ. Call or fill out the form — we respond within one business day.'
  );
  assert.equal(contact.headerTitle, 'Free quote in 24 hours.');
  assert.equal(getBlock(contact, 'contact_info').blockType, 'contact_info');
  assert.equal(getBlock(contact, 'quote_form').blockType, 'form_intro');
  assert.deepEqual(getBlock(contact, 'quote_form').settings.propertyTypes.slice(0, 2), [
    'Residential - apartment / condo',
    'Residential - single-family home'
  ]);
});
