const fs = require('fs/promises');
const os = require('os');
const path = require('path');
const test = require('node:test');
const assert = require('node:assert/strict');
const { once } = require('node:events');

const { assertRuntimeConfiguration, createApp } = require('../src/server');
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

function getSetCookieValues(response) {
  if (typeof response.headers.getSetCookie === 'function') {
    return response.headers.getSetCookie();
  }

  const single = response.headers.get('set-cookie');
  return single ? [single] : [];
}

function findCookieValue(response, cookieName) {
  const prefix = `${cookieName}=`;
  const match = getSetCookieValues(response)
    .map((value) => String(value || '').split(';')[0])
    .find((value) => value.startsWith(prefix));

  return match || '';
}

async function performMockLogin(baseUrl, profile) {
  const authStart = await fetch(`${baseUrl}/auth/google?next=/formbuilder`, {
    redirect: 'manual'
  });

  assert.equal(authStart.status, 302);
  const oauthFlowCookie = findCookieValue(authStart, 'fb_oauth_flow');
  assert.ok(oauthFlowCookie);

  const redirectUrl = new URL(authStart.headers.get('location'));
  const state = redirectUrl.searchParams.get('state');
  assert.ok(state);

  process.env.GOOGLE_OAUTH_MOCK_PROFILE_JSON = JSON.stringify(profile);

  const callback = await fetch(`${baseUrl}/auth/google/callback?state=${encodeURIComponent(state)}&code=test-auth-code`, {
    redirect: 'manual',
    headers: {
      Cookie: oauthFlowCookie
    }
  });

  assert.equal(callback.status, 302);
  assert.equal(callback.headers.get('location'), '/formbuilder');

  const sessionCookie = findCookieValue(callback, 'fb_session');
  assert.ok(sessionCookie);

  return sessionCookie;
}

test('public beta auth and tenancy flows', { concurrency: false }, async (t) => {
  const originalEnv = {
    NODE_ENV: process.env.NODE_ENV,
    GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET,
    GOOGLE_OAUTH_REDIRECT_URI: process.env.GOOGLE_OAUTH_REDIRECT_URI,
    GOOGLE_OAUTH_MOCK_PROFILE_JSON: process.env.GOOGLE_OAUTH_MOCK_PROFILE_JSON,
    APP_SESSION_SECRET: process.env.APP_SESSION_SECRET,
    TEMPLATE_LIBRARY_ROOT: process.env.TEMPLATE_LIBRARY_ROOT,
    TEMPLATE_BLOB_ROOT: process.env.TEMPLATE_BLOB_ROOT,
    DATABASE_URL: process.env.DATABASE_URL,
    GCS_TEMPLATE_BUCKET: process.env.GCS_TEMPLATE_BUCKET
  };

  const rootDir = await makeTempDir('public-beta-launch');

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

  delete process.env.NODE_ENV;
  delete process.env.DATABASE_URL;
  delete process.env.GCS_TEMPLATE_BUCKET;
  process.env.GOOGLE_CLIENT_ID = 'public-beta-client-id';
  process.env.GOOGLE_CLIENT_SECRET = 'public-beta-client-secret';
  process.env.GOOGLE_OAUTH_REDIRECT_URI = 'http://localhost/auth/google/callback';
  process.env.APP_SESSION_SECRET = 'public-beta-session-secret';
  process.env.TEMPLATE_LIBRARY_ROOT = path.join(rootDir, 'library');
  process.env.TEMPLATE_BLOB_ROOT = path.join(rootDir, 'blobs');
  resetTemplateLibraryService();

  await withServer(async (baseUrl) => {
    const cookieA = await performMockLogin(baseUrl, {
      sub: 'alpha-user',
      email: 'alpha@example.com',
      email_verified: true,
      name: 'Alpha User'
    });

    const overviewA = await fetch(`${baseUrl}/api/stats/overview`, {
      headers: {
        Cookie: cookieA
      }
    });
    const overviewPayloadA = await overviewA.json();

    assert.equal(overviewA.status, 200);
    assert.equal(overviewPayloadA.builderId, 'google_alpha-user');

    const saved = await fetch(`${baseUrl}/api/templates`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: cookieA
      },
      body: JSON.stringify({
        name: 'Alpha Template',
        json: {
          components: [
            {
              type: 'textfield',
              key: 'alphaField',
              label: 'Alpha Field',
              input: true
            }
          ]
        },
        telemetry: {
          manualAddsByType: { textfield: 1 },
          manualEdits: 1,
          sessionElapsedMs: 1200
        }
      })
    });
    const savedPayload = await saved.json();

    assert.equal(saved.status, 201);
    assert.ok(savedPayload.templateId);

    const cookieB = await performMockLogin(baseUrl, {
      sub: 'bravo-user',
      email: 'bravo@example.com',
      email_verified: true,
      name: 'Bravo User'
    });

    const listB = await fetch(`${baseUrl}/api/templates`, {
      headers: {
        Cookie: cookieB
      }
    });
    const listPayloadB = await listB.json();

    assert.equal(listB.status, 200);
    assert.equal(Array.isArray(listPayloadB.items), true);
    assert.equal(listPayloadB.items.length, 0);

    const fetchByIdB = await fetch(`${baseUrl}/api/templates/${encodeURIComponent(savedPayload.templateId)}`, {
      headers: {
        Cookie: cookieB
      }
    });
    const fetchByIdPayloadB = await fetchByIdB.json();

    assert.equal(fetchByIdB.status, 404);
    assert.equal(fetchByIdPayloadB.error, 'Saved template not found.');

    const fetchByIdA = await fetch(`${baseUrl}/api/templates/${encodeURIComponent(savedPayload.templateId)}`, {
      headers: {
        Cookie: cookieA
      }
    });

    assert.equal(fetchByIdA.status, 200);
  });
});

