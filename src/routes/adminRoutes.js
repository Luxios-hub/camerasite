const express = require('express');
const rateLimit = require('express-rate-limit');
const { createAdminRepository } = require('../repositories/adminRepository');
const { createAuditRepository } = require('../repositories/auditRepository');
const passwordHelpers = require('../services/passwords');
const { createRequireAdmin, destroySession } = require('../middleware/auth');
const { attachCsrfToken, getCsrfToken, verifyCsrfToken } = require('../middleware/csrf');

const GENERIC_LOGIN_ERROR = 'Email or password is incorrect.';
const DUMMY_PASSWORD_HASH = '$2b$12$0Us3jKrmtMCVUBfxFMewW.0zvjilGGsKpZsS2ftYG0vFFtpUxfzE.';

function stringValue(value) {
  return typeof value === 'string' ? value : String(value || '');
}

function escapeHtml(value) {
  return stringValue(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function renderView(app, view, locals) {
  return new Promise((resolve, reject) => {
    app.render(view, locals, (error, html) => {
      if (error) {
        reject(error);
        return;
      }

      resolve(html);
    });
  });
}

async function renderAdminView(req, res, view, locals = {}, statusCode = 200) {
  const body = await renderView(req.app, view, locals);

  res.status(statusCode).render('layouts/admin', {
    title: locals.title || 'Admin',
    adminUser: req.adminUser || locals.adminUser || null,
    body
  });
}

function renderAdminHtml(res, locals = {}, statusCode = 200) {
  res.status(statusCode).render('layouts/admin', {
    title: locals.title || 'Admin',
    adminUser: locals.adminUser || null,
    body: locals.body || ''
  });
}

function regenerateSession(req) {
  return new Promise((resolve, reject) => {
    req.session.regenerate((error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
}

function saveSession(req) {
  return new Promise((resolve, reject) => {
    req.session.save((error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
}

function createLoginRateLimiter(options = {}) {
  return rateLimit({
    windowMs: options.windowMs || 15 * 60 * 1000,
    limit: options.limit || 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: 'Too many login attempts. Please wait and try again.'
  });
}

function resolveLoginRateLimiter(options = {}) {
  if (options.loginRateLimiter === false) {
    return null;
  }

  if (typeof options.loginRateLimiter === 'function') {
    return options.loginRateLimiter;
  }

  return createLoginRateLimiter(options.loginRateLimit || {});
}

function dashboardBody(adminUser, csrfToken) {
  return `
    <main class="admin-page">
      <section class="admin-card admin-card--wide">
        <p class="admin-kicker">CamerasNYC</p>
        <h1>Admin dashboard</h1>
        <p class="admin-muted">Signed in as <strong>${escapeHtml(adminUser.displayName)}</strong>.</p>
        <form method="post" action="/admin/logout" class="admin-actions">
          <input type="hidden" name="_csrf" value="${escapeHtml(csrfToken)}">
          <button type="submit">Sign out</button>
        </form>
      </section>
    </main>
  `;
}

function createAdminRouter(options = {}) {
  const router = express.Router();
  const adminRepository = options.adminRepository || createAdminRepository(options.db);
  const auditRepository = options.auditRepository || createAuditRepository(options.db);
  const verifyPassword = (options.passwordService && options.passwordService.verifyPassword)
    || passwordHelpers.verifyPassword;
  const loginRateLimiter = resolveLoginRateLimiter(options);
  const requireAdmin = createRequireAdmin(adminRepository);

  router.get('/login', attachCsrfToken, async (req, res, next) => {
    try {
      if (req.session && req.session.adminUserId) {
        res.redirect('/admin');
        return;
      }

      await renderAdminView(req, res, 'admin/login', {
        title: 'Admin Login',
        csrfToken: res.locals.csrfToken,
        email: '',
        error: null
      });
    } catch (error) {
      next(error);
    }
  });

  const loginPostMiddleware = loginRateLimiter
    ? [loginRateLimiter, verifyCsrfToken]
    : [verifyCsrfToken];

  router.post('/login', ...loginPostMiddleware, async (req, res, next) => {
    try {
      const email = stringValue(req.body && req.body.email).trim().toLowerCase();
      const password = stringValue(req.body && req.body.password);
      const admin = await adminRepository.findAdminByEmail(email);
      const passwordHash = admin ? admin.passwordHash : DUMMY_PASSWORD_HASH;
      const passwordMatches = await verifyPassword(password, passwordHash);

      if (!admin || admin.isActive === false || !passwordMatches) {
        await renderAdminView(req, res, 'admin/login', {
          title: 'Admin Login',
          csrfToken: getCsrfToken(req),
          email,
          error: GENERIC_LOGIN_ERROR
        }, 401);
        return;
      }

      await adminRepository.markLastLogin(admin.id);
      await auditRepository.logAuditEvent({
        adminUserId: admin.id,
        action: 'admin.login',
        entityType: 'admin_user',
        entityId: admin.id,
        summary: `${admin.displayName} signed in.`
      });
      await regenerateSession(req);
      try {
        req.session.adminUserId = admin.id;
        await saveSession(req);
      } catch (error) {
        await destroySession(req);
        throw error;
      }
      res.redirect('/admin');
    } catch (error) {
      next(error);
    }
  });

  router.get('/', requireAdmin, attachCsrfToken, (req, res) => {
    renderAdminHtml(res, {
      title: 'Admin Dashboard',
      adminUser: req.adminUser,
      body: dashboardBody(req.adminUser, res.locals.csrfToken)
    });
  });

  router.post('/logout', requireAdmin, verifyCsrfToken, async (req, res, next) => {
    const admin = req.adminUser;

    try {
      await auditRepository.logAuditEvent({
        adminUserId: admin.id,
        action: 'admin.logout',
        entityType: 'admin_user',
        entityId: admin.id,
        summary: `${admin.displayName} signed out.`
      });
      await destroySession(req);
      res.redirect('/admin/login');
    } catch (error) {
      next(error);
    }
  });

  return router;
}

module.exports = {
  GENERIC_LOGIN_ERROR,
  DUMMY_PASSWORD_HASH,
  createLoginRateLimiter,
  createAdminRouter
};
