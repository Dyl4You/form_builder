const fs = require('fs/promises');
const os = require('os');
const path = require('path');
const test = require('node:test');
const assert = require('node:assert/strict');

const { newDb } = require('pg-mem');

const { FilesystemBlobStore } = require('../src/storage/blobStore');
const { FileTemplateLibraryStore } = require('../src/storage/fileTemplateLibraryStore');
const { PostgresTemplateLibraryStore } = require('../src/storage/postgresTemplateLibraryStore');
const { createTemplateLibraryService } = require('../src/utils/templateLibrary');

const NOOP_LOGGER = {
  info() {},
  warn() {},
  error() {}
};
const TEST_TEMPLATE_COVER_OPTIONS = { enabled: false };

class MemoryBlobStore {
  constructor() {
    this.map = new Map();
  }

  async ensureReady() {}

  async putJson(blobKey, payload) {
    this.map.set(blobKey, JSON.parse(JSON.stringify(payload)));
    return {
      blobKey,
      sizeBytes: Buffer.byteLength(JSON.stringify(payload), 'utf8')
    };
  }

  async putBuffer(blobKey, payload, options = {}) {
    const buffer = Buffer.isBuffer(payload) ? payload : Buffer.from(payload);
    this.map.set(blobKey, Buffer.from(buffer));
    return {
      blobKey,
      sizeBytes: buffer.byteLength,
      contentType: options.contentType || 'application/octet-stream'
    };
  }

  async getJson(blobKey) {
    return JSON.parse(JSON.stringify(this.map.get(blobKey)));
  }

  async getBuffer(blobKey) {
    const value = this.map.get(blobKey);
    return value ? Buffer.from(value) : null;
  }

  async delete(blobKey) {
    this.map.delete(blobKey);
  }

  async deletePrefix(prefix) {
    Array.from(this.map.keys()).forEach((key) => {
      if (key.startsWith(prefix)) {
        this.map.delete(key);
      }
    });
  }
}

async function makeTempDir(prefix) {
  return fs.mkdtemp(path.join(os.tmpdir(), `${prefix}-`));
}

async function waitFor(assertion, options = {}) {
  const timeoutMs = options.timeoutMs || 1500;
  const intervalMs = options.intervalMs || 20;
  const startedAt = Date.now();
  let lastError = null;

  while ((Date.now() - startedAt) < timeoutMs) {
    try {
      return await assertion();
    } catch (err) {
      lastError = err;
      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }
  }

  if (lastError) throw lastError;
  throw new Error('Timed out waiting for condition.');
}

function buildJson(componentType, keySuffix) {
  return {
    components: [
      {
        type: componentType,
        key: `${componentType}_${keySuffix}`,
        label: `${componentType} ${keySuffix}`,
        input: true
      }
    ]
  };
}

function buildJsonWithActionsBundle() {
  return {
    components: [
      {
        type: 'radio',
        key: 'incidentType',
        label: 'Incident Type',
        input: true,
        values: [
          { label: 'Yes', value: 'yes' },
          { label: 'No', value: 'no' }
        ],
        _actionsDriverKey: 'actions'
      },
      {
        type: 'fieldset',
        key: 'actions',
        label: 'Actions',
        input: false,
        tableView: false,
        components: [
          {
            type: 'textarea',
            key: 'comments',
            label: 'Comments',
            input: true,
            customConditional: "const key = instance.parent.component.components.find(c => c.key.startsWith('actions'))?.key; show = row[key]?.comments;"
          },
          {
            type: 'fieldset',
            key: 'grouping',
            label: 'Grouping',
            input: false,
            tableView: false,
            customConditional: "const key = instance.parent.component.components.find(c => c.key.startsWith('actions'))?.key; show = row[key]?.task;",
            components: [
              {
                type: 'tasks',
                key: 'tasks',
                label: 'Tasks',
                input: true,
                components: [
                  {
                    type: 'textfield',
                    key: 'title',
                    label: 'Title',
                    input: true
                  }
                ]
              }
            ]
          },
          {
            type: 'file',
            key: 'photos',
            label: 'Photos',
            input: true,
            customConditional: "const key = instance.parent.component.components.find(c => c.key.startsWith('actions'))?.key; show = row[key]?.photos;"
          },
          {
            type: 'selectboxes',
            key: 'actions1',
            label: 'Actions',
            input: true,
            values: [
              { label: 'Comments', value: 'comments' },
              { label: 'Photos', value: 'photos' },
              { label: 'Task', value: 'task' }
            ]
          }
        ]
      }
    ]
  };
}

