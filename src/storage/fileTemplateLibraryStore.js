const crypto = require('crypto');
const fs = require('fs/promises');
const path = require('path');

const { encodeCursor, decodeCursor } = require('./postgresTemplateLibraryStore');

function toFiniteNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function cloneJson(value) {
  if (value == null) return value;
  return JSON.parse(JSON.stringify(value));
}

function toBuffer(value) {
  if (value == null) return null;
  return Buffer.isBuffer(value) ? value : Buffer.from(value);
}

function normalizeWorkspaceId(value) {
  const workspaceId = String(value || '').trim();
  return workspaceId || null;
}

function defaultWorkspaceProfile(workspaceId = 'default') {
  return {
    workspaceId,
    displayName: 'Default Workspace',
    templatesSaved: 0,
    componentsTotal: 0,
    xpTotal: 0,
    level: 1,
    streak: {
      current: 0,
      longest: 0,
      lastActiveDate: null
    },
    handcraftedChain: 0,
    neglectedRevivalCount: 0,
    achievementsUnlocked: [],
    lastFingerprintByTemplateName: {}
  };
}

function createEmptyMetadata() {
  return {
    version: 1,
    workspaces: {}
  };
}

function createEmptyState() {
  return {
    version: 1,
    workspaces: {}
  };
}

function createEmptyWorkspace(workspaceId, displayName) {
  return {
    workspaceId,
    displayName,
    profile: {
      ...defaultWorkspaceProfile(workspaceId),
      displayName
    },
    templates: {},
    versions: {},
    versionComponentCounts: {},
    componentTotals: {},
    dailyStats: {}
  };
}

function normalizeComponentBreakdown(entries = []) {
  return (entries || [])
    .map((entry) => ({
      type: String(entry?.type || '').trim(),
      count: Math.max(0, Math.floor(toFiniteNumber(entry?.count)))
    }))
    .filter((entry) => entry.type && entry.count > 0)
    .sort((a, b) => {
      if (b.count !== a.count) return b.count - a.count;
      return a.type.localeCompare(b.type);
    });
}

function parseDate(value) {
  const time = new Date(value || 0).getTime();
  return Number.isFinite(time) ? time : 0;
}

function parseUtcDayStart(value) {
  const ymd = String(value || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return null;
  const time = Date.parse(`${ymd}T00:00:00.000Z`);
  return Number.isFinite(time) ? time : null;
}

function extensionForContentType(contentType) {
  switch (String(contentType || '').trim().toLowerCase()) {
    case 'image/jpeg':
      return 'jpg';
    case 'image/png':
      return 'png';
    case 'image/webp':
      return 'webp';
    default:
      return 'bin';
  }
}

function compareTemplatesDesc(a, b) {
  const aTime = parseDate(a?.latestSavedAt);
  const bTime = parseDate(b?.latestSavedAt);
  if (aTime !== bTime) return bTime - aTime;
  return String(b?.templateId || '').localeCompare(String(a?.templateId || ''));
}

function compareVersionsDesc(a, b) {
  const aTime = parseDate(a?.savedAt);
  const bTime = parseDate(b?.savedAt);
  if (aTime !== bTime) return bTime - aTime;
  return Math.max(0, Math.floor(toFiniteNumber(b?.versionNumber)))
    - Math.max(0, Math.floor(toFiniteNumber(a?.versionNumber)));
}

function buildTemplateSummary(template = {}, version = {}, topMix = []) {
  return {
    templateId: template.templateId || null,
    currentVersionId: template.currentVersionId || null,
    displayName: template.displayName || '',
    nameSource: template.nameSource || 'manual',
    status: template.status || 'active',
    canLoad: Boolean(version.canLoad),
    latestSavedAt: template.latestSavedAt || version.savedAt || null,
    archivedAt: template.archivedAt || null,
    totalComponents: Math.max(0, Math.floor(toFiniteNumber(version.totalComponents))),
    uniqueTypes: Math.max(0, Math.floor(toFiniteNumber(version.uniqueTypes))),
    conditionalCount: version.conditionalCount == null ? null : Math.max(0, Math.floor(toFiniteNumber(version.conditionalCount))),
    calculationCount: version.calculationCount == null ? null : Math.max(0, Math.floor(toFiniteNumber(version.calculationCount))),
    sessionElapsedMs: version.sessionElapsedMs == null ? null : Math.max(0, Math.floor(toFiniteNumber(version.sessionElapsedMs))),
    topMix,
    hasCoverImage: Boolean(template.coverBlobKey),
    coverUpdatedAt: template.coverUpdatedAt || null,
    versionCount: Array.isArray(template.versionIds) ? template.versionIds.length : 0,
    savedAt: version.savedAt || template.latestSavedAt || null
  };
}

async function readJson(filePath, fallback) {
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    if (!raw.trim()) return fallback;
    return JSON.parse(raw);
  } catch (err) {
    if (err?.code === 'ENOENT') return fallback;
    throw err;
  }
}

