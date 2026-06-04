const path = require('node:path');
const crypto = require('node:crypto');
const express = require('express');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const session = require('express-session');
const pgSession = require('connect-pg-simple');
const { env } = require('./config/env');
const { pool } = require('./db/pool');
const { createAdminRouter } = require('./routes/adminRoutes');
const { createPublicRouter } = require('./routes/publicRoutes');

const PgSessionStore = pgSession(session);

function resolveFromRoot(...segments) {
  return path.join(__dirname, '..', ...segments);
}

function resolveUploadRoot() {
  if (path.isAbsolute(env.UPLOAD_ROOT)) {
    return env.UPLOAD_ROOT;
  }

  return resolveFromRoot(env.UPLOAD_ROOT);
}

function createSessionStore(sessionOptions = {}) {
  if (sessionOptions.store) {
    return sessionOptions.store;
  }

  if (sessionOptions.useMemoryStore) {
    return undefined;
  }

  return new PgSessionStore({
    pool: sessionOptions.pool || pool,
    tableName: 'session',
    createTableIfMissing: false
  });
}

function createSessionMiddleware(options = {}) {
  const sessionOptions = options.session || {};

  return session({
    name: sessionOptions.name || 'camerasnyc.sid',
    secret: sessionOptions.secret || env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    store: createSessionStore(sessionOptions),
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure: env.NODE_ENV === 'production',
      maxAge: sessionOptions.maxAge || 1000 * 60 * 60 * 8,
      ...(sessionOptions.cookie || {})
    }
  });
}

function attachCspNonce(req, res, next) {
  res.locals.cspNonce = crypto.randomBytes(16).toString('base64');
  next();
}

function createSecurityMiddleware() {
  return helmet({
    contentSecurityPolicy: {
      directives: {
        scriptSrc: ["'self'", (req, res) => `'nonce-${res.locals.cspNonce}'`]
      }
    }
  });
}

function createApp(options = {}) {
  const app = express();

  app.disable('x-powered-by');
  app.set('trust proxy', options.trustProxy ?? (env.NODE_ENV === 'production' ? 1 : false));
  app.use(attachCspNonce);
  app.use(createSecurityMiddleware());
  app.use(express.urlencoded({ extended: false }));
  app.use(express.json());
  app.use(cookieParser());

  app.set('views', resolveFromRoot('src', 'views'));
  app.set('view engine', 'ejs');

  app.use('/css', express.static(resolveFromRoot('css')));
  app.use('/js', express.static(resolveFromRoot('js')));
  app.use('/assets', express.static(resolveFromRoot('assets')));
  app.use('/uploads', express.static(resolveUploadRoot()));
  app.use('/admin/css', express.static(resolveFromRoot('admin', 'css')));
  app.use('/admin/js', express.static(resolveFromRoot('admin', 'js')));

  if (options.session !== false) {
    app.use(createSessionMiddleware(options));
  }

  app.get('/healthz', (req, res) => {
    res.json({ ok: true });
  });

  app.use('/admin', createAdminRouter(options));
  app.use(createPublicRouter(options.public || {}));

  return app;
}

module.exports = {
  createApp,
  createSessionMiddleware
};
