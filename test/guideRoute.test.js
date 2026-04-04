const fs = require('fs/promises');
const os = require('os');
const path = require('path');
const test = require('node:test');
const assert = require('node:assert/strict');
const { once } = require('node:events');

const { createApp } = require('../src/server');
const { resetTemplateLibraryService } = require('../src/utils/templateLibrary');

async function makeTempDir(prefix) {
  return fs.mkdtemp(path.join(os.tmpdir(), `${prefix}-`));
}

async function withServer(handler) {
  const app = createApp();
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');

  try {
    const address = server.address();
    const baseUrl = `http://127.0.0.1:${address.port}`;
    await handler(baseUrl);
  } finally {
    await new Promise((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
  }
}

test('guide route auth smoke tests', { concurrency: false }, async (t) => {
  const originalEnv = {
    GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET,
    GOOGLE_OAUTH_REDIRECT_URI: process.env.GOOGLE_OAUTH_REDIRECT_URI,
    APP_SESSION_SECRET: process.env.APP_SESSION_SECRET,
    TEMPLATE_LIBRARY_ROOT: process.env.TEMPLATE_LIBRARY_ROOT,
    TEMPLATE_BLOB_ROOT: process.env.TEMPLATE_BLOB_ROOT
  };

  const rootDir = await makeTempDir('guide-route-auth');

  t.after(async () => {
    Object.entries(originalEnv).forEach(([key, value]) => {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    });
    resetTemplateLibraryService();
    await fs.rm(rootDir, { recursive: true, force: true });
  });

  await t.test('returns 200 with the local dev auth bypass', async () => {
    delete process.env.GOOGLE_CLIENT_ID;
    delete process.env.GOOGLE_CLIENT_SECRET;
    delete process.env.GOOGLE_OAUTH_REDIRECT_URI;
    delete process.env.APP_SESSION_SECRET;
    process.env.TEMPLATE_LIBRARY_ROOT = path.join(rootDir, 'dev-root');
    process.env.TEMPLATE_BLOB_ROOT = path.join(rootDir, 'dev-blobs');
    resetTemplateLibraryService();

    await withServer(async (baseUrl) => {
      const response = await fetch(`${baseUrl}/guide`, { redirect: 'manual' });
      const body = await response.text();

      assert.equal(response.status, 200);
      assert.match(body, /Builder User Guide/);
      assert.match(body, /H&amp;S Practice Pack/);
      assert.match(body, /Download PDF/);
      assert.match(body, /Jump To A Component/);
      assert.match(body, /12-second slow loops/);
    });
  });

  await t.test('redirects to Google auth when OAuth is configured', async () => {
    process.env.GOOGLE_CLIENT_ID = 'test-client-id';
    process.env.GOOGLE_CLIENT_SECRET = 'test-client-secret';
    process.env.GOOGLE_OAUTH_REDIRECT_URI = 'http://localhost/auth/google/callback';
    process.env.APP_SESSION_SECRET = 'guide-route-secret';
    process.env.TEMPLATE_LIBRARY_ROOT = path.join(rootDir, 'oauth-root');
    process.env.TEMPLATE_BLOB_ROOT = path.join(rootDir, 'oauth-blobs');
    resetTemplateLibraryService();

    await withServer(async (baseUrl) => {
      const response = await fetch(`${baseUrl}/guide`, { redirect: 'manual' });

      assert.equal(response.status, 302);
      assert.match(
        response.headers.get('location') || '',
        /^\/auth\/google\?next=%2Fguide/
      );
    });
  });
});
