const DASHBOARD_STATUSES = ['new', 'contacted', 'quoted', 'won', 'lost', 'spam'];
const ARRAY_METADATA_KEYS = new Set([
  'areas',
  'includes',
  'steps',
  'details',
  'features',
  'bullets',
  'included',
  'imageCaption',
  'logos',
  'comparisonFeatures'
]);
const STRING_METADATA_KEYS = new Set([
  'imageSlot',
  'placeholderClass',
  'imagePlaceholder',
  'tag',
  'audience',
  'priceSuffix',
  'kind',
  'label',
  'value'
]);
const SAME_SITE_HOSTS = new Set(['camerasnyc.com', 'www.camerasnyc.com']);

function stringValue(value) {
  if (typeof value === 'string') {
    return value;
  }

  if (value == null) {
    return '';
  }

  return String(value);
}

function trimmedValue(value) {
  return stringValue(value).trim();
}

function nullableText(value) {
  const trimmed = trimmedValue(value);
  return trimmed.length > 0 ? trimmed : null;
}

function checkboxValue(value) {
  return value === true || value === 'true' || value === 'on' || value === '1';
}

function integerValue(value, fallback = 0) {
  const parsed = Number.parseInt(stringValue(value), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function splitLines(value) {
  return stringValue(value)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function credentialObject(label) {
  const [first, ...rest] = label.split(/\s+/);

  return {
    label: first || label,
    value: rest.join(' ')
  };
}

function normalizePhoneHref(value) {
  const input = trimmedValue(value);

  if (!input) {
    return '';
  }

  if (/^tel:/i.test(input)) {
    return input;
  }

  const normalized = input.replace(/[^\d+]/g, '');
  return `tel:${normalized || input}`;
}

function normalizePhoneNumber(value) {
  return trimmedValue(value).replace(/^tel:/i, '');
}

function normalizeWhatsappNumber(value) {
  return trimmedValue(value).replace(/[^\d]/g, '');
}

function whatsappUrl(number, message) {
  const normalized = normalizeWhatsappNumber(number);

  if (!normalized) {
    return '';
  }

  const text = trimmedValue(message);
  return text
    ? `https://wa.me/${normalized}?text=${encodeURIComponent(text)}`
    : `https://wa.me/${normalized}`;
}

function replaceFooterContact(footer, phoneDisplay, phoneHref, whatsappHref, officeText) {
  const columns = (footer.columns || []).map((column) => {
    if (column.title !== 'Contact') {
      return column;
    }

    return {
      ...column,
      links: [
        { label: phoneDisplay, href: phoneHref },
        ...(whatsappHref ? [{ label: 'WhatsApp', href: whatsappHref }] : [])
      ],
      items: officeText ? [officeText] : []
    };
  });

  return {
    ...footer,
    columns
  };
}

function settingsFormFromSettings(settings = {}) {
  const business = settings.business || {};
  const contact = settings.contact || {};
  const footer = settings.footer || {};
  const whatsappMessage = business.whatsappMessage || contact.whatsappMessage || "Hi CamerasNYC, I'd like a free quote.";

  return {
    businessName: business.name || '',
    phoneDisplay: business.phoneDisplay || contact.phoneDisplay || '',
    phoneTel: business.phoneNumber || business.phoneHref || contact.phoneHref || '',
    whatsappNumber: business.whatsappNumber || '',
    whatsappMessage,
    reviewRating: business.reviewRating || '',
    reviewCount: business.reviewCount || '',
    serviceAreaText: business.serviceArea || contact.serviceArea || '',
    officeText: business.office || contact.office || '',
    credentialLabels: (footer.credentials || (business.credentials || []).map((credential) => {
      return [credential.label, credential.value].filter(Boolean).join(' ');
    })).join('\n')
  };
}

function buildSettingsUpdates(currentSettings = {}, body = {}) {
  const form = settingsFormFromSettings(currentSettings);
  const businessName = trimmedValue(body.businessName) || form.businessName;
  const phoneDisplay = trimmedValue(body.phoneDisplay) || form.phoneDisplay;
  const phoneNumber = normalizePhoneNumber(body.phoneTel || form.phoneTel);
  const phoneHref = normalizePhoneHref(body.phoneTel || form.phoneTel);
  const whatsappNumber = normalizeWhatsappNumber(body.whatsappNumber || form.whatsappNumber);
  const whatsappMessage = trimmedValue(body.whatsappMessage || form.whatsappMessage);
  const whatsappHref = whatsappUrl(whatsappNumber, whatsappMessage);
  const reviewRating = trimmedValue(body.reviewRating) || form.reviewRating;
  const reviewCount = trimmedValue(body.reviewCount) || form.reviewCount;
  const serviceAreaText = trimmedValue(body.serviceAreaText) || form.serviceAreaText;
  const officeText = trimmedValue(body.officeText) || form.officeText;
  const credentialLabels = splitLines(body.credentialLabels || form.credentialLabels);

  const business = {
    ...(currentSettings.business || {}),
    name: businessName,
    phoneDisplay,
    phoneNumber,
    phoneHref,
    whatsappNumber,
    whatsappMessage,
    whatsappQuoteUrl: whatsappHref,
    reviewRating,
    reviewCount,
    serviceArea: serviceAreaText,
    office: officeText,
    credentials: credentialLabels.map(credentialObject)
  };
  const navigation = {
    ...(currentSettings.navigation || {}),
    brand: businessName
  };
  const footer = replaceFooterContact({
    ...(currentSettings.footer || {}),
    about: serviceAreaText
      ? `Locally-owned security camera installation for homes and businesses across ${serviceAreaText}.`
      : (currentSettings.footer && currentSettings.footer.about) || '',
    copyright: `${businessName} LLC. All rights reserved.`,
    credentials: credentialLabels
  }, phoneDisplay, phoneHref, whatsappHref, officeText);
  const contact = {
    ...(currentSettings.contact || {}),
    phoneDisplay,
    phoneHref,
    whatsappHref,
    whatsappNumber,
    whatsappMessage,
    serviceArea: serviceAreaText,
    office: officeText
  };
  const trustBar = {
    ...(currentSettings.trust_bar || {}),
    items: [
      credentialLabels[0] || 'Licensed & Insured',
      reviewRating ? `${reviewRating} on Google` : 'Google reviews',
      serviceAreaText || 'NYC - Long Island - New Jersey'
    ]
  };

  return {
    business,
    navigation,
    footer,
    contact,
    trust_bar: trustBar
  };
}

function pageFormFromPage(page) {
  return {
    title: page.title || '',
    metaDescription: page.metaDescription || '',
    ogTitle: page.ogTitle || '',
    ogDescription: page.ogDescription || '',
    canonicalPath: page.canonicalPath || page.path || '',
    headerEyebrow: page.headerEyebrow || '',
    headerTitle: page.headerTitle || '',
    headerLede: page.headerLede || '',
    isPublished: page.isPublished !== false
  };
}

function pageInputFromBody(body = {}) {
  return {
    title: trimmedValue(body.title),
    metaDescription: trimmedValue(body.metaDescription),
    ogTitle: trimmedValue(body.ogTitle),
    ogDescription: trimmedValue(body.ogDescription),
    canonicalPath: trimmedValue(body.canonicalPath),
    headerEyebrow: trimmedValue(body.headerEyebrow),
    headerTitle: trimmedValue(body.headerTitle),
    headerLede: trimmedValue(body.headerLede),
    isPublished: checkboxValue(body.isPublished)
  };
}

function publicBaseHost() {
  try {
    const { env } = require('../config/env');
    return new URL(env.PUBLIC_BASE_URL).host.toLowerCase();
  } catch (error) {
    return null;
  }
}

function isSafeRelativePath(value) {
  return value.startsWith('/') && !value.startsWith('//') && !/[\r\n]/.test(value);
}

function sanitizeCanonicalPath(value) {
  const input = trimmedValue(value);

  if (isSafeRelativePath(input)) {
    return {
      ok: true,
      value: input
    };
  }

  try {
    const url = new URL(input);
    const baseHost = publicBaseHost();
    const allowedHosts = new Set(SAME_SITE_HOSTS);
    if (baseHost) {
      allowedHosts.add(baseHost);
    }

    if (!['http:', 'https:'].includes(url.protocol) || !allowedHosts.has(url.host.toLowerCase())) {
      return {
        ok: false,
        error: 'Canonical path must be a relative path or same-site URL.'
      };
    }

    return {
      ok: true,
      value: `${url.pathname || '/'}${url.search}${url.hash}`
    };
  } catch (error) {
    return {
      ok: false,
      error: 'Canonical path must be a relative path or same-site URL.'
    };
  }
}

function validatePageInput(input) {
  const canonical = sanitizeCanonicalPath(input.canonicalPath);

  if (!canonical.ok) {
    return {
      ok: false,
      error: canonical.error,
      form: input
    };
  }

  return {
    ok: true,
    input: {
      ...input,
      canonicalPath: canonical.value
    }
  };
}

function blockFieldName(blockKey, field) {
  return `blocks.${blockKey}.${field}`;
}

function blockUpdatesFromBody(page, body = {}, pageInput = null) {
  const updates = [];

  for (const block of page.blocks || []) {
    const next = {};
    let hasExplicitField = false;

    if (block.blockKey === 'page_header' && pageInput) {
      const bodyName = blockFieldName(block.blockKey, 'body');
      updates.push({
        blockKey: block.blockKey,
        input: {
          eyebrow: pageInput.headerEyebrow,
          title: pageInput.headerTitle,
          lede: pageInput.headerLede,
          body: Object.prototype.hasOwnProperty.call(body, bodyName)
            ? nullableText(body[bodyName])
            : block.body || null,
          isEnabled: true
        }
      });
      continue;
    }

    for (const field of ['eyebrow', 'title', 'lede', 'body']) {
      const name = blockFieldName(block.blockKey, field);
      if (Object.prototype.hasOwnProperty.call(body, name)) {
        next[field] = nullableText(body[name]);
        hasExplicitField = true;
      }
    }

    const enabledName = blockFieldName(block.blockKey, 'isEnabled');
    if (hasExplicitField || Object.prototype.hasOwnProperty.call(body, enabledName)) {
      next.isEnabled = checkboxValue(body[enabledName]);
      updates.push({ blockKey: block.blockKey, input: next });
    }
  }

  return updates;
}

function metadataText(value) {
  return JSON.stringify(value || {}, null, 2);
}

function itemFormFromItem(item = {}) {
  return {
    title: item.title || '',
    subtitle: item.subtitle || '',
    body: item.body || '',
    price: item.price || '',
    badge: item.badge || '',
    linkLabel: item.linkLabel || '',
    linkUrl: item.linkUrl || '',
    sortOrder: String(item.sortOrder ?? 0),
    isFeatured: item.isFeatured === true,
    isEnabled: item.isEnabled !== false,
    metadata: metadataText(item.metadata)
  };
}

function parseMetadataJson(value) {
  try {
    const parsed = JSON.parse(trimmedValue(value) || '{}');
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return {
        ok: false,
        error: 'Metadata must be a JSON object.'
      };
    }

    return {
      ok: true,
      value: parsed
    };
  } catch (error) {
    return {
      ok: false,
      error: 'Metadata must be valid JSON.'
    };
  }
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function validateMetadataShape(metadata) {
  for (const key of ARRAY_METADATA_KEYS) {
    if (Object.prototype.hasOwnProperty.call(metadata, key) && !Array.isArray(metadata[key])) {
      return {
        ok: false,
        error: `Metadata field ${key} must be an array.`
      };
    }
  }

  for (const key of STRING_METADATA_KEYS) {
    if (Object.prototype.hasOwnProperty.call(metadata, key) && typeof metadata[key] !== 'string') {
      return {
        ok: false,
        error: `Metadata field ${key} must be a string.`
      };
    }
  }

  if (Object.prototype.hasOwnProperty.call(metadata, 'kpi')
    && typeof metadata.kpi !== 'string'
    && !isPlainObject(metadata.kpi)) {
    return {
      ok: false,
      error: 'Metadata field kpi must be a string or object.'
    };
  }

  return {
    ok: true
  };
}

function itemInputFromBody(body = {}) {
  const metadata = parseMetadataJson(body.metadata);

  if (!metadata.ok) {
    return {
      ok: false,
      error: metadata.error,
      form: {
        ...itemFormFromItem(body),
        isFeatured: checkboxValue(body.isFeatured),
        isEnabled: checkboxValue(body.isEnabled),
        metadata: stringValue(body.metadata)
      }
    };
  }

  const metadataShape = validateMetadataShape(metadata.value);
  if (!metadataShape.ok) {
    return {
      ok: false,
      error: metadataShape.error,
      form: {
        ...itemFormFromItem(body),
        isFeatured: checkboxValue(body.isFeatured),
        isEnabled: checkboxValue(body.isEnabled),
        metadata: stringValue(body.metadata)
      }
    };
  }

  return {
    ok: true,
    input: {
      title: nullableText(body.title),
      subtitle: nullableText(body.subtitle),
      body: nullableText(body.body),
      price: nullableText(body.price),
      badge: nullableText(body.badge),
      linkLabel: nullableText(body.linkLabel),
      linkUrl: nullableText(body.linkUrl),
      sortOrder: integerValue(body.sortOrder),
      isFeatured: checkboxValue(body.isFeatured),
      isEnabled: checkboxValue(body.isEnabled),
      metadata: metadata.value
    }
  };
}

async function safeCall(fallback, callback) {
  try {
    return await callback();
  } catch (error) {
    return fallback;
  }
}

function leadCountMap(rows = []) {
  const counts = new Map(DASHBOARD_STATUSES.map((status) => [status, 0]));

  for (const row of rows || []) {
    const status = row.status || 'new';
    const count = Number(row.count);
    counts.set(status, Number.isFinite(count) ? count : 0);
  }

  return DASHBOARD_STATUSES.map((status) => ({
    status,
    count: counts.get(status) || 0
  }));
}

async function buildDashboardViewModel(repositories = {}) {
  const contentRepository = repositories.contentRepository;
  const leadRepository = repositories.leadRepository;
  const auditRepository = repositories.auditRepository;
  const mediaRepository = repositories.mediaRepository || contentRepository;
  const pages = contentRepository && typeof contentRepository.listPages === 'function'
    ? await safeCall([], () => contentRepository.listPages())
    : [];
  const pageCount = contentRepository && typeof contentRepository.countPages === 'function'
    ? await safeCall(pages.length || null, () => contentRepository.countPages())
    : (pages.length || null);
  const mediaCount = mediaRepository && typeof mediaRepository.countMediaAssets === 'function'
    ? await safeCall(null, () => mediaRepository.countMediaAssets())
    : null;
  const leadCounts = leadRepository && typeof leadRepository.countLeadsByStatus === 'function'
    ? await safeCall([], () => leadRepository.countLeadsByStatus())
    : [];
  const recentLeads = leadRepository && typeof leadRepository.listLeads === 'function'
    ? await safeCall([], () => leadRepository.listLeads({ limit: 5 }))
    : [];
  const auditEvents = auditRepository && typeof auditRepository.listAuditEvents === 'function'
    ? await safeCall([], () => auditRepository.listAuditEvents({ limit: 5 }))
    : [];

  return {
    pageCount,
    mediaCount,
    leadCounts: leadCountMap(leadCounts),
    recentLeads: recentLeads || [],
    auditEvents: auditEvents || []
  };
}

module.exports = {
  blockFieldName,
  blockUpdatesFromBody,
  buildDashboardViewModel,
  buildSettingsUpdates,
  checkboxValue,
  itemFormFromItem,
  itemInputFromBody,
  metadataText,
  pageFormFromPage,
  pageInputFromBody,
  settingsFormFromSettings,
  stringValue,
  validatePageInput
};
