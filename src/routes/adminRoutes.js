const express = require('express');
const rateLimit = require('express-rate-limit');
const { createAdminRepository } = require('../repositories/adminRepository');
const { createAuditRepository } = require('../repositories/auditRepository');
const { createContentRepository } = require('../repositories/contentRepository');
const { createLeadRepository } = require('../repositories/leadRepository');
const passwordHelpers = require('../services/passwords');
const {
  blockUpdatesFromBody,
  buildDashboardViewModel,
  buildSettingsUpdates,
  itemFormFromItem,
  itemInputFromBody,
  pageFormFromPage,
  pageInputFromBody,
  settingsFormFromSettings,
  validatePageInput
} = require('../services/adminViewModel');
const { createRequireAdmin, destroySession } = require('../middleware/auth');
const { attachCsrfToken, getCsrfToken, verifyCsrfToken } = require('../middleware/csrf');

const GENERIC_LOGIN_ERROR = 'Email or password is incorrect.';
const DUMMY_PASSWORD_HASH = '$2b$12$0Us3jKrmtMCVUBfxFMewW.0zvjilGGsKpZsS2ftYG0vFFtpUxfzE.';

function stringValue(value) {
  return typeof value === 'string' ? value : String(value || '');
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
  const viewLocals = {
    adminUser: req.adminUser || locals.adminUser || null,
    ...locals
  };
  const body = await renderView(req.app, view, viewLocals);

  res.status(statusCode).render('layouts/admin', {
    title: locals.title || 'Admin',
    adminUser: req.adminUser || locals.adminUser || null,
    body
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

function hasExplicitDatabaseUrl() {
  return Boolean(process.env.DATABASE_URL);
}

function resolveContentRepository(options = {}) {
  if (options.contentRepository) {
    return options.contentRepository;
  }

  if (options.contentDb) {
    return createContentRepository(options.contentDb);
  }

  if (hasExplicitDatabaseUrl()) {
    return createContentRepository(options.db);
  }

  return null;
}

function resolveLeadRepository(options = {}) {
  if (options.leadRepository) {
    return options.leadRepository;
  }

  if (options.leadDb) {
    return createLeadRepository(options.leadDb);
  }

  if (hasExplicitDatabaseUrl()) {
    return createLeadRepository(options.db);
  }

  return null;
}

function ensureContentRepository(contentRepository, res) {
  if (contentRepository) {
    return true;
  }

  res.status(503).send('Content repository is unavailable.');
  return false;
}

function findBlock(page, blockKey) {
  return (page.blocks || []).find((block) => block.blockKey === blockKey) || null;
}

async function logAudit(auditRepository, admin, event) {
  await auditRepository.logAuditEvent({
    adminUserId: admin && admin.id,
    ...event
  });
}

async function runContentTransaction(contentRepository, auditRepository, callback) {
  if (contentRepository && typeof contentRepository.withTransaction === 'function') {
    return contentRepository.withTransaction((transactionContentRepository, transactionClient) => {
      const transactionAuditRepository = transactionClient
        ? createAuditRepository(transactionClient)
        : auditRepository;

      return callback(transactionContentRepository, transactionAuditRepository);
    });
  }

  return callback(contentRepository, auditRepository);
}

function createAdminRouter(options = {}) {
  const router = express.Router();
  const adminRepository = options.adminRepository || createAdminRepository(options.db);
  const auditRepository = options.auditRepository || createAuditRepository(options.db);
  const contentRepository = resolveContentRepository(options);
  const leadRepository = resolveLeadRepository(options);
  const mediaRepository = options.mediaRepository || contentRepository;
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

  router.use(requireAdmin, attachCsrfToken);

  router.get('/', async (req, res, next) => {
    try {
      const dashboard = await buildDashboardViewModel({
        contentRepository,
        leadRepository,
        mediaRepository,
        auditRepository
      });

      await renderAdminView(req, res, 'admin/dashboard', {
        title: 'Admin Dashboard',
        csrfToken: res.locals.csrfToken,
        dashboard
      });
    } catch (error) {
      next(error);
    }
  });

  router.get('/settings', async (req, res, next) => {
    try {
      if (!ensureContentRepository(contentRepository, res)) {
        return;
      }

      const settings = await contentRepository.getSiteSettings();
      await renderAdminView(req, res, 'admin/settings', {
        title: 'Settings',
        csrfToken: res.locals.csrfToken,
        form: settingsFormFromSettings(settings),
        saved: req.query.saved === '1',
        error: null
      });
    } catch (error) {
      next(error);
    }
  });

  router.post('/settings', verifyCsrfToken, async (req, res, next) => {
    try {
      if (!ensureContentRepository(contentRepository, res)) {
        return;
      }

      await runContentTransaction(contentRepository, auditRepository, async (transactionContentRepository, transactionAuditRepository) => {
        const settings = await transactionContentRepository.getSiteSettings();
        const updates = buildSettingsUpdates(settings, req.body);

        for (const [key, value] of Object.entries(updates)) {
          await transactionContentRepository.upsertSiteSetting(key, value);
        }

        await logAudit(transactionAuditRepository, req.adminUser, {
          action: 'admin.settings.update',
          entityType: 'site_settings',
          entityId: 'site_settings',
          summary: 'Updated site settings.'
        });
      });

      res.redirect('/admin/settings?saved=1');
    } catch (error) {
      next(error);
    }
  });

  router.get('/pages', async (req, res, next) => {
    try {
      if (!ensureContentRepository(contentRepository, res)) {
        return;
      }

      const pages = await contentRepository.listPages();
      await renderAdminView(req, res, 'admin/pages', {
        title: 'Pages',
        csrfToken: res.locals.csrfToken,
        pages
      });
    } catch (error) {
      next(error);
    }
  });

  router.get('/pages/:slug', async (req, res, next) => {
    try {
      if (!ensureContentRepository(contentRepository, res)) {
        return;
      }

      const page = await contentRepository.getPageWithBlocks(req.params.slug);
      if (!page) {
        res.status(404).send('Page not found.');
        return;
      }

      await renderAdminView(req, res, 'admin/pageEdit', {
        title: `Edit ${page.title}`,
        csrfToken: res.locals.csrfToken,
        page,
        form: pageFormFromPage(page),
        saved: req.query.saved === '1',
        error: null
      });
    } catch (error) {
      next(error);
    }
  });

  router.post('/pages/:slug', verifyCsrfToken, async (req, res, next) => {
    try {
      if (!ensureContentRepository(contentRepository, res)) {
        return;
      }

      const page = await contentRepository.getPageWithBlocks(req.params.slug);
      if (!page) {
        res.status(404).send('Page not found.');
        return;
      }

      const pageValidation = validatePageInput(pageInputFromBody(req.body));
      if (!pageValidation.ok) {
        await renderAdminView(req, res, 'admin/pageEdit', {
          title: `Edit ${page.title}`,
          csrfToken: res.locals.csrfToken,
          page,
          form: pageValidation.form,
          saved: false,
          error: pageValidation.error
        }, 400);
        return;
      }

      const pageInput = pageValidation.input;
      await runContentTransaction(contentRepository, auditRepository, async (transactionContentRepository, transactionAuditRepository) => {
        await transactionContentRepository.updatePage(req.params.slug, pageInput);

        for (const update of blockUpdatesFromBody(page, req.body, pageInput)) {
          await transactionContentRepository.updateBlock(req.params.slug, update.blockKey, update.input);
        }

        await logAudit(transactionAuditRepository, req.adminUser, {
          action: 'admin.page.update',
          entityType: 'page',
          entityId: req.params.slug,
          summary: `Updated page ${req.params.slug}.`
        });
      });

      res.redirect(`/admin/pages/${encodeURIComponent(req.params.slug)}?saved=1`);
    } catch (error) {
      next(error);
    }
  });

  router.get('/pages/:slug/blocks/:blockKey/items/new', async (req, res, next) => {
    try {
      if (!ensureContentRepository(contentRepository, res)) {
        return;
      }

      const page = await contentRepository.getPageWithBlocks(req.params.slug);
      const block = page ? findBlock(page, req.params.blockKey) : null;
      if (!page || !block) {
        res.status(404).send('Block not found.');
        return;
      }

      await renderAdminView(req, res, 'admin/itemEdit', {
        title: `New item for ${block.blockKey}`,
        csrfToken: res.locals.csrfToken,
        page,
        block,
        item: null,
        form: itemFormFromItem({ sortOrder: (block.items || []).length * 10 + 10 }),
        mode: 'new',
        error: null
      });
    } catch (error) {
      next(error);
    }
  });

  router.post('/pages/:slug/blocks/:blockKey/items', verifyCsrfToken, async (req, res, next) => {
    try {
      if (!ensureContentRepository(contentRepository, res)) {
        return;
      }

      const page = await contentRepository.getPageWithBlocks(req.params.slug);
      const block = page ? findBlock(page, req.params.blockKey) : null;
      if (!page || !block) {
        res.status(404).send('Block not found.');
        return;
      }

      const parsed = itemInputFromBody(req.body);
      if (!parsed.ok) {
        await renderAdminView(req, res, 'admin/itemEdit', {
          title: `New item for ${block.blockKey}`,
          csrfToken: res.locals.csrfToken,
          page,
          block,
          item: null,
          form: parsed.form,
          mode: 'new',
          error: parsed.error
        }, 400);
        return;
      }

      await runContentTransaction(contentRepository, auditRepository, async (transactionContentRepository, transactionAuditRepository) => {
        const created = await transactionContentRepository.createBlockItem(req.params.slug, req.params.blockKey, parsed.input);

        await logAudit(transactionAuditRepository, req.adminUser, {
          action: 'admin.item.create',
          entityType: 'content_item',
          entityId: created && (created.id || created.itemKey),
          summary: `Created item on ${req.params.slug}/${req.params.blockKey}.`
        });

        return created;
      });

      res.redirect(`/admin/pages/${encodeURIComponent(req.params.slug)}?saved=1`);
    } catch (error) {
      next(error);
    }
  });

  router.get('/pages/:slug/blocks/:blockKey/items/:itemId/edit', async (req, res, next) => {
    try {
      if (!ensureContentRepository(contentRepository, res)) {
        return;
      }

      const page = await contentRepository.getPageWithBlocks(req.params.slug);
      const block = page ? findBlock(page, req.params.blockKey) : null;
      const item = block && typeof contentRepository.getBlockItem === 'function'
        ? await contentRepository.getBlockItem(req.params.slug, req.params.blockKey, req.params.itemId)
        : null;

      if (!page || !block || !item) {
        res.status(404).send('Item not found.');
        return;
      }

      await renderAdminView(req, res, 'admin/itemEdit', {
        title: `Edit ${item.title || 'item'}`,
        csrfToken: res.locals.csrfToken,
        page,
        block,
        item,
        form: itemFormFromItem(item),
        mode: 'edit',
        error: null
      });
    } catch (error) {
      next(error);
    }
  });

  router.post('/pages/:slug/blocks/:blockKey/items/:itemId', verifyCsrfToken, async (req, res, next) => {
    try {
      if (!ensureContentRepository(contentRepository, res)) {
        return;
      }

      const page = await contentRepository.getPageWithBlocks(req.params.slug);
      const block = page ? findBlock(page, req.params.blockKey) : null;
      const item = block && typeof contentRepository.getBlockItem === 'function'
        ? await contentRepository.getBlockItem(req.params.slug, req.params.blockKey, req.params.itemId)
        : null;

      if (!page || !block || !item) {
        res.status(404).send('Item not found.');
        return;
      }

      const parsed = itemInputFromBody(req.body);
      if (!parsed.ok) {
        await renderAdminView(req, res, 'admin/itemEdit', {
          title: `Edit ${item.title || 'item'}`,
          csrfToken: res.locals.csrfToken,
          page,
          block,
          item,
          form: parsed.form,
          mode: 'edit',
          error: parsed.error
        }, 400);
        return;
      }

      await runContentTransaction(contentRepository, auditRepository, async (transactionContentRepository, transactionAuditRepository) => {
        const updated = await transactionContentRepository.updateBlockItem(
          req.params.slug,
          req.params.blockKey,
          req.params.itemId,
          parsed.input
        );

        await logAudit(transactionAuditRepository, req.adminUser, {
          action: 'admin.item.update',
          entityType: 'content_item',
          entityId: updated && (updated.id || updated.itemKey || req.params.itemId),
          summary: `Updated item ${req.params.itemId}.`
        });
      });

      res.redirect(`/admin/pages/${encodeURIComponent(req.params.slug)}?saved=1`);
    } catch (error) {
      next(error);
    }
  });

  router.post('/pages/:slug/blocks/:blockKey/items/:itemId/delete', verifyCsrfToken, async (req, res, next) => {
    try {
      if (!ensureContentRepository(contentRepository, res)) {
        return;
      }

      await runContentTransaction(contentRepository, auditRepository, async (transactionContentRepository, transactionAuditRepository) => {
        const item = await transactionContentRepository.disableBlockItem(req.params.slug, req.params.blockKey, req.params.itemId);

        await logAudit(transactionAuditRepository, req.adminUser, {
          action: 'admin.item.delete',
          entityType: 'content_item',
          entityId: item && (item.id || item.itemKey || req.params.itemId),
          summary: `Soft-disabled item ${req.params.itemId}.`
        });
      });

      res.redirect(`/admin/pages/${encodeURIComponent(req.params.slug)}?saved=1`);
    } catch (error) {
      next(error);
    }
  });

  router.post('/logout', verifyCsrfToken, async (req, res, next) => {
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
