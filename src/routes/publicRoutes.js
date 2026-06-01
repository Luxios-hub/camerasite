const express = require('express');
const { z } = require('zod');
const { createLeadRepository } = require('../repositories/leadRepository');
const { buildPageViewModel } = require('../services/pageViewModel');

const PUBLIC_ROUTE_MAP = new Map([
  ['/', 'home'],
  ['/index.html', 'home'],
  ['/residential', 'residential'],
  ['/residential.html', 'residential'],
  ['/commercial', 'commercial'],
  ['/commercial.html', 'commercial'],
  ['/services', 'services'],
  ['/services.html', 'services'],
  ['/about', 'about'],
  ['/about.html', 'about'],
  ['/contact', 'contact'],
  ['/contact.html', 'contact']
]);

function viewForTemplate(template) {
  if (template === 'home') {
    return 'pages/home';
  }

  if (template === 'contact') {
    return 'pages/contact';
  }

  return 'pages/standard';
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

function stringValue(value) {
  if (typeof value === 'string') {
    return value;
  }

  if (value == null) {
    return '';
  }

  return String(value);
}

function trimmedString(schema) {
  return z.preprocess((value) => stringValue(value).trim(), schema);
}

function optionList(values) {
  return Array.isArray(values)
    ? values.filter((value) => typeof value === 'string' && value.trim().length > 0)
    : [];
}

function createQuoteLeadSchema(formSettings = {}) {
  const propertyTypes = optionList(formSettings.propertyTypes);
  const cameraCounts = optionList(formSettings.cameraCounts);
  const honeypotField = typeof formSettings.honeypotField === 'string' && formSettings.honeypotField.trim().length > 0
    ? formSettings.honeypotField
    : 'bot-field';

  return z.object({
    name: trimmedString(z.string()
      .min(1, 'Name is required.')
      .max(120, 'Name must be 120 characters or fewer.')),
    phone: trimmedString(z.string()
      .min(1, 'Phone is required.')
      .max(40, 'Phone must be 40 characters or fewer.')),
    email: trimmedString(z.string()
      .min(1, 'Email is required.')
      .max(180, 'Email must be 180 characters or fewer.')
      .email('Enter a valid email address.')),
    zip: trimmedString(z.string()
      .regex(/^\d{5}$/, 'Enter a 5-digit ZIP code.')),
    type: trimmedString(z.string()
      .min(1, 'Select a property type.')
      .refine((value) => propertyTypes.includes(value), 'Select a valid property type.')),
    cameras: trimmedString(z.string()
      .max(40, 'Camera count must be 40 characters or fewer.')
      .refine((value) => value === '' || cameraCounts.includes(value), 'Select a valid camera count.')),
    notes: trimmedString(z.string()
      .max(3000, 'Notes must be 3000 characters or fewer.')),
    [honeypotField]: trimmedString(z.literal(''))
      .optional()
  }).passthrough();
}

function quoteFormSettings(viewModel) {
  const quoteForm = viewModel.blocksByKey && viewModel.blocksByKey.quote_form;

  return (quoteForm && quoteForm.settings) || {};
}

function formValues(body = {}) {
  return {
    name: stringValue(body.name),
    phone: stringValue(body.phone),
    email: stringValue(body.email),
    zip: stringValue(body.zip),
    type: stringValue(body.type),
    cameras: stringValue(body.cameras),
    notes: stringValue(body.notes)
  };
}

function validationErrors(error) {
  const errors = {};

  for (const issue of error.issues) {
    const field = issue.path[0];

    if (typeof field === 'string' && !errors[field]) {
      errors[field] = issue.message;
    }
  }

  return errors;
}

function leadInput(parsedData) {
  return {
    name: parsedData.name,
    phone: parsedData.phone,
    email: parsedData.email,
    zip: parsedData.zip,
    property_type: parsedData.type,
    camera_count: parsedData.cameras || null,
    notes: parsedData.notes || null
  };
}

function requestMeta(req) {
  return {
    source_path: req.originalUrl || req.path,
    ip_address: req.ip,
    user_agent: req.get('user-agent') || null
  };
}

function resolveLeadRepository(options = {}) {
  if (options.leadRepository) {
    return options.leadRepository;
  }

  if (options.leadDb) {
    return createLeadRepository(options.leadDb);
  }

  if (process.env.DATABASE_URL) {
    return createLeadRepository(options.db);
  }

  return null;
}

async function renderPublicPage(req, res, slug, options = {}, extraLocals = {}, statusCode = 200) {
  const viewModel = await buildPageViewModel(slug, options.viewModel || options);

  if (!viewModel) {
    return false;
  }

  const locals = {
    ...viewModel,
    ...extraLocals
  };
  const body = await renderView(req.app, viewForTemplate(viewModel.page.template), locals);

  res.status(statusCode).render('layouts/public', {
    ...locals,
    body
  });

  return true;
}

function createPublicRouter(options = {}) {
  const router = express.Router();

  for (const [path, slug] of PUBLIC_ROUTE_MAP.entries()) {
    router.get(path, async (req, res, next) => {
      try {
        const rendered = await renderPublicPage(req, res, slug, options);

        if (!rendered) {
          next();
        }
      } catch (error) {
        next(error);
      }
    });
  }

  router.post('/contact/quote', async (req, res, next) => {
    try {
      const viewModel = await buildPageViewModel('contact', options.viewModel || options);

      if (!viewModel) {
        next();
        return;
      }

      const settings = quoteFormSettings(viewModel);
      const honeypotField = typeof settings.honeypotField === 'string' && settings.honeypotField.trim().length > 0
        ? settings.honeypotField
        : 'bot-field';
      const values = formValues(req.body);

      if (stringValue(req.body && req.body[honeypotField]).trim().length > 0) {
        await renderPublicPage(req, res, 'contact', options, {
          quoteFormState: {
            status: 'success',
            values: {},
            errors: {}
          }
        });
        return;
      }

      const parsed = createQuoteLeadSchema(settings).safeParse(req.body || {});

      if (!parsed.success) {
        await renderPublicPage(req, res, 'contact', options, {
          quoteFormState: {
            status: 'error',
            values,
            errors: validationErrors(parsed.error)
          }
        });
        return;
      }

      const leadRepository = resolveLeadRepository(options);

      if (!leadRepository) {
        await renderPublicPage(req, res, 'contact', options, {
          quoteFormState: {
            status: 'error',
            values,
            errors: {},
            generalError: 'Quote requests are temporarily unavailable. Please call or WhatsApp us directly.'
          }
        }, 503);
        return;
      }

      await leadRepository.createLead(leadInput(parsed.data), requestMeta(req));
      await renderPublicPage(req, res, 'contact', options, {
        quoteFormState: {
          status: 'success',
          values: {},
          errors: {}
        }
      });
    } catch (error) {
      next(error);
    }
  });

  return router;
}

module.exports = {
  PUBLIC_ROUTE_MAP,
  createPublicRouter,
  createQuoteLeadSchema
};
