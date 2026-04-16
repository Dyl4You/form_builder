const fs = require('fs/promises');
const os = require('os');
const path = require('path');
const test = require('node:test');
const assert = require('node:assert/strict');
const { once } = require('node:events');

const { createApp } = require('../src/server');
const { resetTemplateLibraryService } = require('../src/utils/templateLibrary');
const {
  buildCorfixTemplateBody,
  publishTemplateToCorfix
} = require('../src/utils/corfixPublisher');

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

test('buildCorfixTemplateBody wraps builder components in the Corfix root grouping', () => {
  const body = buildCorfixTemplateBody({
    title: 'Inspection Form',
    groupIds: ['group-1', 'group-2', 'group-1', ' '],
    schema: {
      components: [
        {
          type: 'textfield',
          key: 'workerName',
          label: 'Worker Name',
          input: true
        }
      ]
    }
  });

  assert.equal(Array.isArray(body), true);
  assert.equal(body[0].title, 'Inspection Form');
  assert.deepEqual(body[0].groupIds, ['group-1', 'group-2']);
  assert.equal(body[0].questions.components.length, 1);
  assert.equal(body[0].questions.components[0].type, 'fieldset');
  assert.equal(body[0].questions.components[0].key, 'fieldSet1');
  assert.equal(body[0].questions.components[0].components[0].key, 'html11');
  assert.equal(body[0].questions.components[0].components[0].type, 'htmlelement');
  assert.match(body[0].questions.components[0].components[0].content, /CUSTOM GROUPING COMPONENT STYLING/);
  assert.equal(body[0].questions.components[0].components[1].key, 'workerName');
  assert.equal(body[0].questions.components[0].components.at(-1).key, 'actionsGroup');
  assert.equal(body[0].questions.components[0].components.at(-1).type, 'fieldset');
});

test('buildCorfixTemplateBody rebuilds wrapped schemas without duplicating html or actions components', () => {
  const body = buildCorfixTemplateBody({
    title: 'Inspection Form',
    schema: {
      label: 'Grouping',
      key: 'fieldSet',
      type: 'fieldset',
      input: false,
      tableView: false,
      components: [
        {
          label: 'HTML1',
          tag: 'style',
          key: 'html11',
          type: 'htmlelement',
          input: false,
          tableView: false,
          content: '.corfix legend { font-size: 26px; }'
        },
        {
          type: 'textfield',
          key: 'workerName',
          label: 'Worker Name',
          input: true
        },
        {
          label: 'Actions',
          key: 'actionsGroup',
          type: 'fieldset',
          input: false,
          tableView: false,
          components: []
        }
      ]
    }
  });

  const components = body[0].questions.components[0].components;
  assert.equal(components.filter((component) => component.key === 'html11').length, 1);
  assert.equal(components.filter((component) => component.key === 'actionsGroup').length, 1);
  assert.equal(components[1].key, 'workerName');
});

test('publishTemplateToCorfix skips cleanly when Corfix env is not configured', async () => {
  const result = await publishTemplateToCorfix({
    title: 'Inspection Form',
    schema: { components: [] },
    env: {}
  });

  assert.equal(result.ok, false);
  assert.equal(result.skipped, true);
  assert.match(result.reason, /CORFIX_API_TOKEN/);
  assert.match(result.reason, /CORFIX_COMPANY_ID/);
});

