const path = require('node:path');
const express = require('express');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const { env } = require('./config/env');
const { createPublicRouter } = require('./routes/publicRoutes');

function resolveFromRoot(...segments) {
  return path.join(__dirname, '..', ...segments);
}

function resolveUploadRoot() {
  if (path.isAbsolute(env.UPLOAD_ROOT)) {
    return env.UPLOAD_ROOT;
  }

  return resolveFromRoot(env.UPLOAD_ROOT);
}

function createApp() {
  const app = express();

  app.disable('x-powered-by');
  app.use(helmet());
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

  app.get('/healthz', (req, res) => {
    res.json({ ok: true });
  });

  app.use(createPublicRouter());

  return app;
}

module.exports = {
  createApp
};
