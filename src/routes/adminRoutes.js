const express = require('express');
const rateLimit = require('express-rate-limit');
const multer = require('multer');
const { createAdminRepository } = require('../repositories/adminRepository');
const { createAuditRepository } = require('../repositories/auditRepository');
const { createContentRepository } = require('../repositories/contentRepository');
const { VALID_LEAD_STATUSES, createLeadRepository } = require('../repositories/leadRepository');
const { createMediaRepository } = require('../repositories/mediaRepository');
const {
  MAX_IMAGE_BYTES,
  MediaValidationError,
  createMediaStorage
} = require('../services/mediaStorage');
const passwordHelpers = require('../services/passwords');
const {
  blockUpdatesFromBody,
  buildDashboardViewModel,
  buildSettingsUpdates,
  itemFormFromItem,
  itemInputFromBody,
  isValidUuid,
  pageFormFromPage,
  pageInputFromBody,
  settingsFormFromSettings,
  validatePageInput
} = require('../services/adminViewModel');
const { createRequireAdmin, destroySession } = require('../middleware/auth');
const { attachCsrfToken, getCsrfToken, verifyCsrfToken } = require('../middleware/csrf');
const { renderPublicPage } = require('./publicRoutes');

const GENERIC_LOGIN_ERROR = 'Email or password is incorrect.';
const DUMMY_PASSWORD_HASH = '$2b$12$0Us3jKrmtMCVUBfxFMewW.0zvjilGGsKpZsS2ftYG0vFFtpUxfzE.';
const LEAD_STATUS_OPTIONS = Array.from(VALID_LEAD_STATUSES);

function stringValue(value) {
  return typeof value === 'string' ? value : String(value || '');
}

function parseLeadStatus(value) {
  const status = stringValue(value).trim();

  if (!status) {
    return {
      ok: true,
      status: null
    };
  }

  if (!VALID_LEAD_STATUSES.has(status)) {
    return {
      ok: false,
      error: 'Choose a valid lead status.'
    };
  }

  return {
    ok: true,
    status
  };
}

function isValidLeadId(value) {
  return isValidUuid(value);
}