test('corfix group endpoints list and create groups when configured', { concurrency: false }, async (t) => {
  const originalEnv = {
    CORFIX_API_TOKEN: process.env.CORFIX_API_TOKEN,
    CORFIX_COMPANY_ID: process.env.CORFIX_COMPANY_ID,
    CORFIX_API_BASE_URL: process.env.CORFIX_API_BASE_URL
  };
  const originalFetch = global.fetch;

  t.after(() => {
    global.fetch = originalFetch;
    Object.entries(originalEnv).forEach(([key, value]) => {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    });
  });

  process.env.CORFIX_API_TOKEN = 'test-corfix-token';
  process.env.CORFIX_COMPANY_ID = 'company-123';
  process.env.CORFIX_API_BASE_URL = 'https://api.dev.corfix.com';

  global.fetch = async (input, init) => {
    const url = typeof input === 'string' ? input : input.url;
    if (String(url).startsWith('https://api.dev.corfix.com/company-123/groups')) {
      if ((init?.method || 'GET') === 'POST') {
        return new Response(JSON.stringify({
          id: 'group-new',
          name: 'Alpha Group',
          companyId: 'company-123',
          templateIds: [],
          hidden: false,
          subtrade: false
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      assert.match(String(url), /hidden/);
      assert.match(String(url), /bypassGroups=true/);
      return new Response(JSON.stringify([
        {
          id: 'group-b',
          name: 'Zulu Group',
          companyId: 'company-123',
          templateIds: ['template-2'],
          hidden: false,
          subtrade: true
        },
        {
          id: 'group-a',
          name: 'Alpha Group',
          companyId: 'company-123',
          templateIds: ['template-1'],
          hidden: false,
          subtrade: false
        }
      ]), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    return originalFetch(input, init);
  };

  await withServer(async (baseUrl) => {
    const listResponse = await fetch(`${baseUrl}/api/corfix/groups`);
    const listPayload = await listResponse.json();

    assert.equal(listResponse.status, 200);
    assert.equal(listPayload.ok, true);
    assert.deepEqual(listPayload.groups.map((group) => group.name), ['Alpha Group', 'Zulu Group']);

    const createResponse = await fetch(`${baseUrl}/api/corfix/groups`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        name: 'Alpha Group'
      })
    });
    const createPayload = await createResponse.json();

    assert.equal(createResponse.status, 201);
    assert.equal(createPayload.ok, true);
    assert.equal(createPayload.group.id, 'group-new');
    assert.equal(createPayload.group.name, 'Alpha Group');
  });
});

test('saving a template also publishes it to Corfix when configured', { concurrency: false }, async (t) => {
  const originalEnv = {
    NODE_ENV: process.env.NODE_ENV,
    DATABASE_URL: process.env.DATABASE_URL,
    GCS_TEMPLATE_BUCKET: process.env.GCS_TEMPLATE_BUCKET,
    GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET,
    GOOGLE_OAUTH_REDIRECT_URI: process.env.GOOGLE_OAUTH_REDIRECT_URI,
    TEMPLATE_LIBRARY_ROOT: process.env.TEMPLATE_LIBRARY_ROOT,
    TEMPLATE_BLOB_ROOT: process.env.TEMPLATE_BLOB_ROOT,
    CORFIX_API_TOKEN: process.env.CORFIX_API_TOKEN,
    CORFIX_COMPANY_ID: process.env.CORFIX_COMPANY_ID,
    CORFIX_API_BASE_URL: process.env.CORFIX_API_BASE_URL
  };
  const originalFetch = global.fetch;
  const rootDir = await makeTempDir('corfix-publish');
  let corfixRequest = null;

  t.after(async () => {
    global.fetch = originalFetch;
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
  delete process.env.GOOGLE_CLIENT_ID;
  delete process.env.GOOGLE_CLIENT_SECRET;
  delete process.env.GOOGLE_OAUTH_REDIRECT_URI;
  process.env.TEMPLATE_LIBRARY_ROOT = path.join(rootDir, 'library');
  process.env.TEMPLATE_BLOB_ROOT = path.join(rootDir, 'blobs');
  process.env.CORFIX_API_TOKEN = 'test-corfix-token';
  process.env.CORFIX_COMPANY_ID = 'company-123';
  process.env.CORFIX_API_BASE_URL = 'https://api.dev.corfix.com';
  resetTemplateLibraryService();

  let groupFetchCount = 0;
  let groupPatchCount = 0;
  global.fetch = async (input, init) => {
    const url = typeof input === 'string' ? input : input.url;
    if (String(url) === 'https://api.dev.corfix.com/company-123/groups/group-1?bypassGroups=true'
      || String(url) === 'https://api.dev.corfix.com/company-123/groups/group-2?bypassGroups=true') {
      if ((init?.method || 'GET') === 'PATCH') {
        groupPatchCount += 1;
        return new Response(null, { status: 204 });
      }

      groupFetchCount += 1;
      const groupId = String(url).includes('/group-1?') ? 'group-1' : 'group-2';
      return new Response(JSON.stringify({
        id: groupId,
        name: groupId === 'group-1' ? 'Group One' : 'Group Two',
        companyId: 'company-123',
        templateIds: groupId === 'group-1' ? ['existing-template'] : [],
        hidden: false,
        subtrade: false
      }), {
        status: 200,
        headers: {
          'Content-Type': 'application/json'
        }
      });
    }

    if (String(url).startsWith('https://api.dev.corfix.com/')) {
      corfixRequest = {
        url: String(url),
        method: init?.method,
        headers: init?.headers,
        body: init?.body
      };
      return new Response(JSON.stringify([{ _id: 'corfix-template-1' }]), {
        status: 200,
        headers: {
          'Content-Type': 'application/json'
        }
      });
    }

    return originalFetch(input, init);
  };

  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/templates`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        name: 'Alpha Template',
        corfixGroupIds: ['group-1', 'group-2'],
        json: {
          components: [
            {
              type: 'textfield',
              key: 'alphaField',
              label: 'Alpha Field',
              input: true
            }
          ]
        }
      })
    });
    const payload = await response.json();

    assert.equal(response.status, 201);
    assert.ok(payload.templateId);
    assert.equal(payload.corfix.ok, true);
    assert.equal(payload.corfix.templateId, 'corfix-template-1');
    assert.deepEqual(payload.corfix.groupIds, ['group-1', 'group-2']);
    assert.deepEqual(payload.corfix.assignedGroupIds, ['group-1', 'group-2']);
    assert.equal(payload.corfix.groupAssignment.ok, true);
    assert.equal(groupFetchCount, 2);
    assert.equal(groupPatchCount, 2);
    assert.equal(corfixRequest.url, 'https://api.dev.corfix.com/company-123/templates');

    const corfixBody = JSON.parse(corfixRequest.body);
    assert.equal(Array.isArray(corfixBody), true);
    assert.equal(corfixBody[0].title, 'Alpha Template');
    assert.deepEqual(corfixBody[0].groupIds, ['group-1', 'group-2']);
    assert.equal(corfixBody[0].questions.components[0].key, 'fieldSet1');
    assert.equal(corfixBody[0].questions.components[0].components[0].key, 'html11');
    assert.equal(corfixBody[0].questions.components[0].components[1].key, 'alphaField');
    assert.equal(corfixBody[0].questions.components[0].components.at(-1).key, 'actionsGroup');
  });
});

test('template save still succeeds when Corfix publish fails', { concurrency: false }, async (t) => {
  const originalEnv = {
    NODE_ENV: process.env.NODE_ENV,
    DATABASE_URL: process.env.DATABASE_URL,
    GCS_TEMPLATE_BUCKET: process.env.GCS_TEMPLATE_BUCKET,
    GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET,
    GOOGLE_OAUTH_REDIRECT_URI: process.env.GOOGLE_OAUTH_REDIRECT_URI,
    TEMPLATE_LIBRARY_ROOT: process.env.TEMPLATE_LIBRARY_ROOT,
    TEMPLATE_BLOB_ROOT: process.env.TEMPLATE_BLOB_ROOT,
    CORFIX_API_TOKEN: process.env.CORFIX_API_TOKEN,
    CORFIX_COMPANY_ID: process.env.CORFIX_COMPANY_ID,
    CORFIX_API_BASE_URL: process.env.CORFIX_API_BASE_URL
  };
  const originalFetch = global.fetch;
  const rootDir = await makeTempDir('corfix-publish-failure');

  t.after(async () => {
    global.fetch = originalFetch;
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
  delete process.env.GOOGLE_CLIENT_ID;
  delete process.env.GOOGLE_CLIENT_SECRET;
  delete process.env.GOOGLE_OAUTH_REDIRECT_URI;
  process.env.TEMPLATE_LIBRARY_ROOT = path.join(rootDir, 'library');
  process.env.TEMPLATE_BLOB_ROOT = path.join(rootDir, 'blobs');
  process.env.CORFIX_API_TOKEN = 'test-corfix-token';
  process.env.CORFIX_COMPANY_ID = 'company-123';
  process.env.CORFIX_API_BASE_URL = 'https://api.dev.corfix.com';
  resetTemplateLibraryService();

  global.fetch = async (input, init) => {
    const url = typeof input === 'string' ? input : input.url;
    if (String(url).startsWith('https://api.dev.corfix.com/')) {
      return new Response(JSON.stringify({ message: 'Corfix exploded' }), {
        status: 502,
        headers: {
          'Content-Type': 'application/json'
        }
      });
    }

    return originalFetch(input, init);
  };

  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/templates`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
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
        }
      })
    });
    const payload = await response.json();

    assert.equal(response.status, 201);
    assert.ok(payload.templateId);
    assert.equal(payload.corfix.ok, false);
    assert.equal(payload.corfix.status, 502);
    assert.equal(payload.corfix.error, 'Corfix exploded');
  });
});