async function writeJsonAtomic(filePath, payload) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(tempPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  await fs.rename(tempPath, filePath);
}

class FileTemplateLibraryStore {
  constructor(options = {}) {
    this.workspaceId = Object.prototype.hasOwnProperty.call(options, 'workspaceId')
      ? normalizeWorkspaceId(options.workspaceId)
      : normalizeWorkspaceId(process.env.TEMPLATE_WORKSPACE_ID || 'default');
    this.displayName = options.workspaceDisplayName || process.env.TEMPLATE_WORKSPACE_NAME || 'Default Workspace';
    this.rootDir = options.rootDir || path.join(__dirname, '..', '..', 'data', 'template-library');
    this.metadataPath = path.join(this.rootDir, 'metadata.json');
    this.statePath = path.join(this.rootDir, 'state.json');
    this.blobStore = options.blobStore;
    this.data = null;
    this.state = null;
    this.readyPromise = null;
    this.writeQueue = Promise.resolve();
  }

  getStoreKind() {
    return 'file';
  }

  async ensureReady() {
    if (!this.readyPromise) {
      this.readyPromise = (async () => {
        if (!this.blobStore) {
          throw new Error('Template library store requires a blobStore.');
        }

        await fs.mkdir(this.rootDir, { recursive: true });
        await this.blobStore.ensureReady();

        this.data = await readJson(this.metadataPath, createEmptyMetadata());
        this.state = await readJson(this.statePath, createEmptyState());

        let metadataDirty = false;
        let stateDirty = false;

        if (!this.data || typeof this.data !== 'object') {
          this.data = createEmptyMetadata();
          metadataDirty = true;
        }
        if (!this.data.workspaces || typeof this.data.workspaces !== 'object') {
          this.data.workspaces = {};
          metadataDirty = true;
        }
        if (this.workspaceId && !this.data.workspaces[this.workspaceId]) {
          this.data.workspaces[this.workspaceId] = createEmptyWorkspace(this.workspaceId, this.displayName);
          metadataDirty = true;
        }

        if (!this.state || typeof this.state !== 'object') {
          this.state = createEmptyState();
          stateDirty = true;
        }
        if (!this.state.workspaces || typeof this.state.workspaces !== 'object') {
          this.state.workspaces = {};
          stateDirty = true;
        }
        if (this.workspaceId && !this.state.workspaces[this.workspaceId]) {
          this.state.workspaces[this.workspaceId] = { importState: {} };
          stateDirty = true;
        }

        if (metadataDirty) {
          await this.#persistData();
        }
        if (stateDirty) {
          await this.#persistState();
        }
      })();
    }

    return this.readyPromise;
  }

  async close() {
    await this.writeQueue;
  }

