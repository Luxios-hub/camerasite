const initialContent = require('../db/seeds/initialContent');
const { createContentRepository } = require('../repositories/contentRepository');
const { createPublicRenderHelpers } = require('./publicRenderHelpers');

function bySortOrder(left, right) {
  const leftSort = Number.isFinite(left.sortOrder) ? left.sortOrder : 0;
  const rightSort = Number.isFinite(right.sortOrder) ? right.sortOrder : 0;

  if (leftSort !== rightSort) {
    return leftSort - rightSort;
  }

  return String(left.blockKey || left.itemKey || left.title || '')
    .localeCompare(String(right.blockKey || right.itemKey || right.title || ''));
}

function createSeedRepository(content = initialContent) {
  return {
    async getSiteSettings() {
      return content.settings;
    },
    async getPageWithBlocks(slug) {
      return content.pages[slug] || null;
    }
  };
}

function normalizeItem(item) {
  return {
    ...item,
    metadata: item.metadata || {},
    isEnabled: item.isEnabled !== false
  };
}

function normalizeBlock(block) {
  const normalizedItems = (block.items || [])
    .map(normalizeItem)
    .sort(bySortOrder);

  return {
    ...block,
    settings: block.settings || {},
    isEnabled: block.isEnabled !== false,
    items: normalizedItems
  };
}

function normalizePage(page) {
  if (!page || page.isPublished === false) {
    return null;
  }

  return {
    ...page,
    schemaData: page.schemaData || {},
    blocks: (page.blocks || [])
      .map(normalizeBlock)
      .sort(bySortOrder)
  };
}

function hasExplicitDatabaseUrl() {
  return Boolean(process.env.DATABASE_URL);
}

function firstPublicPath(values) {
  return values.find((value) => typeof value === 'string' && value.trim().length > 0) || null;
}

function mediaUrl(itemOrPage) {
  if (!itemOrPage) {
    return null;
  }

  return firstPublicPath([
    itemOrPage.publicPath,
    itemOrPage.media && itemOrPage.media.publicPath,
    itemOrPage.image && itemOrPage.image.publicPath,
    itemOrPage.ogImage && itemOrPage.ogImage.publicPath,
    itemOrPage.ogImageMedia && itemOrPage.ogImageMedia.publicPath,
    itemOrPage.metadata && itemOrPage.metadata.publicPath,
    itemOrPage.metadata && itemOrPage.metadata.media && itemOrPage.metadata.media.publicPath,
    itemOrPage.settings && itemOrPage.settings.publicPath,
    itemOrPage.settings && itemOrPage.settings.media && itemOrPage.settings.media.publicPath
  ]);
}

function joinUrl(baseUrl, pathOrUrl) {
  if (!pathOrUrl) {
    return baseUrl;
  }

  if (/^https?:\/\//i.test(pathOrUrl)) {
    return pathOrUrl;
  }

  const normalizedBase = String(baseUrl || '').replace(/\/+$/, '');
  const normalizedPath = String(pathOrUrl).startsWith('/') ? pathOrUrl : `/${pathOrUrl}`;

  return `${normalizedBase}${normalizedPath}`;
}

function buildFaqSchema(blocksByKey) {
  const faqBlock = blocksByKey.faq;

  if (!faqBlock) {
    return null;
  }

  const questions = (faqBlock.items || [])
    .filter((item) => item.isEnabled !== false)
    .map((item) => ({
      '@type': 'Question',
      name: item.title,
      acceptedAnswer: {
        '@type': 'Answer',
        text: item.body || ''
      }
    }));

  if (questions.length === 0) {
    return null;
  }

  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: questions
  };
}

async function readFromRepository(slug, repository) {
  const [settings, page] = await Promise.all([
    repository.getSiteSettings(),
    repository.getPageWithBlocks(slug)
  ]);

  return {
    settings,
    page: normalizePage(page)
  };
}

async function buildPageViewModel(slug, options = {}) {
  const content = options.content || initialContent;
  const fallbackRepository = options.fallbackRepository || createSeedRepository(content);
  const hasRepository = Boolean(options.repository);
  const shouldUseContentRepository = !hasRepository && (options.useRepository === true || hasExplicitDatabaseUrl());
  const allowSeedFallback = options.enableSeedFallback === true || options.useSeedFallback === true;

  let settings = null;
  let page = null;

  if (hasRepository || shouldUseContentRepository) {
    const repository = options.repository || createContentRepository(options.db);

    try {
      const result = await readFromRepository(slug, repository);
      settings = result.settings;
      page = result.page;
    } catch (error) {
      if (!allowSeedFallback) {
        throw error;
      }
    }

    if (!allowSeedFallback) {
      return page ? finalizeViewModel({ settings, page, content }) : null;
    }
  }

  if (!page) {
    const result = await readFromRepository(slug, fallbackRepository);
    settings = result.settings;
    page = result.page;
  }

  if (!page) {
    return null;
  }

  return finalizeViewModel({ settings, page, content });
}

function finalizeViewModel({ settings, page, content }) {
  const blocksByKey = {};
  for (const block of page.blocks) {
    blocksByKey[block.blockKey] = block;
  }

  const enabledBlocks = page.blocks.filter((block) => block.isEnabled !== false);
  const itemHelper = (blockKey) => {
    const block = blocksByKey[blockKey];

    if (!block) {
      return [];
    }

    return block.items.filter((item) => item.isEnabled !== false);
  };
  const seoDefaults = (settings && settings.seo_defaults) || {};
  const baseUrl = seoDefaults.baseUrl || 'https://camerasnyc.com';
  const canonicalUrl = joinUrl(baseUrl, page.canonicalPath || page.path || '/');
  const ogImageUrl = mediaUrl(page) || seoDefaults.ogImage || joinUrl(baseUrl, '/assets/images/og-image.png');
  const jsonLdSchemas = [];
  const renderHelpers = createPublicRenderHelpers({ baseUrl });

  if (page.schemaType && Object.keys(page.schemaData || {}).length > 0) {
    jsonLdSchemas.push(page.schemaData);
  }

  const faqSchema = buildFaqSchema(blocksByKey);
  if (faqSchema) {
    jsonLdSchemas.push(faqSchema);
  }

  return {
    settings: settings || content.settings,
    page,
    blocksByKey,
    enabledBlocks,
    canonicalUrl,
    ogImageUrl,
    baseUrl,
    jsonLdSchemas,
    helpers: {
      items: itemHelper,
      mediaUrl,
      ...renderHelpers
    },
    items: itemHelper,
    mediaUrl,
    ...renderHelpers
  };
}

module.exports = {
  buildPageViewModel,
  createSeedRepository,
  mediaUrl
};