test('disabled ingestion routes return 410 in the public beta', { concurrency: false }, async (t) => {
  const originalEnv = {
    GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET,
    GOOGLE_OAUTH_REDIRECT_URI: process.env.GOOGLE_OAUTH_REDIRECT_URI,
    ENABLE_FILE_UPLOADS: process.env.ENABLE_FILE_UPLOADS,
    ENABLE_IMAGE_EXTRACTION: process.env.ENABLE_IMAGE_EXTRACTION,
    ENABLE_AI_DICTATION: process.env.ENABLE_AI_DICTATION
  };

  t.after(() => {
    Object.entries(originalEnv).forEach(([key, value]) => {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    });
    resetTemplateLibraryService();
  });

  delete process.env.GOOGLE_CLIENT_ID;
  delete process.env.GOOGLE_CLIENT_SECRET;
  delete process.env.GOOGLE_OAUTH_REDIRECT_URI;
  process.env.ENABLE_FILE_UPLOADS = '0';
  process.env.ENABLE_IMAGE_EXTRACTION = '0';
  process.env.ENABLE_AI_DICTATION = '0';
  resetTemplateLibraryService();

  await withServer(async (baseUrl) => {
    const [upload, optionsFromImage, dictate] = await Promise.all([
      fetch(`${baseUrl}/api/ai/upload`, { method: 'POST' }),
      fetch(`${baseUrl}/api/ai/options-from-image`, { method: 'POST' }),
      fetch(`${baseUrl}/api/ai/dictate`, { method: 'POST' })
    ]);

    assert.equal(upload.status, 410);
    assert.equal(optionsFromImage.status, 410);
    assert.equal(dictate.status, 410);
  });
});

test('production boot fails when required configuration is missing', () => {
  const originalNodeEnv = process.env.NODE_ENV;
  const originalDatabaseUrl = process.env.DATABASE_URL;
  const originalBucket = process.env.GCS_TEMPLATE_BUCKET;
  const originalClientId = process.env.GOOGLE_CLIENT_ID;
  const originalClientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const originalRedirectUri = process.env.GOOGLE_OAUTH_REDIRECT_URI;
  const originalSessionSecret = process.env.APP_SESSION_SECRET;

  process.env.NODE_ENV = 'production';
  delete process.env.DATABASE_URL;
  delete process.env.GCS_TEMPLATE_BUCKET;
  delete process.env.GOOGLE_CLIENT_ID;
  delete process.env.GOOGLE_CLIENT_SECRET;
  delete process.env.GOOGLE_OAUTH_REDIRECT_URI;
  delete process.env.APP_SESSION_SECRET;

  try {
    assert.throws(
      () => assertRuntimeConfiguration(),
      /DATABASE_URL, GCS_TEMPLATE_BUCKET, GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_OAUTH_REDIRECT_URI, APP_SESSION_SECRET/
    );
  } finally {
    if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = originalNodeEnv;

    if (originalDatabaseUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = originalDatabaseUrl;

    if (originalBucket === undefined) delete process.env.GCS_TEMPLATE_BUCKET;
    else process.env.GCS_TEMPLATE_BUCKET = originalBucket;

    if (originalClientId === undefined) delete process.env.GOOGLE_CLIENT_ID;
    else process.env.GOOGLE_CLIENT_ID = originalClientId;

    if (originalClientSecret === undefined) delete process.env.GOOGLE_CLIENT_SECRET;
    else process.env.GOOGLE_CLIENT_SECRET = originalClientSecret;

    if (originalRedirectUri === undefined) delete process.env.GOOGLE_OAUTH_REDIRECT_URI;
    else process.env.GOOGLE_OAUTH_REDIRECT_URI = originalRedirectUri;

    if (originalSessionSecret === undefined) delete process.env.APP_SESSION_SECRET;
    else process.env.APP_SESSION_SECRET = originalSessionSecret;
  }
});