  async getImportState(workspaceId = this.workspaceId) {
    await this.ensureReady();
    return cloneJson(this.#getWorkspaceState(workspaceId).importState || {});
  }

  async setImportState(nextState = {}, workspaceId = this.workspaceId) {
    await this.ensureReady();
    return this.#queueWrite(async () => {
      const previousState = cloneJson(this.state);
      try {
        const workspaceState = this.#getWorkspaceState(workspaceId);
        workspaceState.importState = {
          ...(workspaceState.importState || {}),
          ...cloneJson(nextState)
        };
        await this.#persistState();
        return cloneJson(workspaceState.importState);
      } catch (err) {
        this.state = previousState;
        throw err;
      }
    });
  }

  async getWorkspaceProfile(workspaceId = this.workspaceId) {
    await this.ensureReady();
    const workspace = this.#getWorkspace(workspaceId);
    return cloneJson(workspace.profile || defaultWorkspaceProfile(workspaceId));
  }

  async ensureWorkspaceUser(input = {}) {
    await this.ensureReady();
    const workspaceId = normalizeWorkspaceId(input.workspaceId || input.userId || this.workspaceId);
    if (!workspaceId) {
      throw new Error('workspaceId is required.');
    }

    await this.#queueWrite(async () => {
      const workspace = this.#getWorkspace(workspaceId);
      workspace.displayName = String(input.displayName || input.email || workspace.displayName || this.displayName).trim() || this.displayName;
      workspace.profile = {
        ...defaultWorkspaceProfile(workspaceId),
        ...(workspace.profile || {}),
        workspaceId,
        displayName: workspace.displayName
      };
      this.#getWorkspaceState(workspaceId);
      await this.#persistData();
      await this.#persistState();
    });

    return {
      userId: String(input.userId || workspaceId),
      workspaceId
    };
  }

  async saveNewTemplate(input) {
    return this.#saveVersion({ ...input, templateMode: 'create' });
  }

  async saveNewVersion(input) {
    return this.#saveVersion({ ...input, templateMode: 'version' });
  }

  async #saveVersion(input = {}) {
    await this.ensureReady();

    return this.#queueWrite(async () => {
      const previousData = cloneJson(this.data);
      let blobUpload = null;
      let coverUpload = null;

      try {
        const workspaceId = input.workspaceId || this.workspaceId;
        const workspace = this.#getWorkspace(workspaceId);
        const savedAtIso = new Date(input.savedAt || Date.now()).toISOString();
        const ymd = String(input.ymd || savedAtIso.slice(0, 10)).slice(0, 10);
        const templateId = input.templateId || `tpl_${savedAtIso.slice(0, 10).replace(/-/g, '')}_${crypto.randomUUID().slice(0, 8)}`;
        const versionId = input.versionId || `ver_${crypto.randomUUID()}`;
        const componentBreakdown = normalizeComponentBreakdown(input.componentBreakdown);
        const templateCoverBuffer = toBuffer(input.templateCover?.buffer);
        const templateCoverContentType = String(input.templateCover?.contentType || 'application/octet-stream').trim();

        if (workspace.versions[versionId]) {
          throw new Error(`Template version "${versionId}" already exists.`);
        }

        const existingTemplate = workspace.templates[templateId] || null;
        if (input.templateMode === 'version' && !existingTemplate) {
          throw new Error('Cannot create a version for a template that does not exist.');
        }
        if (input.templateMode === 'create' && existingTemplate) {
          throw new Error(`Template "${templateId}" already exists.`);
        }

        const versionNumber = Number(input.versionNumber) || (
          input.templateMode === 'create'
            ? 1
            : Math.max(
              0,
              ...((existingTemplate?.versionIds || []).map((existingVersionId) => (
                Math.max(0, Math.floor(toFiniteNumber(workspace.versions[existingVersionId]?.versionNumber)))
              )))
            ) + 1
        );

        const resolvedBlobKey = input.canLoad
          ? (input.blobKey || `templates/${workspaceId}/${templateId}/${versionNumber}.json.gz`)
          : null;
        const resolvedCoverBlobKey = templateCoverBuffer
          ? (input.coverBlobKey || `template-covers/${workspaceId}/${templateId}/${versionNumber}.${extensionForContentType(templateCoverContentType)}`)
          : null;

        if (input.canLoad && input.json) {
          blobUpload = await this.blobStore.putJson(resolvedBlobKey, input.json);
        }
        if (templateCoverBuffer && resolvedCoverBlobKey) {
          coverUpload = await this.blobStore.putBuffer(resolvedCoverBlobKey, templateCoverBuffer, {
            contentType: templateCoverContentType,
            cacheControl: 'public, max-age=31536000, immutable'
          });
        }

        const nextTemplate = existingTemplate || {
          templateId,
          workspaceId,
          currentVersionId: null,
          displayName: input.displayName,
          nameSource: input.nameSource,
          status: 'active',
          firstSavedAt: savedAtIso,
          latestSavedAt: savedAtIso,
          archivedAt: null,
          archivedReason: null,
          updatedAt: savedAtIso,
          coverBlobKey: null,
          coverContentType: null,
          coverPrompt: null,
          coverUpdatedAt: null,
          versionIds: []
        };
        const previousCoverBlobKey = existingTemplate?.coverBlobKey || null;

        const versionRecord = {
          versionId,
          workspaceId,
          templateId,
          versionNumber,
          savedAt: savedAtIso,
          ymd,
          displayName: input.displayName,
          nameSource: input.nameSource,
          notes: cloneJson(input.notes || {}),
          fingerprint: input.fingerprint || null,
          canLoad: Boolean(input.canLoad),
          blobKey: resolvedBlobKey,
          blobSizeBytes: Math.max(0, Math.floor(toFiniteNumber(blobUpload?.sizeBytes || input.blobSizeBytes))),
          totalComponents: Math.max(0, Math.floor(toFiniteNumber(input.templateStats?.totalComponents))),
          uniqueTypes: Math.max(0, Math.floor(toFiniteNumber(input.templateStats?.uniqueTypes))),
          conditionalCount: input.templateStats?.conditionalCount == null ? null : Math.max(0, Math.floor(toFiniteNumber(input.templateStats?.conditionalCount))),
          calculationCount: input.templateStats?.calculationCount == null ? null : Math.max(0, Math.floor(toFiniteNumber(input.templateStats?.calculationCount))),
          sessionElapsedMs: input.templateStats?.sessionElapsedMs == null ? null : Math.max(0, Math.floor(toFiniteNumber(input.templateStats?.sessionElapsedMs))),
          maxDepth: Math.max(0, Math.floor(toFiniteNumber(input.maxDepth))),
          advancedFeatureCount: Math.max(0, Math.floor(toFiniteNumber(input.advancedFeatureCount))),
          scores: cloneJson(input.scores || {}),
          actionCounts: cloneJson(input.actionCounts || {}),
          xp: cloneJson(input.xp || {}),
          componentGenome: cloneJson(input.componentGenome || {}),
          telemetry: cloneJson(input.telemetry || {})
        };

        workspace.versions[versionId] = versionRecord;
        workspace.versionComponentCounts[versionId] = componentBreakdown;

        nextTemplate.currentVersionId = versionId;
        nextTemplate.displayName = input.displayName;
        nextTemplate.nameSource = input.nameSource;
        nextTemplate.latestSavedAt = savedAtIso;
        nextTemplate.updatedAt = new Date().toISOString();
        nextTemplate.status = 'active';
        nextTemplate.archivedAt = null;
        nextTemplate.archivedReason = null;
        if (coverUpload?.blobKey) {
          nextTemplate.coverBlobKey = coverUpload.blobKey;
          nextTemplate.coverContentType = templateCoverContentType;
          nextTemplate.coverPrompt = input.templateCover?.prompt || null;
          nextTemplate.coverUpdatedAt = input.templateCover?.updatedAt || savedAtIso;
        }
        if (!Array.isArray(nextTemplate.versionIds)) {
          nextTemplate.versionIds = [];
        }
        nextTemplate.versionIds.push(versionId);
        workspace.templates[templateId] = nextTemplate;

        workspace.profile = {
          ...defaultWorkspaceProfile(workspaceId),
          ...(workspace.profile || {}),
          ...(cloneJson(input.workspaceProfile || {}))
        };

        componentBreakdown.forEach((entry) => {
          workspace.componentTotals[entry.type] = Math.max(
            0,
            Math.floor(toFiniteNumber(workspace.componentTotals[entry.type]))
          ) + entry.count;
        });

        const dailyStats = workspace.dailyStats[ymd] || {
          versionsSaved: 0,
          xpGained: 0,
          masterySum: 0,
          masteryCount: 0
        };
        dailyStats.versionsSaved += 1;
        dailyStats.xpGained += Math.max(0, Math.floor(toFiniteNumber(input.xp?.xpGained)));
        dailyStats.masterySum += Number(toFiniteNumber(input.scores?.masteryScore).toFixed(2));
        dailyStats.masteryCount += 1;
        workspace.dailyStats[ymd] = dailyStats;

        await this.#persistData();

        if (coverUpload?.blobKey && previousCoverBlobKey && previousCoverBlobKey !== coverUpload.blobKey) {
          await this.blobStore.delete(previousCoverBlobKey).catch(() => {});
        }

        return {
          templateId,
          versionId,
          currentVersionId: versionId,
          versionNumber,
          savedAt: savedAtIso,
          blobKey: resolvedBlobKey,
          blobSizeBytes: Math.max(0, Math.floor(toFiniteNumber(blobUpload?.sizeBytes || input.blobSizeBytes))),
          coverBlobKey: coverUpload?.blobKey || nextTemplate.coverBlobKey || null
        };
      } catch (err) {
        this.data = previousData;
        if (blobUpload?.blobKey) {
          await this.blobStore.delete(blobUpload.blobKey).catch(() => {});
        }
        if (coverUpload?.blobKey) {
          await this.blobStore.delete(coverUpload.blobKey).catch(() => {});
        }
        throw err;
      }
    });
  }

  async listTemplates(filters = {}) {
    await this.ensureReady();
    const workspace = this.#getWorkspace(filters.workspaceId || this.workspaceId);
    const limit = Math.min(100, Math.max(1, Math.floor(toFiniteNumber(filters.limit)) || 25));
    const cursor = decodeCursor(filters.cursor);
    const status = String(filters.status || 'active').trim().toLowerCase();
    const search = String(filters.q || '').trim().toLowerCase();
    const canLoadFilter = String(filters.canLoad || 'any').trim().toLowerCase();
    const componentType = String(filters.componentType || '').trim();
    const savedFromTime = parseUtcDayStart(filters.savedFrom);
    const savedToTime = parseUtcDayStart(filters.savedTo);
    const savedToExclusive = savedToTime == null ? null : savedToTime + (24 * 60 * 60 * 1000);

    const filtered = Object.values(workspace.templates || {})
      .filter((template) => {
        const currentVersion = workspace.versions[template.currentVersionId];
        if (!currentVersion) return false;

        if ((status === 'active' || status === 'archived') && template.status !== status) {
          return false;
        }

        if (search && !String(template.displayName || '').toLowerCase().includes(search)) {
          return false;
        }

        const latestSavedTime = parseDate(template.latestSavedAt);
        if (savedFromTime != null && latestSavedTime < savedFromTime) {
          return false;
        }
        if (savedToExclusive != null && latestSavedTime >= savedToExclusive) {
          return false;
        }

        if (canLoadFilter === 'yes' && !currentVersion.canLoad) {
          return false;
        }
        if (canLoadFilter === 'no' && currentVersion.canLoad) {
          return false;
        }

        if (componentType) {
          const counts = workspace.versionComponentCounts[currentVersion.versionId] || [];
          if (!counts.some((entry) => entry.type === componentType && entry.count > 0)) {
            return false;
          }
        }

        if (cursor?.latestSavedAt && cursor?.templateId) {
          const cursorTime = parseDate(cursor.latestSavedAt);
          const templateTime = latestSavedTime;
          if (!(templateTime < cursorTime || (templateTime === cursorTime && String(template.templateId) < String(cursor.templateId)))) {
            return false;
          }
        }

        return true;
      })
      .sort(compareTemplatesDesc);

    const rows = filtered.slice(0, limit + 1);
    const hasMore = rows.length > limit;
    const items = (hasMore ? rows.slice(0, limit) : rows).map((template) => {
      const currentVersion = workspace.versions[template.currentVersionId];
      const topMix = (workspace.versionComponentCounts[currentVersion.versionId] || []).slice(0, 4);
      return buildTemplateSummary(template, currentVersion, cloneJson(topMix));
    });

    const lastItem = items[items.length - 1] || null;
    return {
      items,
      nextCursor: hasMore && lastItem
        ? encodeCursor({
          latestSavedAt: lastItem.latestSavedAt,
          templateId: lastItem.templateId
        })
        : null,
      hasMore
    };
  }

  async getTopMixByVersionIds(versionIds = []) {
    await this.ensureReady();
    const workspace = this.#getWorkspace(this.workspaceId);
    const grouped = new Map();

    Array.from(new Set((versionIds || []).filter(Boolean))).forEach((versionId) => {
      grouped.set(
        versionId,
        cloneJson((workspace.versionComponentCounts[versionId] || []).slice(0, 4))
      );
    });

    return grouped;
  }

  async getTemplateSummary(templateId, workspaceId = this.workspaceId) {
    await this.ensureReady();
    const workspace = this.#getWorkspace(workspaceId);
    const template = workspace.templates[String(templateId || '').trim()];
    if (!template) return null;

    const currentVersion = workspace.versions[template.currentVersionId];
    if (!currentVersion) return null;

    const topMix = (workspace.versionComponentCounts[currentVersion.versionId] || []).slice(0, 4);
    return buildTemplateSummary(template, currentVersion, cloneJson(topMix));
  }

  async getTemplateCover(templateId, workspaceId = this.workspaceId) {
    await this.ensureReady();
    const workspace = this.#getWorkspace(workspaceId);
    const template = workspace.templates[String(templateId || '').trim()];
    if (!template?.coverBlobKey || !template?.coverContentType) {
      return null;
    }

    return {
      templateId: template.templateId,
      contentType: template.coverContentType,
      updatedAt: template.coverUpdatedAt || null,
      buffer: await this.blobStore.getBuffer(template.coverBlobKey)
    };
  }

  async updateTemplateCover(input = {}) {
    await this.ensureReady();

    return this.#queueWrite(async () => {
      const previousData = cloneJson(this.data);
      let coverUpload = null;

      try {
        const workspaceId = input.workspaceId || this.workspaceId;
        const workspace = this.#getWorkspace(workspaceId);
        const templateId = String(input.templateId || '').trim();
        const expectedVersionId = String(input.expectedVersionId || '').trim();
        const template = workspace.templates[templateId];
        const templateCoverBuffer = toBuffer(input.templateCover?.buffer);
        const templateCoverContentType = String(input.templateCover?.contentType || 'application/octet-stream').trim();

        if (!template || !templateCoverBuffer) {
          return { updated: false, reason: template ? 'missing-cover' : 'missing-template' };
        }
        if (expectedVersionId && template.currentVersionId !== expectedVersionId) {
          return { updated: false, reason: 'stale-version' };
        }

        const coverVersionKey = expectedVersionId || template.currentVersionId || 'cover';
        const resolvedCoverBlobKey = input.coverBlobKey || `template-covers/${workspaceId}/${templateId}/${coverVersionKey}.${extensionForContentType(templateCoverContentType)}`;
        const previousCoverBlobKey = template.coverBlobKey || null;

        coverUpload = await this.blobStore.putBuffer(resolvedCoverBlobKey, templateCoverBuffer, {
          contentType: templateCoverContentType,
          cacheControl: 'public, max-age=31536000, immutable'
        });

        template.coverBlobKey = coverUpload.blobKey;
        template.coverContentType = templateCoverContentType;
        template.coverPrompt = input.templateCover?.prompt || null;
        template.coverUpdatedAt = input.templateCover?.updatedAt || new Date().toISOString();
        template.updatedAt = new Date().toISOString();

        await this.#persistData();

        if (previousCoverBlobKey && previousCoverBlobKey !== coverUpload.blobKey) {
          await this.blobStore.delete(previousCoverBlobKey).catch(() => {});
        }

        return {
          updated: true,
          templateId,
          coverBlobKey: coverUpload.blobKey,
          coverUpdatedAt: template.coverUpdatedAt
        };
      } catch (err) {
        this.data = previousData;
        if (coverUpload?.blobKey) {
          await this.blobStore.delete(coverUpload.blobKey).catch(() => {});
        }
        throw err;
      }
    });
  }

  async getTemplateVersionHistory(templateId, options = {}) {
    await this.ensureReady();
    const workspace = this.#getWorkspace(options.workspaceId || this.workspaceId);
    const template = workspace.templates[String(templateId || '').trim()];
    if (!template) {
      return {
        items: [],
        nextCursor: null,
        hasMore: false
      };
    }

    const limit = Math.min(50, Math.max(1, Math.floor(toFiniteNumber(options.limit)) || 10));
    const cursor = decodeCursor(options.cursor);
    const versions = (template.versionIds || [])
      .map((versionId) => workspace.versions[versionId])
      .filter(Boolean)
      .filter((version) => {
        if (cursor?.latestSavedAt && cursor?.templateId) {
          const cursorTime = parseDate(cursor.latestSavedAt);
          const versionTime = parseDate(version.savedAt);
          const cursorVersion = Math.max(0, Math.floor(toFiniteNumber(cursor.templateId)));
          return versionTime < cursorTime
            || (versionTime === cursorTime && Math.max(0, Math.floor(toFiniteNumber(version.versionNumber))) < cursorVersion);
        }
        return true;
      })
      .sort(compareVersionsDesc);

    const rows = versions.slice(0, limit + 1);
    const hasMore = rows.length > limit;
    const items = (hasMore ? rows.slice(0, limit) : rows).map((version) => ({
      versionId: version.versionId,
      versionNumber: Math.max(1, Math.floor(toFiniteNumber(version.versionNumber))),
      savedAt: version.savedAt,
      displayName: version.displayName,
      nameSource: version.nameSource,
      canLoad: Boolean(version.canLoad),
      totalComponents: Math.max(0, Math.floor(toFiniteNumber(version.totalComponents))),
      uniqueTypes: Math.max(0, Math.floor(toFiniteNumber(version.uniqueTypes))),
      conditionalCount: version.conditionalCount == null ? null : Math.max(0, Math.floor(toFiniteNumber(version.conditionalCount))),
      calculationCount: version.calculationCount == null ? null : Math.max(0, Math.floor(toFiniteNumber(version.calculationCount))),
      sessionElapsedMs: version.sessionElapsedMs == null ? null : Math.max(0, Math.floor(toFiniteNumber(version.sessionElapsedMs))),
      topMix: cloneJson((workspace.versionComponentCounts[version.versionId] || []).slice(0, 4))
    }));

    const lastItem = items[items.length - 1] || null;
    return {
      items,
      nextCursor: hasMore && lastItem
        ? encodeCursor({
          latestSavedAt: lastItem.savedAt,
          templateId: lastItem.versionNumber
        })
        : null,
      hasMore
    };
  }

  async getVersionBlob(versionId, workspaceId = this.workspaceId) {
    await this.ensureReady();
    const workspace = this.#getWorkspace(workspaceId);
    const version = workspace.versions[String(versionId || '').trim()];
    if (!version) return null;

    if (!version.canLoad || !version.blobKey) {
      return {
        versionId: version.versionId,
        templateId: version.templateId,
        displayName: version.displayName,
        savedAt: version.savedAt,
        sessionElapsedMs: version.sessionElapsedMs == null ? null : Math.max(0, Math.floor(toFiniteNumber(version.sessionElapsedMs))),
        json: null
      };
    }

    return {
      versionId: version.versionId,
      templateId: version.templateId,
      displayName: version.displayName,
      savedAt: version.savedAt,
      sessionElapsedMs: version.sessionElapsedMs == null ? null : Math.max(0, Math.floor(toFiniteNumber(version.sessionElapsedMs))),
      json: await this.blobStore.getJson(version.blobKey)
    };
  }

  async archiveTemplate(templateId, workspaceId = this.workspaceId) {
    await this.ensureReady();
    return this.#queueWrite(async () => {
      const previousData = cloneJson(this.data);
      try {
        const workspace = this.#getWorkspace(workspaceId);
        const template = workspace.templates[String(templateId || '').trim()];
        if (!template || template.status === 'archived') {
          return null;
        }
        template.status = 'archived';
        template.archivedAt = new Date().toISOString();
        template.updatedAt = new Date().toISOString();
        await this.#persistData();
        return {
          template_id: template.templateId,
          display_name: template.displayName
        };
      } catch (err) {
        this.data = previousData;
        throw err;
      }
    });
  }

  async restoreTemplate(templateId, workspaceId = this.workspaceId) {
    await this.ensureReady();
    return this.#queueWrite(async () => {
      const previousData = cloneJson(this.data);
      try {
        const workspace = this.#getWorkspace(workspaceId);
        const template = workspace.templates[String(templateId || '').trim()];
        if (!template) {
          return null;
        }
        template.status = 'active';
        template.archivedAt = null;
        template.archivedReason = null;
        template.updatedAt = new Date().toISOString();
        await this.#persistData();
        return {
          template_id: template.templateId,
          display_name: template.displayName
        };
      } catch (err) {
        this.data = previousData;
        throw err;
      }
    });
  }

  async getOverview(workspaceId = this.workspaceId) {
    await this.ensureReady();
    const workspace = this.#getWorkspace(workspaceId);
    const versions = Object.values(workspace.versions || {}).sort(compareVersionsDesc);
    const latestVersion = versions[0] || null;
    const trackedVersions = versions.filter((version) => version.sessionElapsedMs != null);
    const sessionElapsedValues = trackedVersions.map((version) => Math.max(0, Math.floor(toFiniteNumber(version.sessionElapsedMs))));
    const longestMs = sessionElapsedValues.length ? Math.max(...sessionElapsedValues) : 0;
    const shortestMs = sessionElapsedValues.length ? Math.min(...sessionElapsedValues) : 0;
    const averageMs = sessionElapsedValues.length
      ? Math.round(sessionElapsedValues.reduce((sum, value) => sum + value, 0) / sessionElapsedValues.length)
      : 0;

    return {
      builderId: workspace.profile.workspaceId || workspaceId,
      templatesSaved: Math.max(0, Math.floor(toFiniteNumber(workspace.profile.templatesSaved))),
      activeTemplates: Object.values(workspace.templates || {}).filter((template) => template.status === 'active').length,
      componentsTotal: Math.max(0, Math.floor(toFiniteNumber(workspace.profile.componentsTotal))),
      xpTotal: Math.max(0, Math.floor(toFiniteNumber(workspace.profile.xpTotal))),
      level: Math.max(1, Math.floor(toFiniteNumber(workspace.profile.level)) || 1),
      nextLevelXp: 0,
      streak: cloneJson(workspace.profile.streak || defaultWorkspaceProfile(workspaceId).streak),
      achievementsUnlocked: cloneJson(workspace.profile.achievementsUnlocked || []),
      handcraftedChain: Math.max(0, Math.floor(toFiniteNumber(workspace.profile.handcraftedChain))),
      neglectedRevivalCount: Math.max(0, Math.floor(toFiniteNumber(workspace.profile.neglectedRevivalCount))),
      topComponents: await this.getTopComponents(workspaceId),
      sessionTimeStats: {
        trackedCount: trackedVersions.length,
        longestMs,
        shortestMs,
        averageMs
      },
      leastUsedTypes: await this.getLeastUsedTypes(workspaceId, 3),
      latestTemplate: latestVersion
        ? {
          versionId: latestVersion.versionId,
          templateId: latestVersion.templateId,
          savedAt: latestVersion.savedAt,
          name: latestVersion.displayName,
          totalComponents: Math.max(0, Math.floor(toFiniteNumber(latestVersion.totalComponents))),
          uniqueTypes: Math.max(0, Math.floor(toFiniteNumber(latestVersion.uniqueTypes)))
        }
        : null,
      latestScores: cloneJson(latestVersion?.scores || {}),
      silentCoach: ''
    };
  }

  async getTopComponents(workspaceId = this.workspaceId, limit) {
    await this.ensureReady();
    const workspace = this.#getWorkspace(workspaceId);
    return Object.entries(workspace.componentTotals || {})
      .map(([type, count]) => ({
        type,
        count: Math.max(0, Math.floor(toFiniteNumber(count)))
      }))
      .filter((entry) => entry.count > 0)
      .sort((a, b) => {
        if (b.count !== a.count) return b.count - a.count;
        return a.type.localeCompare(b.type);
      })
      .slice(0, limit == null ? undefined : limit);
  }

  async getLeastUsedTypes(workspaceId = this.workspaceId, limit = 3) {
    await this.ensureReady();
    const workspace = this.#getWorkspace(workspaceId);
    return Object.entries(workspace.componentTotals || {})
      .map(([type, count]) => ({
        type,
        count: Math.max(0, Math.floor(toFiniteNumber(count)))
      }))
      .sort((a, b) => {
        if (a.count !== b.count) return a.count - b.count;
        return a.type.localeCompare(b.type);
      })
      .slice(0, limit)
      .map((entry) => entry.type);
  }

  async getComponents(workspaceId = this.workspaceId) {
    await this.ensureReady();
    const workspace = this.#getWorkspace(workspaceId);
    const totalComponents = Math.max(0, Math.floor(toFiniteNumber(workspace.profile.componentsTotal)));
    const denominator = Math.max(1, totalComponents);
    const byType = Object.entries(workspace.componentTotals || {})
      .map(([type, count]) => {
        const normalizedCount = Math.max(0, Math.floor(toFiniteNumber(count)));
        return {
          type,
          count: normalizedCount,
          share: Number(((normalizedCount / denominator) * 100).toFixed(2))
        };
      })
      .sort((a, b) => {
        if (b.count !== a.count) return b.count - a.count;
        return a.type.localeCompare(b.type);
      });

    return {
      totalComponents,
      byType,
      leastUsedTypes: await this.getLeastUsedTypes(workspaceId, 3)
    };
  }

  async getBuilderUsageTotals(workspaceId = this.workspaceId) {
    await this.ensureReady();
    const workspace = this.#getWorkspace(workspaceId);
    const totals = {};

    Object.values(workspace.versions || {}).forEach((version) => {
      const manualAddsByType = version?.actionCounts?.manualAddsByType;
      if (!manualAddsByType || typeof manualAddsByType !== 'object') return;

      Object.entries(manualAddsByType).forEach(([type, count]) => {
        const safeType = String(type || '').trim();
        const safeCount = Math.max(0, Math.floor(toFiniteNumber(count)));
        if (!safeType || safeCount < 1) return;
        totals[safeType] = (totals[safeType] || 0) + safeCount;
      });
    });

    return totals;
  }

  async getTimeline(days = 30, workspaceId = this.workspaceId) {
    await this.ensureReady();
    const workspace = this.#getWorkspace(workspaceId);
    const normalizedDays = Math.min(365, Math.max(7, Math.floor(toFiniteNumber(days)) || 30));
    const timeline = [];
    const now = new Date();

    for (let offset = normalizedDays - 1; offset >= 0; offset -= 1) {
      const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - offset));
      const ymd = date.toISOString().slice(0, 10);
      const row = workspace.dailyStats[ymd] || {};
      const masteryCount = Math.max(0, Math.floor(toFiniteNumber(row.masteryCount)));
      timeline.push({
        date: ymd,
        templatesSaved: Math.max(0, Math.floor(toFiniteNumber(row.versionsSaved))),
        xpGained: Math.max(0, Math.floor(toFiniteNumber(row.xpGained))),
        masteryAvg: masteryCount > 0
          ? Number((toFiniteNumber(row.masterySum) / masteryCount).toFixed(2))
          : 0
      });
    }

    return {
      days: normalizedDays,
      timeline
    };
  }

  async resetWorkspace(workspaceId = this.workspaceId) {
    await this.ensureReady();
    await this.#queueWrite(async () => {
      const previousData = cloneJson(this.data);
      try {
        this.data.workspaces[workspaceId] = createEmptyWorkspace(workspaceId, this.displayName);
        await this.#persistData();
      } catch (err) {
        this.data = previousData;
        throw err;
      }
    });

    await this.blobStore.deletePrefix(`templates/${workspaceId}`);
    await this.blobStore.deletePrefix(`template-covers/${workspaceId}`);
    return { ok: true };
  }

  #getWorkspace(workspaceId = this.workspaceId) {
    if (!normalizeWorkspaceId(workspaceId)) {
      throw new Error('workspaceId is required.');
    }
    if (!this.data.workspaces[workspaceId]) {
      this.data.workspaces[workspaceId] = createEmptyWorkspace(workspaceId, this.displayName);
    }
    return this.data.workspaces[workspaceId];
  }

  #getWorkspaceState(workspaceId = this.workspaceId) {
    if (!normalizeWorkspaceId(workspaceId)) {
      throw new Error('workspaceId is required.');
    }
    if (!this.state.workspaces[workspaceId]) {
      this.state.workspaces[workspaceId] = { importState: {} };
    }
    return this.state.workspaces[workspaceId];
  }

  async #queueWrite(task) {
    const run = async () => task();
    const queued = this.writeQueue.then(run, run);
    this.writeQueue = queued.catch(() => {});
    return queued;
  }

  async #persistData() {
    await writeJsonAtomic(this.metadataPath, this.data);
  }

  async #persistState() {
    await writeJsonAtomic(this.statePath, this.state);
  }
}

module.exports = {
  FileTemplateLibraryStore
};
