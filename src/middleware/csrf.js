const crypto = require('node:crypto');

const CSRF_FIELD_NAME = '_csrf';
const CSRF_SESSION_KEY = 'adminCsrfToken';

function ensureSession(req) {
  if (!req.session) {
    throw new Error('Session middleware is required before CSRF middleware.');
  }

  return req.session;
}

function getCsrfToken(req) {
  const session = ensureSession(req);

  if (typeof session[CSRF_SESSION_KEY] !== 'string' || session[CSRF_SESSION_KEY].length === 0) {
    session[CSRF_SESSION_KEY] = crypto.randomBytes(32).toString('hex');
  }

  return session[CSRF_SESSION_KEY];
}

function safeTokenEqual(expected, actual) {
  if (typeof expected !== 'string' || typeof actual !== 'string') {
    return false;
  }

  const expectedBuffer = Buffer.from(expected);
  const actualBuffer = Buffer.from(actual);

  return expectedBuffer.length === actualBuffer.length
    && crypto.timingSafeEqual(expectedBuffer, actualBuffer);
}

function attachCsrfToken(req, res, next) {
  try {
    res.locals.csrfToken = getCsrfToken(req);
    next();
  } catch (error) {
    next(error);
  }
}

function verifyCsrfToken(req, res, next) {
  const expected = req.session && req.session[CSRF_SESSION_KEY];
  const actual = req.body && req.body[CSRF_FIELD_NAME]
    ? req.body[CSRF_FIELD_NAME]
    : req.get('x-csrf-token');

  if (!safeTokenEqual(expected, actual)) {
    res.status(403).send('Forbidden');
    return;
  }

  next();
}

module.exports = {
  CSRF_FIELD_NAME,
  attachCsrfToken,
  getCsrfToken,
  verifyCsrfToken
};
