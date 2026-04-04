// src/server.js
// ────────────────────────────────────────────────────────────
require('dotenv').config();
const compression = require('compression');
const express = require('express');
const path = require('path');

const { validateRuntimeConfiguration } = require('./config/runtimeConfig');
const { getTemplateLibraryService } = require('./utils/templateLibrary');
const {
  attachRequestContext,
  buildSecurityHeaders,
  configureTrustProxy,
  createAiRateLimiter,
  createApiRateLimiter,
  requireApiAuth,
  requirePageAuth
} = require('./security/requestSecurity');

function assertRuntimeConfiguration(env = process.env) {
  const missing = validateRuntimeConfiguration(env);
  if (!missing.length) return;

  throw new Error(
    `Missing required production configuration: ${missing.join(', ')}`
  );
}

function createApp() {
  assertRuntimeConfiguration();
  const app = express();
  const requestBodyLimit = process.env.REQUEST_BODY_LIMIT || '10mb';
  const apiRateLimiter = createApiRateLimiter();
  const aiRateLimiter = createAiRateLimiter();

  configureTrustProxy(app);
  app.use(buildSecurityHeaders);
  app.use(attachRequestContext);
  app.use(compression());

  /* ───────────── 1 ▸  STATIC ASSETS  ───────────── */
  app.use(express.static(path.join(__dirname, '../public')));

  /* ───────────── 2 ▸  BODY PARSERS  ───────────── */
  app.use(express.json({ limit: requestBodyLimit }));
  app.use(express.urlencoded({ extended: true, limit: requestBodyLimit }));

  app.use('/', require('./routes/auth'));
  app.use(['/design-system', '/formbuilder', '/stats', '/guide'], requirePageAuth);
  app.use('/api', apiRateLimiter, requireApiAuth);
  app.use('/api/ai', aiRateLimiter);

  /* ───────────── 3 ▸  ROUTES  ─────────────
     ‣ formBuilder      ─ general builder pages & helpers
     ‣ guide            ─ builder setup and component guide
     ‣ aiUpload         ─ disabled public-beta upload surface
     ‣ ai               ─ POST /api/ai/generate (prompt → JSON components)
     ‣ aiDictate        ─ disabled public-beta dictation surface              */
  app.use('/', require('./routes/formBuilder'));
  app.use('/', require('./routes/guide'));
  app.use('/', require('./routes/aiUpload'));
  app.use('/', require('./routes/ai'));
  app.use('/', require('./routes/aiDictate'));
  app.use('/', require('./routes/aiPatch'));
  app.use('/', require('./routes/aiTranslate'));
  app.use('/', require('./routes/stats'));

  app.use((err, req, res, next) => {
    if (err?.code && String(err.code).startsWith('LIMIT_')) {
      const status = err.code === 'LIMIT_FILE_SIZE' ? 413 : 400;
      const message = err.code === 'LIMIT_FILE_SIZE'
        ? 'Uploaded file exceeds the configured size limit.'
        : (err.message || 'Upload rejected.');

      if (req.path.startsWith('/api/')) {
        return res.status(status).json({ error: message });
      }
      return res.status(status).send(message);
    }

    if (err?.type === 'entity.too.large') {
      const message = `Request body exceeds the ${requestBodyLimit} limit.`;
      if (req.path.startsWith('/api/')) {
        return res.status(413).json({ error: message });
      }
      return res.status(413).send(message);
    }

    return next(err);
  });

  return app;
}

const app = createApp();

/* ───────────── 4 ▸  START SERVER  ───────────── */
const HOST = '0.0.0.0';
const DEFAULT_PORT = 3000;
const hasExplicitPort = Object.prototype.hasOwnProperty.call(process.env, 'PORT');

function parsePort(value) {
  const port = Number.parseInt(value, 10);
  return Number.isInteger(port) && port > 0 && port <= 65535 ? port : null;
}

function listen(port, serverApp = app) {
  const server = serverApp.listen(port, HOST);

  server.once('listening', () => {
    const address = server.address();
    const activePort = typeof address === 'object' && address ? address.port : port;
    console.log(`🟢  Form builder listening on http://localhost:${activePort}`);
    getTemplateLibraryService().ensureReady().catch((err) => {
      console.error('[template-library] initialization failed:', err?.stack || err?.message || err);
    });
  });

  server.once('error', err => {
    if (err.code === 'EADDRINUSE' && !hasExplicitPort) {
      console.warn(`Port ${port} is in use, trying ${port + 1} instead.`);
      return listen(port + 1);
    }

    if (err.code === 'EADDRINUSE') {
      console.error(`Port ${port} is already in use. Set PORT to a free port and retry.`);
    } else {
      console.error('Failed to start server:', err);
    }
    process.exit(1);
  });

  return server;
}

if (require.main === module) {
  const configuredPort = hasExplicitPort ? parsePort(process.env.PORT) : DEFAULT_PORT;

  if (hasExplicitPort && configuredPort === null) {
    console.error(`Invalid PORT value "${process.env.PORT}". Use an integer between 1 and 65535.`);
    process.exit(1);
  }

  listen(configuredPort);
}

module.exports = {
  assertRuntimeConfiguration,
  app,
  createApp,
  listen,
  parsePort
};