async function createPostgresService(options = {}) {
  const db = newDb();
  const adapter = db.adapters.createPg();
  const pool = new adapter.Pool();
  const blobStore = options.blobStore || new MemoryBlobStore();
  const store = new PostgresTemplateLibraryStore({
    pool,
    blobStore,
    workspaceId: 'test-workspace'
  });
  const service = createTemplateLibraryService({
    store,
    blobStore,
    workspaceId: 'test-workspace',
    skipLegacyBootstrap: true,
    templateCoverGenerator: options.templateCoverGenerator,
    templateCoverOptions: options.templateCoverOptions || TEST_TEMPLATE_COVER_OPTIONS,
    logger: NOOP_LOGGER,
    logInitialization: false
  });

  return {
    service,
    async cleanup() {
      await service.store.close();
    }
  };
}

async function createFileService(options = {}) {
  const rootDir = options.rootDir || await makeTempDir('template-library-file-store');
  const blobStore = options.blobStore || new FilesystemBlobStore({
    rootDir: path.join(rootDir, 'blobs')
  });
  const store = options.store || new FileTemplateLibraryStore({
    rootDir,
    blobStore,
    workspaceId: 'test-workspace'
  });
  const service = createTemplateLibraryService({
    store,
    blobStore,
    workspaceId: 'test-workspace',
    skipLegacyBootstrap: options.skipLegacyBootstrap ?? true,
    templateCoverGenerator: options.templateCoverGenerator,
    templateCoverOptions: options.templateCoverOptions || TEST_TEMPLATE_COVER_OPTIONS,
    logger: NOOP_LOGGER,
    logInitialization: false
  });

  return {
    service,
    rootDir,
    async cleanup() {
      await service.store.close();
      await fs.rm(rootDir, { recursive: true, force: true });
    }
  };
}

async function withDatabaseUrlUnset(t) {
  const previousValue = process.env.DATABASE_URL;
  delete process.env.DATABASE_URL;
  t.after(() => {
    if (previousValue === undefined) {
      delete process.env.DATABASE_URL;
      return;
    }
    process.env.DATABASE_URL = previousValue;
  });
}

async function writeLegacyFixtures(t, fixture = {}) {
  const legacyDir = await makeTempDir('template-library-legacy');
  const templates = fixture.templates || [];
  const events = fixture.events || [];
  await fs.writeFile(
    path.join(legacyDir, 'templates-index.json'),
    `${JSON.stringify({ templates }, null, 2)}\n`,
    'utf8'
  );
  await fs.writeFile(
    path.join(legacyDir, 'events.ndjson'),
    events.map((entry) => JSON.stringify(entry)).join('\n'),
    'utf8'
  );
  t.after(async () => {
    await fs.rm(legacyDir, { recursive: true, force: true });
  });
  return legacyDir;
}

const storeFactories = [
  {
    name: 'postgres',
    create: createPostgresService
  },
  {
    name: 'file',
    create: createFileService
  }
];

