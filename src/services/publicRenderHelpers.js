const ALLOWED_EXTERNAL_HOSTS = new Set([
  'camerasnyc.com',
  'www.camerasnyc.com',
  'wa.me',
  'formspree.io'
]);

const ALLOWED_INPUT_TYPES = new Set([
  'email',
  'hidden',
  'number',
  'select',
  'tel',
  'text',
  'textarea'
]);

const ALLOWED_AUTOCOMPLETE = new Set([
  'email',
  'name',
  'off',
  'on',
  'organization',
  'postal-code',
  'street-address',
  'tel'
]);

const ALLOWED_INPUT_MODES = new Set([
  'decimal',
  'email',
  'numeric',
  'search',
  'tel',
  'text',
  'url'
]);

function baseHost(baseUrl) {
  try {
    return new URL(baseUrl).hostname.toLowerCase();
  } catch {
    return 'camerasnyc.com';
  }
}

function allowedHosts(baseUrl) {
  const hosts = new Set(ALLOWED_EXTERNAL_HOSTS);
  const host = baseHost(baseUrl);

  hosts.add(host);
  if (!host.startsWith('www.')) {
    hosts.add(`www.${host}`);
  }

  return hosts;
}

function hasUnsafeCharacters(value) {
  return /[\u0000-\u001F\u007F<>"\\]/.test(value);
}

function isSafeRelativeUrl(value) {
  if (value === '#') {
    return true;
  }

  if (value.startsWith('#')) {
    return /^#[A-Za-z0-9._~!$&'()*+,;=:@%/?-]+$/.test(value);
  }

  if (value.startsWith('/')) {
    return !value.startsWith('//') && !hasUnsafeCharacters(value);
  }

  if (/^[A-Za-z][A-Za-z0-9+.-]*:/.test(value)) {
    return false;
  }

  return /^[A-Za-z0-9._~!$&'()*+,;=:@%/?#-]+$/.test(value);
}

function isSafeTelUrl(value) {
  return /^tel:\+?[0-9().\-\s]+$/i.test(value);
}

function isSafeMailtoUrl(value) {
  return /^mailto:[^\s@<>"\\]+@[^\s@<>"\\]+\.[^\s@<>"\\]+$/i.test(value);
}

function sanitizePublicUrl(value, options = {}) {
  const fallback = Object.hasOwn(options, 'fallback') ? options.fallback : '#';

  if (typeof value !== 'string') {
    return fallback;
  }

  const trimmed = value.trim();
  if (trimmed.length === 0 || hasUnsafeCharacters(trimmed)) {
    return fallback;
  }

  if (isSafeTelUrl(trimmed) || isSafeMailtoUrl(trimmed)) {
    return trimmed;
  }

  if (/^https:\/\//i.test(trimmed)) {
    try {
      const url = new URL(trimmed);
      return allowedHosts(options.baseUrl).has(url.hostname.toLowerCase()) ? trimmed : fallback;
    } catch {
      return fallback;
    }
  }

  if (/^[A-Za-z][A-Za-z0-9+.-]*:/.test(trimmed)) {
    return fallback;
  }

  return isSafeRelativeUrl(trimmed) ? trimmed : fallback;
}

function isExternalPublicUrl(value, options = {}) {
  const safeUrl = sanitizePublicUrl(value, { ...options, fallback: '' });

  return /^https:\/\//i.test(safeUrl);
}

function safeIdentifier(value, fallback) {
  if (typeof value !== 'string') {
    return fallback;
  }

  const trimmed = value.trim();

  return /^[A-Za-z][A-Za-z0-9_-]{0,63}$/.test(trimmed) ? trimmed : fallback;
}

function safeFormMethod(value) {
  return typeof value === 'string' && value.toUpperCase() === 'GET' ? 'GET' : 'POST';
}

function safeInputType(value) {
  if (typeof value !== 'string') {
    return 'text';
  }

  const normalized = value.toLowerCase();

  return ALLOWED_INPUT_TYPES.has(normalized) ? normalized : 'text';
}

function safeAutocomplete(value) {
  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value.trim().toLowerCase();

  return ALLOWED_AUTOCOMPLETE.has(normalized) ? normalized : null;
}

function safePattern(value) {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();

  return trimmed.length > 0
    && trimmed.length <= 128
    && /^[A-Za-z0-9\\[\]{}()^$+*?.|_-]+$/.test(trimmed)
    ? trimmed
    : null;
}

function safeMaxLength(value) {
  const parsed = Number(value);

  return Number.isInteger(parsed) && parsed > 0 && parsed <= 1000 ? String(parsed) : null;
}

function safeInputMode(value) {
  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value.trim().toLowerCase();

  return ALLOWED_INPUT_MODES.has(normalized) ? normalized : null;
}

function safeFormField(field, index) {
  const sourceName = typeof field.name === 'string' ? field.name : '';
  const fallbackName = `field_${index + 1}`;
  const name = safeIdentifier(sourceName, fallbackName);
  const type = safeInputType(field.type);

  return {
    sourceName,
    id: name,
    name,
    type,
    required: field.required === true,
    autocomplete: safeAutocomplete(field.autocomplete),
    pattern: safePattern(field.pattern),
    maxlength: safeMaxLength(field.maxlength),
    inputmode: safeInputMode(field.inputmode) || (name === 'zip' ? 'numeric' : null)
  };
}

function createPublicRenderHelpers(options = {}) {
  const baseUrl = options.baseUrl || 'https://camerasnyc.com';

  return {
    safeUrl(value, fallback = '#') {
      return sanitizePublicUrl(value, { baseUrl, fallback });
    },
    isExternalUrl(value) {
      return isExternalPublicUrl(value, { baseUrl });
    },
    safeFormField,
    safeFormMethod,
    safeFormName(value, fallback = 'quote') {
      return safeIdentifier(value, fallback);
    }
  };
}

module.exports = {
  createPublicRenderHelpers,
  sanitizePublicUrl,
  isExternalPublicUrl,
  safeFormField,
  safeFormMethod
};
