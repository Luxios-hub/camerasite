const express = require('express');
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

function createPublicRouter(options = {}) {
  const router = express.Router();

  for (const [path, slug] of PUBLIC_ROUTE_MAP.entries()) {
    router.get(path, async (req, res, next) => {
      try {
        const viewModel = await buildPageViewModel(slug, options.viewModel || options);

        if (!viewModel) {
          next();
          return;
        }

        const body = await renderView(req.app, viewForTemplate(viewModel.page.template), viewModel);

        res.render('layouts/public', {
          ...viewModel,
          body
        });
      } catch (error) {
        next(error);
      }
    });
  }

  return router;
}

module.exports = {
  PUBLIC_ROUTE_MAP,
  createPublicRouter
};