for (const factory of storeFactories) {
  test(`[${factory.name}] creates new templates, versions them, and reopens blobs`, async (t) => {
    let coverCounter = 0;
    const releaseCoverJobs = [];
    const { service, cleanup } = await factory.create({
      templateCoverGenerator: async () => {
        const coverId = ++coverCounter;
        await new Promise((resolve) => {
          releaseCoverJobs.push(resolve);
        });
        return {
          buffer: Buffer.from(`cover-${coverId}`),
          contentType: 'image/webp',
          prompt: 'test prompt',
          updatedAt: '2026-03-16T12:00:00.000Z'
        };
      }
    });
    t.after(cleanup);

    const createResult = await Promise.race([
      service.createTemplate({
        name: 'Inspection Template',
        json: buildJson('textarea', 'one'),
        telemetry: {
          manualAddsByType: { textarea: 1 },
          manualEdits: 2,
          sessionElapsedMs: 45000
        }
      }),
      new Promise((_, reject) => setTimeout(() => reject(new Error('createTemplate waited on cover generation')), 150))
    ]);

    assert.equal(createResult.ok, true);
    assert.ok(createResult.templateId);
    assert.ok(createResult.versionId);
    assert.equal(createResult.hasCoverImage, false);
    assert.equal(createResult.coverImageUrl, null);
    assert.equal(createResult.coverGenerationPending, true);

    const summary = await service.getTemplateById(createResult.templateId);
    assert.equal(summary.displayName, 'Inspection Template');
    assert.equal(summary.versionCount, 1);
    assert.equal(summary.canLoad, true);
    assert.equal(summary.hasCoverImage, false);
    assert.deepEqual(summary.topMix, [{ type: 'textarea', count: 1 }]);

    const blob = await service.getTemplateVersionBlob(createResult.versionId);
    assert.equal(blob.name, 'Inspection Template');
    assert.equal(blob.sessionElapsedMs, 45000);
    assert.equal(blob.json.components[0].type, 'textarea');

    await waitFor(() => {
      assert.equal(releaseCoverJobs.length, 1);
    });
    releaseCoverJobs.shift()();

    await waitFor(async () => {
      const nextSummary = await service.getTemplateById(createResult.templateId);
      assert.equal(nextSummary.hasCoverImage, true);
      assert.match(nextSummary.coverImageUrl, new RegExp(`/api/templates/${createResult.templateId}/cover\\?v=`));
    });

    const cover = await waitFor(async () => {
      const nextCover = await service.getTemplateCover(createResult.templateId);
      assert.equal(nextCover.contentType, 'image/webp');
      assert.deepEqual(nextCover.buffer, Buffer.from('cover-1'));
      return nextCover;
    });
    assert.equal(cover.contentType, 'image/webp');

    const versionResult = await Promise.race([
      service.createTemplateVersion(createResult.templateId, {
        name: 'Inspection Template V2',
        json: {
          components: [
            ...buildJson('textarea', 'two').components,
            ...buildJson('number', 'two').components
          ]
        },
        telemetry: {
          manualAddsByType: { textarea: 1, number: 1 },
          manualEdits: 3,
          sessionElapsedMs: 60000
        }
      }),
      new Promise((_, reject) => setTimeout(() => reject(new Error('createTemplateVersion waited on cover generation')), 150))
    ]);

    assert.equal(versionResult.ok, true);
    assert.notEqual(versionResult.versionId, createResult.versionId);
    assert.equal(versionResult.hasCoverImage, true);
    assert.equal(versionResult.coverGenerationPending, false);

    const history = await service.getTemplateVersions(createResult.templateId);
    assert.equal(history.items.length, 2);
    assert.equal(history.items[0].displayName, 'Inspection Template V2');
    assert.equal(history.items[0].versionNumber, 2);
    assert.equal(history.items[1].versionNumber, 1);

    await waitFor(async () => {
      const nextCover = await service.getTemplateCover(createResult.templateId);
      assert.equal(nextCover.contentType, 'image/webp');
      assert.deepEqual(nextCover.buffer, Buffer.from('cover-1'));
    });
  });

  test(`[${factory.name}] lists templates with cursor pagination and archive filters`, async (t) => {
    const { service, cleanup } = await factory.create();
    t.after(cleanup);

    const createdIds = [];
    for (let index = 0; index < 27; index += 1) {
      const result = await service.createTemplate({
        name: `Template ${String(index).padStart(2, '0')}`,
        json: buildJson(index % 2 === 0 ? 'textarea' : 'number', index),
        telemetry: {
          manualAddsByType: index % 2 === 0 ? { textarea: 1 } : { number: 1 },
          manualEdits: 1,
          sessionElapsedMs: 1000 + index
        }
      });
      createdIds.push(result.templateId);
    }

    const firstPage = await service.listTemplates({ limit: 25 });
    assert.equal(firstPage.items.length, 25);
    assert.equal(firstPage.hasMore, true);
    assert.ok(firstPage.nextCursor);

    const secondPage = await service.listTemplates({ limit: 25, cursor: firstPage.nextCursor });
    assert.equal(secondPage.items.length, 2);
    assert.equal(secondPage.hasMore, false);

    const targetTemplateId = createdIds[3];
    const archived = await service.archiveTemplate(targetTemplateId);
    assert.ok(archived);

    const activeList = await service.listTemplates({ status: 'active', limit: 50 });
    assert.equal(activeList.items.some((item) => item.templateId === targetTemplateId), false);

    const archivedList = await service.listTemplates({ status: 'archived', limit: 50 });
    assert.equal(archivedList.items.some((item) => item.templateId === targetTemplateId), true);

    await service.restoreTemplate(targetTemplateId);
    const restoredList = await service.listTemplates({ status: 'active', limit: 50, q: 'Template 03' });
    assert.equal(restoredList.items.some((item) => item.templateId === targetTemplateId), true);
  });

  test(`[${factory.name}] imports legacy metadata-only templates and supports canLoad filtering`, async (t) => {
    const { service, cleanup } = await factory.create();
    t.after(cleanup);

    await service.importLegacyTemplate({
      templateId: 'tpl_legacy_001',
      versionId: 'tpl_legacy_001_v001',
      name: 'Legacy Metadata Template',
      nameSource: 'manual',
      savedAt: '2026-03-16T10:00:00.000Z',
      ymd: '2026-03-16',
      json: null,
      telemetry: {
        manualAddsByType: { textarea: 2 },
        manualEdits: 1,
        sessionElapsedMs: 120000
      },
      templateStats: {
        totalComponents: 2,
        uniqueTypes: 1,
        topTypes: [{ type: 'textarea', count: 2 }],
        conditionalCount: 0,
        calculationCount: 0,
        sessionElapsedMs: 120000
      },
      actionCounts: {
        sessionElapsedMs: 120000,
        manualAddsByType: { textarea: 2 },
        manualAdds: 2,
        manualEdits: 1,
        manualDeletes: 0,
        aiAdds: 0,
        aiEdits: 0,
        aiDeletes: 0,
        manualActions: 3,
        aiActions: 0
      },
      scores: {
        diversityScore: 10,
        balanceScore: 50,
        complexityScore: 10,
        craftScore: 100,
        masteryScore: 35
      },
      xp: {
        xpGained: 20,
        noveltyBonus: 0,
        streakBonus: 1,
        spamPenalty: 0
      },
      componentGenome: {
        typeDistribution: { textarea: 1 },
        complexitySignature: {
          maxDepth: 1,
          advancedFeatureCount: 0,
          uniqueTypes: 1
        }
      }
    });

    const metadataOnly = await service.listTemplates({ canLoad: 'no', status: 'all', limit: 25 });
    assert.equal(metadataOnly.items.length, 1);
    assert.equal(metadataOnly.items[0].canLoad, false);
    assert.deepEqual(metadataOnly.items[0].topMix, [{ type: 'textarea', count: 2 }]);

    const blob = await service.getTemplateVersionBlob(metadataOnly.items[0].currentVersionId);
    assert.equal(blob.json, null);
  });

  test(`[${factory.name}] strips saved action helper bundles from report metrics`, async (t) => {
    const { service, cleanup } = await factory.create();
    t.after(cleanup);

    await service.importLegacyTemplate({
      templateId: 'tpl_actions_legacy',
      versionId: 'tpl_actions_legacy_v001',
      name: 'Template With Actions',
      nameSource: 'manual',
      savedAt: '2026-03-16T12:00:00.000Z',
      ymd: '2026-03-16',
      json: buildJsonWithActionsBundle(),
      telemetry: {
        manualAddsByType: { radio: 1, textarea: 1, file: 1, selectboxes: 1, fieldset: 2 },
        sessionElapsedMs: 15000
      },
      templateStats: {
        totalComponents: 6,
        uniqueTypes: 6,
        componentBreakdown: [
          { type: 'fieldset', count: 2 },
          { type: 'file', count: 1 },
          { type: 'radio', count: 1 },
          { type: 'selectboxes', count: 1 },
          { type: 'tasks', count: 1 },
          { type: 'textarea', count: 1 }
        ],
        topTypes: [
          { type: 'fieldset', count: 2 },
          { type: 'file', count: 1 },
          { type: 'radio', count: 1 }
        ],
        conditionalCount: 3,
        calculationCount: 0,
        sessionElapsedMs: 15000
      },
      actionCounts: {
        sessionElapsedMs: 15000,
        manualAddsByType: { radio: 1 },
        manualActions: 1,
        aiActions: 0
      },
      scores: {
        diversityScore: 12,
        balanceScore: 50,
        complexityScore: 12,
        craftScore: 100,
        masteryScore: 40
      },
      xp: {
        xpGained: 18,
        noveltyBonus: 0,
        streakBonus: 1,
        spamPenalty: 0
      },
      componentGenome: {
        typeDistribution: { radio: 1 },
        complexitySignature: {
          maxDepth: 1,
          advancedFeatureCount: 0,
          uniqueTypes: 1
        }
      }
    });

    const list = await service.listTemplates({ status: 'all', limit: 25 });
    assert.equal(list.items.length, 1);
    assert.equal(list.items[0].totalComponents, 1);
    assert.equal(list.items[0].uniqueTypes, 1);
    assert.equal(list.items[0].conditionalCount, 0);
    assert.equal(list.items[0].calculationCount, 0);
    assert.deepEqual(list.items[0].topMix, [{ type: 'radio', count: 1 }]);

    const summary = await service.getTemplateById('tpl_actions_legacy');
    assert.equal(summary.totalComponents, 1);
    assert.deepEqual(summary.topMix, [{ type: 'radio', count: 1 }]);

    const history = await service.getTemplateVersions('tpl_actions_legacy');
    assert.equal(history.items.length, 1);
    assert.equal(history.items[0].totalComponents, 1);
    assert.deepEqual(history.items[0].topMix, [{ type: 'radio', count: 1 }]);

    const overview = await service.getOverview();
    assert.deepEqual(overview.topComponents, [{ type: 'radio', count: 1 }]);
  });
}