function formatLeadDateTime(value) {
  if (!value) {
    return '';
  }

  const date = value instanceof Date ? value : new Date(value);

  if (Number.isNaN(date.getTime())) {
    return String(value);
  }

  return `${date.toISOString().slice(0, 16).replace('T', ' ')} UTC`;
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

function resolveMediaRepository(options = {}) {
  if (options.mediaRepository) {
    return options.mediaRepository;
  }

  if (options.mediaDb) {
    return createMediaRepository(options.mediaDb);
  }

  if (hasExplicitDatabaseUrl()) {
    return createMediaRepository(options.db);
  }

  return null;
}

function resolveMediaStorage(options = {}) {
  if (options.mediaStorage) {
    return options.mediaStorage;
  }

  return createMediaStorage({
    root: options.uploadRoot
  });
}

function ensureContentRepository(contentRepository, res) {
  if (contentRepository) {
    return true;
  }

  res.status(503).send('Content repository is unavailable.');
  return false;
}

function ensureLeadRepository(leadRepository, res) {
  if (leadRepository) {
    return true;
  }

  res.status(503).send('Lead repository is unavailable.');
  return false;
}

function ensureMediaRepository(mediaRepository, res) {
  if (mediaRepository) {
    return true;
  }

  res.status(503).send('Media repository is unavailable.');
  return false;
}

function findBlock(page, blockKey) {
  return (page.blocks || []).find((block) => block.blockKey === blockKey) || null;
}

function encodePathSegment(value) {
  return encodeURIComponent(String(value || ''));
}

function humanLabel(value) {
  const words = stringValue(value)
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!words) {
    return '';
  }

  return words.replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function itemRouteId(item) {
  return item && (item.id || item.itemKey);
}

function pagePublicUrl(page) {
  return page.path || page.canonicalPath || '/';
}

function visualPageSummary(page) {
  return {
    slug: page.slug,
    label: humanLabel(page.slug),
    title: page.title || humanLabel(page.slug),
    path: pagePublicUrl(page),
    isPublished: page.isPublished !== false,
    visualUrl: `/admin/visual/${encodePathSegment(page.slug)}`
  };
}

function buildAdminPreviewLocals(viewModel, pages = []) {
  const pageSlug = viewModel.page.slug;
  const editPageUrl = `/admin/pages/${encodePathSegment(pageSlug)}`;

  return {
    enabled: true,
    pageSlug,
    pageTitle: viewModel.page.title || humanLabel(pageSlug),
    publicUrl: pagePublicUrl(viewModel.page),
    editPageUrl,
    pages: pages.map(visualPageSummary),
    dashboardUrl: '/admin',
    settingsUrl: '/admin/settings',
    mediaUrl: '/admin/media',
    blockEditUrl(blockKey) {
      return `${editPageUrl}#block-${encodePathSegment(blockKey)}`;
    },
    blockLabel(block, fallback = 'section') {
      const label = humanLabel(block && block.blockKey) || humanLabel(fallback) || 'Section';
      return `${label} section`;
    },
    itemEditUrl(blockKey, item) {
      const routeId = itemRouteId(item);

      if (!routeId) {
        return this.blockEditUrl(blockKey);
      }

      return `/admin/pages/${encodePathSegment(pageSlug)}/blocks/${encodePathSegment(blockKey)}/items/${encodePathSegment(routeId)}/edit`;
    },
    itemLabel(item, fallback = 'item') {
      return item && (item.title || humanLabel(item.itemKey)) || humanLabel(fallback) || 'Item';
    },
    newItemUrl(blockKey) {
      return `/admin/pages/${encodePathSegment(pageSlug)}/blocks/${encodePathSegment(blockKey)}/items/new`;
    }
  };
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

async function runLeadTransaction(leadRepository, auditRepository, callback) {
  if (leadRepository && typeof leadRepository.withTransaction === 'function') {
    return leadRepository.withTransaction((transactionLeadRepository, transactionClient) => {
      const transactionAuditRepository = transactionClient
        ? createAuditRepository(transactionClient)
        : auditRepository;

      return callback(transactionLeadRepository, transactionAuditRepository);
    });
  }

  return callback(leadRepository, auditRepository);
}

async function runMediaTransaction(mediaRepository, auditRepository, callback) {
  if (mediaRepository && typeof mediaRepository.withTransaction === 'function') {
    return mediaRepository.withTransaction((transactionMediaRepository, transactionClient) => {
      const transactionAuditRepository = transactionClient
        ? createAuditRepository(transactionClient)
        : auditRepository;

      return callback(transactionMediaRepository, transactionAuditRepository);
    });
  }

  return callback(mediaRepository, auditRepository);
}

class MediaAssetInUseError extends Error {
  constructor(message = 'Media asset is currently assigned and cannot be deleted.') {
    super(message);
    this.name = 'MediaAssetInUseError';
    this.statusCode = 409;
  }
}

async function listMediaAssetsForForm(mediaRepository) {
  if (!mediaRepository || typeof mediaRepository.listMediaAssets !== 'function') {
    return [];
  }

  return mediaRepository.listMediaAssets({ limit: 500 });
}

function createAdminRouter(options = {}) {
  const router = express.Router();
  const adminRepository = options.adminRepository || createAdminRepository(options.db);
  const auditRepository = options.auditRepository || createAuditRepository(options.db);
  const contentRepository = resolveContentRepository(options);
  const leadRepository = resolveLeadRepository(options);
  const mediaRepository = resolveMediaRepository(options);
  const dashboardMediaRepository = mediaRepository || contentRepository;
  const mediaStorage = resolveMediaStorage(options);
  const verifyPassword = (options.passwordService && options.passwordService.verifyPassword)
    || passwordHelpers.verifyPassword;
  const loginRateLimiter = resolveLoginRateLimiter(options);
  const requireAdmin = createRequireAdmin(adminRepository);
  const uploadMedia = multer({
    storage: multer.memoryStorage(),
    limits: {
      fileSize: MAX_IMAGE_BYTES + 1,
      files: 1
    }
  }).single('image');

  function parseMediaUpload(req, res, next) {
    uploadMedia(req, res, (error) => {
      req.mediaUploadError = error || null;
      next();
    });
  }

  async function renderMediaPage(req, res, locals = {}, statusCode = 200) {
    const assets = mediaRepository && typeof mediaRepository.listMediaAssets === 'function'
      ? await mediaRepository.listMediaAssets({ limit: 100 })
      : [];

    await renderAdminView(req, res, 'admin/media', {
      title: 'Media Library',
      csrfToken: res.locals.csrfToken,
      assets,
      uploaded: req.query.uploaded === '1',
      deleted: req.query.deleted === '1',
      error: null,
      ...locals
    }, statusCode);
  }

  async function renderLeadListPage(req, res, locals = {}, statusCode = 200) {
    const filterStatus = locals.filterStatus || null;
    const leads = locals.leads || await leadRepository.listLeads({
      ...(filterStatus ? { status: filterStatus } : {}),
      limit: 100
    });

    await renderAdminView(req, res, 'admin/leads', {
      title: 'Leads',
      csrfToken: res.locals.csrfToken,
      leads,
      leadStatuses: LEAD_STATUS_OPTIONS,
      filterStatus,
      error: null,
      formatLeadDateTime,
      ...locals
    }, statusCode);
  }

  async function renderLeadDetailPage(req, res, lead, locals = {}, statusCode = 200) {
    await renderAdminView(req, res, 'admin/leadDetail', {
      title: `Lead ${lead.name || lead.id}`,
      csrfToken: res.locals.csrfToken,
      lead,
      leadStatuses: LEAD_STATUS_OPTIONS,
      formStatus: lead.status,
      updated: req.query.updated === '1',
      error: null,
      formatLeadDateTime,
      ...locals
    }, statusCode);
  }

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
        mediaRepository: dashboardMediaRepository,
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

  router.get('/visual', async (req, res) => {
    res.redirect('/admin/visual/home');
  });

  router.get('/visual/:slug', async (req, res, next) => {
    try {
      if (!ensureContentRepository(contentRepository, res)) {
        return;
      }

      const pages = typeof contentRepository.listPages === 'function'
        ? await contentRepository.listPages()
        : [];
      const rendered = await renderPublicPage(
        req,
        res,
        req.params.slug,
        { repository: contentRepository },
        (viewModel) => ({
          adminPreview: buildAdminPreviewLocals(viewModel, pages)
        })
      );

      if (!rendered) {
        res.status(404).send('Page not found.');
      }
    } catch (error) {
      next(error);
    }
  });

  router.get('/leads', async (req, res, next) => {
    try {
      if (!ensureLeadRepository(leadRepository, res)) {
        return;
      }

      const parsedStatus = parseLeadStatus(req.query.status);
      if (!parsedStatus.ok) {
        await renderLeadListPage(req, res, {
          leads: [],
          filterStatus: null,
          error: parsedStatus.error
        }, 400);
        return;
      }

      await renderLeadListPage(req, res, {
        filterStatus: parsedStatus.status
      });
    } catch (error) {
      next(error);
    }
  });

  router.get('/leads/:id', async (req, res, next) => {
    try {
      if (!ensureLeadRepository(leadRepository, res)) {
        return;
      }

      if (!isValidLeadId(req.params.id)) {
        res.status(404).send('Lead not found.');
        return;
      }

      const lead = await leadRepository.getLead(req.params.id);
      if (!lead) {
        res.status(404).send('Lead not found.');
        return;
      }

      await renderLeadDetailPage(req, res, lead);
    } catch (error) {
      next(error);
    }
  });

  router.post('/leads/:id/status', verifyCsrfToken, async (req, res, next) => {
    try {
      if (!ensureLeadRepository(leadRepository, res)) {
        return;
      }

      if (!isValidLeadId(req.params.id)) {
        res.status(404).send('Lead not found.');
        return;
      }

      const lead = await leadRepository.getLead(req.params.id);
      if (!lead) {
        res.status(404).send('Lead not found.');
        return;
      }

      const parsedStatus = parseLeadStatus(req.body && req.body.status);
      if (!parsedStatus.ok || !parsedStatus.status) {
        await renderLeadDetailPage(req, res, lead, {
          formStatus: stringValue(req.body && req.body.status),
          error: 'Choose a valid lead status.'
        }, 400);
        return;
      }

      const updatedLead = await runLeadTransaction(leadRepository, auditRepository, async (transactionLeadRepository, transactionAuditRepository) => {
        const updated = await transactionLeadRepository.updateLeadStatus(req.params.id, parsedStatus.status);
        if (!updated) {
          return null;
        }

        await logAudit(transactionAuditRepository, req.adminUser, {
          action: 'admin.lead.status.update',
          entityType: 'lead',
          entityId: updated.id || lead.id || req.params.id,
          summary: `Changed lead ${updated.name || lead.name || updated.id || req.params.id} status from ${lead.status} to ${updated.status}.`
        });

        return updated;
      });

      if (!updatedLead) {
        res.status(404).send('Lead not found.');
        return;
      }

      res.redirect(`/admin/leads/${encodeURIComponent(req.params.id)}?updated=1`);
    } catch (error) {
      next(error);
    }
  });

  router.get('/media', async (req, res, next) => {
    try {
      if (!ensureMediaRepository(mediaRepository, res)) {
        return;
      }

      await renderMediaPage(req, res);
    } catch (error) {
      next(error);
    }
  });

  router.post('/media', parseMediaUpload, verifyCsrfToken, async (req, res, next) => {
    let storedMedia = null;
    let createdAsset = null;

    try {
      if (!ensureMediaRepository(mediaRepository, res)) {
        return;
      }

      if (req.mediaUploadError) {
        const message = req.mediaUploadError.code === 'LIMIT_FILE_SIZE'
          ? 'Uploaded image must be 8MB or smaller.'
          : 'Image upload failed.';
        await renderMediaPage(req, res, { error: message }, 400);
        return;
      }

      storedMedia = await mediaStorage.storeMediaFile(req.file, {
        altText: req.body && req.body.altText,
        caption: req.body && req.body.caption
      });

      await runMediaTransaction(mediaRepository, auditRepository, async (transactionMediaRepository, transactionAuditRepository) => {
        createdAsset = await transactionMediaRepository.createMediaAsset(storedMedia);

        await logAudit(transactionAuditRepository, req.adminUser, {
          action: 'admin.media.create',
          entityType: 'media_asset',
          entityId: createdAsset && createdAsset.id,
          summary: `Uploaded media ${createdAsset ? createdAsset.originalName : storedMedia.originalName}.`
        });
      });

      res.redirect('/admin/media?uploaded=1');
    } catch (error) {
      if (createdAsset && mediaRepository && typeof mediaRepository.deleteMediaAsset === 'function') {
        await mediaRepository.deleteMediaAsset(createdAsset.id).catch(() => {});
      }

      if (storedMedia && mediaStorage && typeof mediaStorage.deleteMediaFile === 'function') {
        await mediaStorage.deleteMediaFile(storedMedia).catch(() => {});
      }

      if (error instanceof MediaValidationError) {
        await renderMediaPage(req, res, { error: error.message }, error.statusCode || 400);
        return;
      }

      next(error);
    }
  });

  router.post('/media/:id/delete', verifyCsrfToken, async (req, res, next) => {
    try {
      if (!ensureMediaRepository(mediaRepository, res)) {
        return;
      }

      if (!isValidUuid(req.params.id)) {
        res.status(404).send('Media asset not found.');
        return;
      }

      const deletedAsset = await runMediaTransaction(mediaRepository, auditRepository, async (transactionMediaRepository, transactionAuditRepository) => {
        const transactionAsset = await transactionMediaRepository.getMediaAsset(req.params.id);
        if (!transactionAsset) {
          return null;
        }

        if (await transactionMediaRepository.isMediaAssetUsed(req.params.id)) {
          throw new MediaAssetInUseError();
        }

        const deleted = await transactionMediaRepository.deleteUnusedMediaAsset(req.params.id);
        if (!deleted) {
          throw new MediaAssetInUseError();
        }

        await logAudit(transactionAuditRepository, req.adminUser, {
          action: 'admin.media.delete',
          entityType: 'media_asset',
          entityId: deleted.id,
          summary: `Deleted media ${deleted.originalName}.`
        });

        return deleted;
      });

      if (!deletedAsset) {
        res.status(404).send('Media asset not found.');
        return;
      }

      if (mediaStorage && typeof mediaStorage.deleteMediaFile === 'function') {
        try {
          await mediaStorage.deleteMediaFile(deletedAsset);
        } catch (error) {
          await renderMediaPage(req, res, {
            error: 'Media metadata was deleted, but the file could not be removed. Please retry file cleanup.'
          }, 500);
          return;
        }
      }

      res.redirect('/admin/media?deleted=1');
    } catch (error) {
      if (error instanceof MediaAssetInUseError) {
        await renderMediaPage(req, res, { error: error.message }, error.statusCode);
        return;
      }

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
        mediaAssets: await listMediaAssetsForForm(mediaRepository),
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
          mediaAssets: await listMediaAssetsForForm(mediaRepository),
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
        mediaAssets: await listMediaAssetsForForm(mediaRepository),
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
          mediaAssets: await listMediaAssetsForForm(mediaRepository),
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
        mediaAssets: await listMediaAssetsForForm(mediaRepository),
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
          mediaAssets: await listMediaAssetsForForm(mediaRepository),
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