test('continues saving templates when cover generation fails', async (t) => {
  const { service, cleanup } = await createFileService({
    templateCoverGenerator: async () => {
      throw new Error('cover service unavailable');
    }
  });
  t.after(cleanup);

  const result = await service.createTemplate({
    name: 'No Cover Template',
    json: buildJson('textarea', 'nocover')
  });

  assert.equal(result.ok, true);
  assert.equal(result.coverGenerationPending, true);

  const summary = await waitFor(async () => service.getTemplateById(result.templateId));
  assert.equal(summary.hasCoverImage, false);
  assert.equal(summary.coverImageUrl, null);
});

test('auto-imports legacy templates into the durable local store on first boot', async (t) => {
  await withDatabaseUrlUnset(t);
  const storeRootDir = await makeTempDir('template-library-autoboot');
  const legacyDir = await writeLegacyFixtures(t, {
    templates: [
      {
        templateId: 'tpl_legacy_loadable',
        name: 'Legacy Loadable Template',
        savedAt: '2026-03-10T10:00:00.000Z',
        json: buildJson('textarea', 'legacy'),
        notes: { implemented: 'done', issues: '' },
        templateStats: {
          totalComponents: 1,
          uniqueTypes: 1,
          componentBreakdown: [{ type: 'textarea', count: 1 }],
          sessionElapsedMs: 30000
        },
        scores: { masteryScore: 50 },
        actionCounts: { sessionElapsedMs: 30000, manualAddsByType: { textarea: 1 }, manualActions: 1, aiActions: 0 },
        xp: { xpGained: 10 },
        componentGenome: {
          complexitySignature: { maxDepth: 1, advancedFeatureCount: 0, uniqueTypes: 1 }
        }
      },
      {
        templateId: 'tpl_legacy_metadata',
        name: 'Legacy Metadata Template',
        savedAt: '2026-03-11T10:00:00.000Z',
        notes: { implemented: '', issues: 'none' },
        templateStats: {
          totalComponents: 2,
          uniqueTypes: 1
        },
        scores: { masteryScore: 60 },
        actionCounts: { sessionElapsedMs: 45000, manualAddsByType: { number: 2 }, manualActions: 2, aiActions: 0 },
        xp: { xpGained: 12 },
        componentGenome: {
          complexitySignature: { maxDepth: 2, advancedFeatureCount: 0, uniqueTypes: 1 }
        }
      }
    ],
    events: [
      {
        type: 'template_saved',
        templateId: 'tpl_legacy_loadable',
        name: 'Legacy Loadable Template',
        savedAt: '2026-03-10T10:00:00.000Z',
        ymd: '2026-03-10',
        templateStats: {
          totalComponents: 1,
          uniqueTypes: 1,
          componentBreakdown: [{ type: 'textarea', count: 1 }],
          sessionElapsedMs: 30000
        },
        actionCounts: { sessionElapsedMs: 30000, manualAddsByType: { textarea: 1 }, manualActions: 1, aiActions: 0 },
        xp: { xpGained: 10 }
      },
      {
        type: 'template_saved',
        templateId: 'tpl_legacy_metadata',
        name: 'Legacy Metadata Template',
        savedAt: '2026-03-11T10:00:00.000Z',
        ymd: '2026-03-11',
        templateStats: {
          totalComponents: 2,
          uniqueTypes: 1,
          topTypes: [{ type: 'number', count: 2 }],
          sessionElapsedMs: 45000
        },
        actionCounts: { sessionElapsedMs: 45000, manualAddsByType: { number: 2 }, manualActions: 2, aiActions: 0 },
        xp: { xpGained: 12 }
      }
    ]
  });

  t.after(async () => {
    await fs.rm(storeRootDir, { recursive: true, force: true });
  });

  const service = createTemplateLibraryService({
    workspaceId: 'test-workspace',
    storeRootDir,
    legacyDataDir: legacyDir,
    templateCoverOptions: TEST_TEMPLATE_COVER_OPTIONS,
    logger: NOOP_LOGGER,
    logInitialization: false
  });
  t.after(async () => {
    await service.store.close();
  });

  const templates = await service.listTemplates({ status: 'all', limit: 25 });
  assert.equal(templates.items.length, 2);
  assert.equal(templates.items.some((item) => item.templateId === 'tpl_legacy_loadable'), true);
  assert.equal(templates.items.some((item) => item.templateId === 'tpl_legacy_metadata'), true);

  const metadataOnly = await service.listTemplates({ status: 'all', canLoad: 'no', limit: 25 });
  assert.equal(metadataOnly.items.length, 1);
  assert.equal(metadataOnly.items[0].templateId, 'tpl_legacy_metadata');
  assert.deepEqual(metadataOnly.items[0].topMix, [{ type: 'number', count: 2 }]);

  const blob = await service.getTemplateVersionBlob(metadataOnly.items[0].currentVersionId);
  assert.equal(blob.json, null);

  const overview = await service.getOverview();
  assert.equal(overview.templatesSaved, 2);
  assert.equal(overview.activeTemplates, 2);
});

test('skips automatic legacy import when the durable local store already has data', async (t) => {
  await withDatabaseUrlUnset(t);
  const storeRootDir = await makeTempDir('template-library-skip-existing');
  const legacyDir = await writeLegacyFixtures(t, {
    templates: [
      {
        templateId: 'tpl_legacy_should_not_import',
        name: 'Legacy Should Not Import',
        savedAt: '2026-03-12T12:00:00.000Z',
        templateStats: { totalComponents: 1, uniqueTypes: 1 }
      }
    ],
    events: [
      {
        type: 'template_saved',
        templateId: 'tpl_legacy_should_not_import',
        name: 'Legacy Should Not Import',
        savedAt: '2026-03-12T12:00:00.000Z',
        ymd: '2026-03-12',
        templateStats: {
          totalComponents: 1,
          uniqueTypes: 1,
          topTypes: [{ type: 'textarea', count: 1 }]
        }
      }
    ]
  });

  t.after(async () => {
    await fs.rm(storeRootDir, { recursive: true, force: true });
  });

  const firstService = createTemplateLibraryService({
    workspaceId: 'test-workspace',
    storeRootDir,
    legacyDataDir: legacyDir,
    skipLegacyBootstrap: true,
    templateCoverOptions: TEST_TEMPLATE_COVER_OPTIONS,
    logger: NOOP_LOGGER,
    logInitialization: false
  });
  t.after(async () => {
    await firstService.store.close();
  });

  await firstService.createTemplate({
    name: 'Manual Local Template',
    json: buildJson('textarea', 'manual')
  });

  await firstService.store.close();

  const secondService = createTemplateLibraryService({
    workspaceId: 'test-workspace',
    storeRootDir,
    legacyDataDir: legacyDir,
    templateCoverOptions: TEST_TEMPLATE_COVER_OPTIONS,
    logger: NOOP_LOGGER,
    logInitialization: false
  });
  t.after(async () => {
    await secondService.store.close();
  });

  const templates = await secondService.listTemplates({ status: 'all', limit: 25 });
  assert.equal(templates.items.length, 1);
  assert.equal(templates.items[0].displayName, 'Manual Local Template');
});

test('does not duplicate legacy templates after the one-time import marker is written', async (t) => {
  await withDatabaseUrlUnset(t);
  const storeRootDir = await makeTempDir('template-library-import-marker');
  const legacyDir = await writeLegacyFixtures(t, {
    templates: [
      {
        templateId: 'tpl_legacy_marker',
        name: 'Legacy Marker Template',
        savedAt: '2026-03-13T12:00:00.000Z',
        templateStats: {
          totalComponents: 1,
          uniqueTypes: 1
        }
      }
    ],
    events: [
      {
        type: 'template_saved',
        templateId: 'tpl_legacy_marker',
        name: 'Legacy Marker Template',
        savedAt: '2026-03-13T12:00:00.000Z',
        ymd: '2026-03-13',
        templateStats: {
          totalComponents: 1,
          uniqueTypes: 1,
          topTypes: [{ type: 'number', count: 1 }]
        }
      }
    ]
  });

  t.after(async () => {
    await fs.rm(storeRootDir, { recursive: true, force: true });
  });

  const firstService = createTemplateLibraryService({
    workspaceId: 'test-workspace',
    storeRootDir,
    legacyDataDir: legacyDir,
    templateCoverOptions: TEST_TEMPLATE_COVER_OPTIONS,
    logger: NOOP_LOGGER,
    logInitialization: false
  });
  t.after(async () => {
    await firstService.store.close();
  });

  const firstList = await firstService.listTemplates({ status: 'all', limit: 25 });
  assert.equal(firstList.items.length, 1);
  await firstService.store.close();

  const secondService = createTemplateLibraryService({
    workspaceId: 'test-workspace',
    storeRootDir,
    legacyDataDir: legacyDir,
    templateCoverOptions: TEST_TEMPLATE_COVER_OPTIONS,
    logger: NOOP_LOGGER,
    logInitialization: false
  });
  t.after(async () => {
    await secondService.store.close();
  });

  const secondList = await secondService.listTemplates({ status: 'all', limit: 25 });
  assert.equal(secondList.items.length, 1);

  const overview = await secondService.getOverview();
  assert.equal(overview.templatesSaved, 1);
});

test('persists templates across service restarts in durable local mode', async (t) => {
  await withDatabaseUrlUnset(t);
  const storeRootDir = await makeTempDir('template-library-restart');
  t.after(async () => {
    await fs.rm(storeRootDir, { recursive: true, force: true });
  });

  const firstService = createTemplateLibraryService({
    workspaceId: 'test-workspace',
    storeRootDir,
    skipLegacyBootstrap: true,
    templateCoverOptions: TEST_TEMPLATE_COVER_OPTIONS,
    logger: NOOP_LOGGER,
    logInitialization: false
  });
  t.after(async () => {
    await firstService.store.close();
  });

  const created = await firstService.createTemplate({
    name: 'Persistent Local Template',
    json: buildJson('survey', 'restart'),
    telemetry: {
      manualAddsByType: { survey: 1 },
      manualEdits: 1,
      sessionElapsedMs: 90000
    }
  });
  await firstService.store.close();

  const secondService = createTemplateLibraryService({
    workspaceId: 'test-workspace',
    storeRootDir,
    skipLegacyBootstrap: true,
    templateCoverOptions: TEST_TEMPLATE_COVER_OPTIONS,
    logger: NOOP_LOGGER,
    logInitialization: false
  });
  t.after(async () => {
    await secondService.store.close();
  });

  const templates = await secondService.listTemplates({ status: 'all', limit: 25 });
  assert.equal(templates.items.length, 1);
  assert.equal(templates.items[0].templateId, created.templateId);

  const overview = await secondService.getOverview();
  assert.equal(overview.templatesSaved, 1);
  assert.equal(overview.activeTemplates, 1);

  const blob = await secondService.getTemplateVersionBlob(created.versionId);
  assert.equal(blob.json.components[0].type, 'survey');
});
