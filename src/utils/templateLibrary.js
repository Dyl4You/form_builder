const crypto = require('crypto');
const path = require('path');
const pLimit = require('p-limit').default;

const { extractTemplateMetrics, stableStringify, KNOWN_COMPONENT_TYPES } = require('./formMetrics');
const { sanitizeComponentSchema } = require('./formio');
const {
  ACHIEVEMENTS,
  normalizeTelemetry,
  computeMasteryScores,
  computeXp,
  levelFromXp,
  nextLevelXp,
  updateStreak,
  evaluateAchievements,
  buildSilentCoach
} = require('./gamification');
const { createBlobStore, FilesystemBlobStore } = require('../storage/blobStore');
const { FileTemplateLibraryStore } = require('../storage/fileTemplateLibraryStore');
const { PostgresTemplateLibraryStore } = require('../storage/postgresTemplateLibraryStore');
const {
  DEFAULT_LEGACY_DATA_DIR,
  importLegacyTemplateRecords,
  loadLegacyTemplateRecords
} = require('./legacyTemplateImport');
const { createTemplateCoverGenerator } = require('./templateCoverImages');
const {
  getDefaultWorkspaceDisplayName,
  getDefaultWorkspaceId
} = require('../config/runtimeConfig');

function toFiniteNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function pad(n, width) {
  return String(n).padStart(width, '0');
}

function formatDateStamp(date) {
  return `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1, 2)}${pad(date.getUTCDate(), 2)}`;
}

const COMPONENT_TYPE_LABELS = {
  choiceList: 'Choice List',
  datagrid: 'Data Grid',
  datetime: 'Date Time',
  editgrid: 'Edit Grid',
  phoneNumber: 'Phone Number',
  selectboxes: 'Select Boxes',
  textfield: 'Text Field'
};

const COMPONENT_TYPE_PLURAL_LABELS = {
  account: 'Account Fields',
  address: 'Address Fields',
  asset: 'Asset Fields',
  choiceList: 'Choice Lists',
  content: 'Content Blocks',
  currency: 'Currency Fields',
  date: 'Date Fields',
  datagrid: 'Data Grids',
  datetime: 'Date Time Fields',
  disclaimer: 'Disclaimers',
  editgrid: 'Edit Grids',
  fieldset: 'Fieldsets',
  file: 'File Uploads',
  number: 'Number Fields',
  phoneNumber: 'Phone Number Fields',
  radio: 'Radio Groups',
  select: 'Select Fields',
  selectboxes: 'Select Boxes',
  survey: 'Survey Questions',
  textfield: 'Text Fields',
  textarea: 'Text Areas',
  time: 'Time Fields'
};

function humanizeComponentType(type) {
  const raw = String(type || '').trim();
  if (!raw) return '';
  if (COMPONENT_TYPE_LABELS[raw]) return COMPONENT_TYPE_LABELS[raw];
  return raw
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function humanizeComponentTypePlural(type) {
  const raw = String(type || '').trim();
  if (!raw) return '';
  if (COMPONENT_TYPE_PLURAL_LABELS[raw]) return COMPONENT_TYPE_PLURAL_LABELS[raw];

  const singular = humanizeComponentType(raw);
  if (!singular) return '';
  if (/[sxz]$/i.test(singular) || /(ch|sh)$/i.test(singular)) return `${singular}es`;
  if (/[^aeiou]y$/i.test(singular)) return `${singular.slice(0, -1)}ies`;
  return `${singular}s`;
}

function sortTypeEntries(entries) {
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

function buildGeneratedTemplateName(componentBreakdown) {
  const labels = sortTypeEntries(componentBreakdown)
    .slice(0, 3)
    .map((entry) => humanizeComponentTypePlural(entry.type))
    .filter(Boolean);

  if (!labels.length) return 'Empty Template';
  return `${labels.join(' + ')} Template`;
}

function labelForTemplateNameSource(source) {
  return source === 'generated' ? 'Auto Label' : 'Saved Name';
}

function inferTemplateNameSource(rawName, generatedName, explicitSource) {
  const normalizedSource = String(explicitSource || '').trim().toLowerCase();
  if (normalizedSource === 'generated') return 'generated';
  if (normalizedSource === 'manual' || normalizedSource === 'ai') return 'manual';

  const trimmed = String(rawName || '').trim();
  if (!trimmed || trimmed.toLowerCase() === 'untitled template') return 'generated';
  if (trimmed === generatedName) return 'generated';
  return 'manual';
}

function resolveTemplateNameMeta(rawName, componentBreakdown, explicitSource) {
  const trimmed = String(rawName || '').trim();
  const generatedName = buildGeneratedTemplateName(componentBreakdown);
  const source = inferTemplateNameSource(rawName, generatedName, explicitSource);
  const resolvedName = trimmed && trimmed.toLowerCase() !== 'untitled template'
    ? trimmed
    : generatedName;

  return {
    name: resolvedName,
    source,
    isGenerated: source !== 'manual',
    label: labelForTemplateNameSource(source)
  };
}

function buildTemplateFingerprintStateKey(nameMeta, fingerprint) {
  if (nameMeta?.source === 'manual') {
    return String(nameMeta?.name || '').trim();
  }

  const safeFingerprint = String(fingerprint || '').trim();
  return safeFingerprint ? `auto:${safeFingerprint}` : String(nameMeta?.name || '').trim();
}

function hashTemplate(formJson) {
  const normalized = stableStringify(formJson || { components: [] });
  return crypto.createHash('sha1').update(normalized).digest('hex');
}

function getLeastUsedTypes(componentTypeTotals, count = 3) {
  return KNOWN_COMPONENT_TYPES
    .map((type) => ({ type, count: toFiniteNumber(componentTypeTotals?.[type]) }))
    .sort((a, b) => {
      if (a.count !== b.count) return a.count - b.count;
      return a.type.localeCompare(b.type);
    })
    .slice(0, count)
    .map((entry) => entry.type);
}

function buildTypeTotals(entries = []) {
  return (entries || []).reduce((acc, entry) => {
    const type = String(entry?.type || '').trim();
    if (!type) return acc;
    acc[type] = Math.max(0, Math.floor(toFiniteNumber(entry.count)));
    return acc;
  }, {});
}

function buildTemplateCoverUrl(summary = {}) {
  if (!summary?.hasCoverImage || !summary?.templateId) return null;
  const cacheVersion = summary.coverUpdatedAt || summary.currentVersionId || summary.savedAt || 'cover';
  return `/api/templates/${encodeURIComponent(summary.templateId)}/cover?v=${encodeURIComponent(cacheVersion)}`;
}

function isExplicitlyEnabled(value) {
  return ['1', 'true', 'yes', 'on', 'enabled'].includes(String(value || '').trim().toLowerCase());
}

function decorateTemplateSummary(summary) {
  if (!summary) return null;
  return {
    ...summary,
    coverImageUrl: buildTemplateCoverUrl(summary)
  };
}

function summarizeTemplateMetrics(templateMetrics = {}) {
  const topMix = sortTypeEntries(templateMetrics.componentBreakdown || templateMetrics.topTypes).slice(0, 4);
  return {
    totalComponents: Math.max(0, Math.floor(toFiniteNumber(templateMetrics.totalComponents))),
    uniqueTypes: Math.max(0, Math.floor(toFiniteNumber(templateMetrics.uniqueTypes))),
    conditionalCount: Math.max(0, Math.floor(toFiniteNumber(templateMetrics.conditionalCount))),
    calculationCount: Math.max(0, Math.floor(toFiniteNumber(templateMetrics.calculationCount))),
    topMix
  };
}

function mergeTemplateSummaryMetrics(summary, templateMetrics) {
  if (!summary || !templateMetrics) return summary;
  return {
    ...summary,
    ...summarizeTemplateMetrics(templateMetrics)
  };
}

function accumulateComponentBreakdown(totals, componentBreakdown = []) {
  sortTypeEntries(componentBreakdown).forEach((entry) => {
    totals[entry.type] = (totals[entry.type] || 0) + entry.count;
  });
}

function normalizeBody(body = {}) {
  const name = String(body.name || '').trim();
  const rawJson = (body.json && typeof body.json === 'object' && !Array.isArray(body.json))
    ? body.json
    : { components: Array.isArray(body.json) ? body.json : [] };
  const json = JSON.parse(JSON.stringify(rawJson));
  if (!Array.isArray(json.components)) {
    json.components = [];
  }
  sanitizeComponentSchema(json.components);

  const notesFromLegacy = {
    implemented: typeof body.implTxt === 'string' ? body.implTxt : '',
    issues: typeof body.issuesTxt === 'string' ? body.issuesTxt : ''
  };

  const notesObj = (body.notes && typeof body.notes === 'object') ? body.notes : notesFromLegacy;
  const notes = {
    implemented: String(notesObj.implemented || '').trim(),
    issues: String(notesObj.issues || '').trim()
  };

  return {
    name,
    json,
    notes,
    telemetry: normalizeTelemetry(body.telemetry || {})
  };
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

function createTemplateLibraryService(options = {}) {
  const workspaceId = getDefaultWorkspaceId(process.env, options);
  const workspaceDisplayName = getDefaultWorkspaceDisplayName(process.env, options);
  const logger = options.logger === undefined ? console : options.logger;
  const hasConfiguredPostgres = Boolean(options.pool || options.connectionString || process.env.DATABASE_URL);
  const localStoreRoot = options.storeRootDir || process.env.TEMPLATE_LIBRARY_ROOT || path.join(__dirname, '..', '..', 'data', 'template-library');
  const localBlobRoot = options.localBlobRoot || path.join(localStoreRoot, 'blobs');
  const blobStore = options.blobStore || (
    hasConfiguredPostgres
      ? createBlobStore(options.blobStoreOptions || {})
      : new FilesystemBlobStore({ rootDir: localBlobRoot })
  );
  const store = options.store || (
    hasConfiguredPostgres
      ? new PostgresTemplateLibraryStore({
        blobStore,
        pool: options.pool,
        connectionString: options.connectionString,
        workspaceId,
        workspaceDisplayName
      })
      : new FileTemplateLibraryStore({
        blobStore,
        rootDir: localStoreRoot,
        workspaceId,
        workspaceDisplayName
      })
  );
  const storeKind = options.storeKind || (
    typeof store.getStoreKind === 'function'
      ? store.getStoreKind()
      : (hasConfiguredPostgres ? 'postgres' : 'file')
  );
  const legacyDataDir = options.legacyDataDir || DEFAULT_LEGACY_DATA_DIR;
  const templateCoverGenerator = typeof options.templateCoverGenerator === 'function'
    ? options.templateCoverGenerator
    : createTemplateCoverGenerator({
      ...(options.templateCoverOptions || {}),
      logger
    });
  const templateCoverGenerationEnabled = typeof options.templateCoverGenerator === 'function'
    ? true
    : Boolean(templateCoverGenerator?.isEnabled);
  const templateCoverConcurrency = Math.max(
    1,
    Number.parseInt(process.env.OPENAI_TEMPLATE_COVER_CONCURRENCY || '', 10) || 1
  );
  const regenerateCoverOnVersionSave = isExplicitlyEnabled(process.env.OPENAI_TEMPLATE_COVER_REGENERATE_ON_VERSION);
  const templateCoverQueue = pLimit(templateCoverConcurrency);
  const reportMetricsQueue = pLimit(6);
  const backgroundCoverJobs = new Set();
  const liveMetricsByVersionId = new Map();
  const workspaceServices = new Map();
  let initializationPromise = null;

  function assertWorkspaceConfigured() {
    if (workspaceId) return;
    throw new Error('workspaceId is required. Use service.forWorkspace(...) before calling this method.');
  }

  async function loadLiveTemplateMetrics(versionId) {
    const safeVersionId = String(versionId || '').trim();
    if (!safeVersionId) return null;

    if (!liveMetricsByVersionId.has(safeVersionId)) {
      liveMetricsByVersionId.set(safeVersionId, reportMetricsQueue(async () => {
        const record = await store.getVersionBlob(safeVersionId, workspaceId);
        if (!record?.json) return null;
        return extractTemplateMetrics(record.json);
      }));
    }

    try {
      return await liveMetricsByVersionId.get(safeVersionId);
    } catch (err) {
      liveMetricsByVersionId.delete(safeVersionId);
      throw err;
    }
  }

  async function decorateTemplateSummaryForReports(summary) {
    if (!summary) return null;

    let nextSummary = summary;
    if (summary.canLoad && summary.currentVersionId) {
      const liveMetrics = await loadLiveTemplateMetrics(summary.currentVersionId);
      if (liveMetrics) {
        nextSummary = mergeTemplateSummaryMetrics(summary, liveMetrics);
      }
    }

    return decorateTemplateSummary(nextSummary);
  }

  async function decorateTemplateVersionForReports(version) {
    if (!version) return null;
    if (!version.canLoad || !version.versionId) return version;

    const liveMetrics = await loadLiveTemplateMetrics(version.versionId);
    return liveMetrics
      ? {
        ...version,
        ...summarizeTemplateMetrics(liveMetrics)
      }
      : version;
  }

  async function buildOverviewTopComponentsFromCurrentTemplates() {
    const componentTotals = {};
    let cursor = null;
    let hasMore = true;

    while (hasMore) {
      const page = await store.listTemplates({
        workspaceId,
        status: 'all',
        limit: 100,
        cursor
      });

      const breakdowns = await Promise.all((page.items || []).map(async (item) => {
        if (item?.canLoad && item.currentVersionId) {
          const liveMetrics = await loadLiveTemplateMetrics(item.currentVersionId);
          if (liveMetrics?.componentBreakdown) {
            return liveMetrics.componentBreakdown;
          }
        }
        return item?.topMix || [];
      }));

      breakdowns.forEach((componentBreakdown) => {
        accumulateComponentBreakdown(componentTotals, componentBreakdown);
      });

      hasMore = Boolean(page?.hasMore);
      cursor = page?.nextCursor || null;
      if (!hasMore || !cursor) break;
    }

    return Object.entries(componentTotals)
      .map(([type, count]) => ({
        type,
        count: Math.max(0, Math.floor(toFiniteNumber(count)))
      }))
      .filter((entry) => entry.count > 0)
      .sort((a, b) => {
        if (b.count !== a.count) return b.count - a.count;
        return a.type.localeCompare(b.type);
      })
      .slice(0, 5);
  }

  async function prepareSavePayload(body = {}, saveContext = {}) {
    const payload = normalizeBody(body);
    const savedAtDate = new Date(saveContext.savedAt || Date.now());
    const savedAt = savedAtDate.toISOString();
    const activeYmd = savedAt.slice(0, 10);
    const workspaceProfile = {
      ...defaultWorkspaceProfile(workspaceId),
      ...(await store.getWorkspaceProfile(workspaceId))
    };

    const templateMetrics = extractTemplateMetrics(payload.json);
    const templateNameMeta = resolveTemplateNameMeta(payload.name, templateMetrics.componentBreakdown, saveContext.nameSource);
    const resolvedName = templateNameMeta.name;
    const computedScores = computeMasteryScores(templateMetrics, payload.telemetry);
    const scores = {
      ...computedScores,
      ...(saveContext.scores || {})
    };
    scores.actionCounts = saveContext.actionCounts || saveContext.scores?.actionCounts || computedScores.actionCounts;
    const sessionElapsedMs = Math.max(0, Math.floor(toFiniteNumber(
      saveContext.sessionElapsedMs != null
        ? saveContext.sessionElapsedMs
        : scores.actionCounts?.sessionElapsedMs
    )));
    const typeTotals = buildTypeTotals(await store.getTopComponents(workspaceId, KNOWN_COMPONENT_TYPES.length));
    const leastUsedBefore = getLeastUsedTypes(typeTotals, 3);
    const fingerprint = saveContext.fingerprint || hashTemplate(payload.json);
    const fingerprintStateKey = buildTemplateFingerprintStateKey(templateNameMeta, fingerprint);
    const prevFingerprintState = workspaceProfile.lastFingerprintByTemplateName?.[fingerprintStateKey];

    let spamDuplicate = false;
    if (prevFingerprintState && prevFingerprintState.fingerprint === fingerprint && prevFingerprintState.savedAt) {
      const prevTime = new Date(prevFingerprintState.savedAt).getTime();
      const nowTime = savedAtDate.getTime();
      if (Number.isFinite(prevTime) && (nowTime - prevTime) < 24 * 60 * 60 * 1000) {
        spamDuplicate = true;
      }
    }

    const noveltyHit = leastUsedBefore.some((type) => (templateMetrics.typeCounts?.[type] || 0) > 0);
    const nextStreak = updateStreak(workspaceProfile.streak, activeYmd);
    const xpBreakdown = saveContext.xp || computeXp({
      masteryScore: scores.masteryScore,
      manualActions: scores.actionCounts.manualActions,
      noveltyHit,
      streakCurrent: nextStreak.current,
      spamDuplicate
    });

    const nextProfile = {
      ...workspaceProfile,
      templatesSaved: Math.max(0, Math.floor(toFiniteNumber(workspaceProfile.templatesSaved))) + 1,
      componentsTotal: Math.max(0, Math.floor(toFiniteNumber(workspaceProfile.componentsTotal))) + templateMetrics.totalComponents,
      xpTotal: Math.max(0, Math.floor(toFiniteNumber(workspaceProfile.xpTotal))) + Math.max(0, Math.floor(toFiniteNumber(xpBreakdown.xpGained))),
      streak: nextStreak,
      handcraftedChain: scores.actionCounts.aiActions === 0 && scores.actionCounts.manualActions > 0
        ? Math.max(0, Math.floor(toFiniteNumber(workspaceProfile.handcraftedChain))) + 1
        : 0,
      neglectedRevivalCount: noveltyHit && scores.actionCounts.manualActions > 0
        ? Math.max(0, Math.floor(toFiniteNumber(workspaceProfile.neglectedRevivalCount))) + 1
        : Math.max(0, Math.floor(toFiniteNumber(workspaceProfile.neglectedRevivalCount))),
      lastFingerprintByTemplateName: {
        ...(workspaceProfile.lastFingerprintByTemplateName || {}),
        [fingerprintStateKey]: {
          fingerprint,
          savedAt
        }
      }
    };

    nextProfile.level = saveContext.level || levelFromXp(nextProfile.xpTotal);
    const achievementState = evaluateAchievements({
      profile: nextProfile,
      metrics: templateMetrics
    });
    nextProfile.achievementsUnlocked = saveContext.achievementsUnlocked || achievementState.achievementsUnlocked;

    return {
      payload,
      activeYmd,
      savedAt,
      resolvedName,
      templateNameMeta,
      templateMetrics,
      scores,
      sessionElapsedMs,
      noveltyHit,
      spamDuplicate,
      leastUsedBefore,
      fingerprint,
      xpBreakdown,
      nextProfile,
      achievementState
    };
  }

  async function importLegacyTemplateInternal(record = {}) {
    const prepared = await prepareSavePayload({
      name: record.name,
      json: record.json,
      notes: record.notes,
      telemetry: record.telemetry
    }, {
      savedAt: record.savedAt,
      nameSource: record.nameSource,
      fingerprint: record.fingerprint,
      scores: record.scores,
      actionCounts: record.actionCounts,
      xp: record.xp,
      achievementsUnlocked: record.achievementsUnlocked,
      level: record.level
    });

    const canLoad = Boolean(record.json && typeof record.json === 'object');
    const legacyComponentBreakdown = record.templateStats?.componentBreakdown
      || record.templateStats?.topTypes
      || prepared.templateMetrics.componentBreakdown;
    const legacyComplexitySignature = record.componentGenome?.complexitySignature || {};

    return store.saveNewTemplate({
      workspaceId,
      templateId: record.templateId || `tpl_${formatDateStamp(new Date(prepared.savedAt))}_${crypto.randomUUID().slice(0, 8)}`,
      versionId: record.versionId,
      versionNumber: 1,
      displayName: prepared.resolvedName,
      nameSource: record.nameSource || prepared.templateNameMeta.source,
      notes: prepared.payload.notes,
      json: canLoad ? prepared.payload.json : null,
      fingerprint: record.fingerprint || prepared.fingerprint,
      templateStats: {
        totalComponents: record.templateStats?.totalComponents ?? prepared.templateMetrics.totalComponents,
        uniqueTypes: record.templateStats?.uniqueTypes ?? prepared.templateMetrics.uniqueTypes,
        conditionalCount: record.templateStats?.conditionalCount ?? prepared.templateMetrics.conditionalCount,
        calculationCount: record.templateStats?.calculationCount ?? prepared.templateMetrics.calculationCount,
        sessionElapsedMs: record.templateStats?.sessionElapsedMs ?? prepared.sessionElapsedMs
      },
      maxDepth: legacyComplexitySignature.maxDepth ?? prepared.templateMetrics.maxDepth,
      advancedFeatureCount: legacyComplexitySignature.advancedFeatureCount ?? prepared.templateMetrics.advancedFeatureCount,
      scores: record.scores || {
        diversityScore: prepared.scores.diversityScore,
        balanceScore: prepared.scores.balanceScore,
        complexityScore: prepared.scores.complexityScore,
        craftScore: prepared.scores.craftScore,
        masteryScore: prepared.scores.masteryScore
      },
      actionCounts: record.actionCounts || prepared.scores.actionCounts,
      xp: record.xp || prepared.xpBreakdown,
      componentGenome: record.componentGenome || prepared.templateMetrics.componentGenome,
      telemetry: prepared.payload.telemetry,
      componentBreakdown: legacyComponentBreakdown,
      canLoad,
      savedAt: record.savedAt || prepared.savedAt,
      ymd: record.ymd || prepared.activeYmd,
      workspaceProfile: {
        ...(await store.getWorkspaceProfile(workspaceId)),
        ...(record.workspaceProfile || prepared.nextProfile)
      }
    });
  }

  async function ensureLegacyImportIfNeeded() {
    if (storeKind !== 'file' || options.skipLegacyBootstrap) {
      return {
        status: 'skipped',
        reason: storeKind === 'file' ? 'disabled' : 'not-applicable',
        importedCount: 0
      };
    }

    const importState = typeof store.getImportState === 'function'
      ? await store.getImportState(workspaceId)
      : {};

    if (importState?.legacyImportCompletedAt) {
      return {
        status: 'skipped',
        reason: 'already-imported',
        importedCount: Math.max(0, Math.floor(toFiniteNumber(importState.legacyImportCount)))
      };
    }

    const existing = await store.listTemplates({
      workspaceId,
      status: 'all',
      limit: 1
    });
    if (existing.items.length) {
      return {
        status: 'skipped',
        reason: 'store-not-empty',
        importedCount: 0
      };
    }

    const { records, source } = await loadLegacyTemplateRecords({ dataDir: legacyDataDir });
    if (!records.length) {
      return {
        status: 'skipped',
        reason: 'no-legacy-templates',
        importedCount: 0
      };
    }

    const importedCount = await importLegacyTemplateRecords(records, importLegacyTemplateInternal);
    if (typeof store.setImportState === 'function') {
      await store.setImportState({
        legacyImportCompletedAt: new Date().toISOString(),
        legacyImportCount: importedCount,
        legacyTemplatesPath: source.templatesPath,
        legacyEventsPath: source.eventsPath
      }, workspaceId);
    }

    return {
      status: 'imported',
      reason: 'legacy-data-found',
      importedCount
    };
  }

  async function ensureReady() {
    if (!initializationPromise) {
      initializationPromise = (async () => {
        await store.ensureReady();
        const importResult = await ensureLegacyImportIfNeeded();
        if (options.logInitialization !== false && logger?.info) {
          logger.info(
            `[template-library] store=${storeKind} legacy-import=${importResult.status}` +
            (importResult.reason ? ` reason=${importResult.reason}` : '') +
            ` imported=${importResult.importedCount}`
          );
        }
        return {
          storeKind,
          legacyImport: importResult
        };
      })().catch((err) => {
        initializationPromise = null;
        throw err;
      });
    }

    return initializationPromise;
  }

  async function maybeGenerateTemplateCover(templateId, prepared) {
    if (typeof templateCoverGenerator !== 'function') return null;

    const startedAt = Date.now();
    try {
      const cover = await templateCoverGenerator({
        templateId,
        displayName: prepared.resolvedName,
        fingerprint: prepared.fingerprint,
        componentBreakdown: prepared.templateMetrics.componentBreakdown,
        json: prepared.payload.json
      });
      if (cover && logger?.info) {
        logger.info(`[template-cover] generated template=${templateId} duration_ms=${Date.now() - startedAt}`);
      }
      return cover;
    } catch (err) {
      if (logger?.warn) {
        logger.warn(
          `[template-cover] generation failed template=${templateId} duration_ms=${Date.now() - startedAt}: ${err?.message || err}`
        );
      }
      return null;
    }
  }

  function trackBackgroundCoverJob(jobPromise) {
    backgroundCoverJobs.add(jobPromise);
    jobPromise.finally(() => {
      backgroundCoverJobs.delete(jobPromise);
    });
  }

  function queueTemplateCoverGeneration(templateId, expectedVersionId, prepared) {
    if (!templateCoverGenerationEnabled || typeof store.updateTemplateCover !== 'function') {
      return;
    }

    const job = templateCoverQueue(async () => {
      const latest = await store.getTemplateSummary(String(templateId || '').trim(), workspaceId);
      if (!latest || latest.currentVersionId !== String(expectedVersionId || '').trim()) {
        return null;
      }

      const templateCover = await maybeGenerateTemplateCover(templateId, prepared);
      if (!templateCover) {
        return null;
      }

      return store.updateTemplateCover({
        workspaceId,
        templateId,
        expectedVersionId,
        templateCover
      });
    }).catch((err) => {
      if (logger?.warn) {
        logger.warn(`[template-cover] background update failed: ${err?.message || err}`);
      }
      return null;
    });

    trackBackgroundCoverJob(job);
  }

  async function createTemplate(body = {}) {
    assertWorkspaceConfigured();
    await ensureReady();
    const prepared = await prepareSavePayload(body);
    const now = new Date(prepared.savedAt);
    const templateId = `tpl_${formatDateStamp(now)}_${crypto.randomUUID().slice(0, 8)}`;
    const result = await store.saveNewTemplate({
      workspaceId,
      templateId,
      displayName: prepared.resolvedName,
      nameSource: prepared.templateNameMeta.source,
      notes: prepared.payload.notes,
      json: prepared.payload.json,
      fingerprint: prepared.fingerprint,
      templateStats: {
        totalComponents: prepared.templateMetrics.totalComponents,
        uniqueTypes: prepared.templateMetrics.uniqueTypes,
        conditionalCount: prepared.templateMetrics.conditionalCount,
        calculationCount: prepared.templateMetrics.calculationCount,
        sessionElapsedMs: prepared.sessionElapsedMs
      },
      maxDepth: prepared.templateMetrics.maxDepth,
      advancedFeatureCount: prepared.templateMetrics.advancedFeatureCount,
      scores: {
        diversityScore: prepared.scores.diversityScore,
        balanceScore: prepared.scores.balanceScore,
        complexityScore: prepared.scores.complexityScore,
        craftScore: prepared.scores.craftScore,
        masteryScore: prepared.scores.masteryScore
      },
      actionCounts: prepared.scores.actionCounts,
      xp: prepared.xpBreakdown,
      componentGenome: prepared.templateMetrics.componentGenome,
      telemetry: prepared.payload.telemetry,
      componentBreakdown: prepared.templateMetrics.componentBreakdown,
      canLoad: true,
      savedAt: prepared.savedAt,
      ymd: prepared.activeYmd,
      workspaceProfile: prepared.nextProfile
    });
    queueTemplateCoverGeneration(result.templateId, result.versionId, prepared);

    return {
      ok: true,
      templateId: result.templateId,
      versionId: result.versionId,
      name: prepared.resolvedName,
      nameSource: prepared.templateNameMeta.source,
      savedAt: prepared.savedAt,
      hasCoverImage: false,
      coverImageUrl: null,
      coverGenerationPending: templateCoverGenerationEnabled,
      templateStats: {
        totalComponents: prepared.templateMetrics.totalComponents,
        uniqueTypes: prepared.templateMetrics.uniqueTypes,
        componentBreakdown: prepared.templateMetrics.componentBreakdown,
        topTypes: prepared.templateMetrics.topTypes,
        conditionalCount: prepared.templateMetrics.conditionalCount,
        calculationCount: prepared.templateMetrics.calculationCount,
        sessionElapsedMs: prepared.sessionElapsedMs
      },
      progression: {
        xpGained: prepared.xpBreakdown.xpGained,
        xpTotal: prepared.nextProfile.xpTotal,
        level: prepared.nextProfile.level,
        nextLevelXp: nextLevelXp(prepared.nextProfile.level),
        achievementsUnlocked: prepared.achievementState.newlyUnlocked
      },
      scores: {
        diversityScore: prepared.scores.diversityScore,
        balanceScore: prepared.scores.balanceScore,
        complexityScore: prepared.scores.complexityScore,
        craftScore: prepared.scores.craftScore,
        masteryScore: prepared.scores.masteryScore
      },
      silentCoach: buildSilentCoach(prepared.scores)
    };
  }

  async function createTemplateVersion(templateId, body = {}) {
    assertWorkspaceConfigured();
    await ensureReady();
    const trimmedTemplateId = String(templateId || '').trim();
    if (!trimmedTemplateId) {
      throw new Error('A templateId is required to create a new version.');
    }

    const existing = await store.getTemplateSummary(trimmedTemplateId, workspaceId);
    if (!existing) {
      throw new Error('Saved template not found.');
    }

    const prepared = await prepareSavePayload(body);
    const result = await store.saveNewVersion({
      workspaceId,
      templateId: trimmedTemplateId,
      currentVersionId: existing.currentVersionId,
      displayName: prepared.resolvedName,
      nameSource: prepared.templateNameMeta.source,
      notes: prepared.payload.notes,
      json: prepared.payload.json,
      fingerprint: prepared.fingerprint,
      templateStats: {
        totalComponents: prepared.templateMetrics.totalComponents,
        uniqueTypes: prepared.templateMetrics.uniqueTypes,
        conditionalCount: prepared.templateMetrics.conditionalCount,
        calculationCount: prepared.templateMetrics.calculationCount,
        sessionElapsedMs: prepared.sessionElapsedMs
      },
      maxDepth: prepared.templateMetrics.maxDepth,
      advancedFeatureCount: prepared.templateMetrics.advancedFeatureCount,
      scores: {
        diversityScore: prepared.scores.diversityScore,
        balanceScore: prepared.scores.balanceScore,
        complexityScore: prepared.scores.complexityScore,
        craftScore: prepared.scores.craftScore,
        masteryScore: prepared.scores.masteryScore
      },
      actionCounts: prepared.scores.actionCounts,
      xp: prepared.xpBreakdown,
      componentGenome: prepared.templateMetrics.componentGenome,
      telemetry: prepared.payload.telemetry,
      componentBreakdown: prepared.templateMetrics.componentBreakdown,
      canLoad: true,
      savedAt: prepared.savedAt,
      ymd: prepared.activeYmd,
      workspaceProfile: prepared.nextProfile
    });
    queueTemplateCoverGeneration(result.templateId, result.versionId, prepared);

    return {
      ok: true,
      templateId: result.templateId,
      versionId: result.versionId,
      name: prepared.resolvedName,
      nameSource: prepared.templateNameMeta.source,
      savedAt: prepared.savedAt,
      hasCoverImage: Boolean(existing.hasCoverImage),
      coverImageUrl: existing.hasCoverImage
        ? `/api/templates/${encodeURIComponent(result.templateId)}/cover?v=${encodeURIComponent(existing.coverUpdatedAt || result.versionId)}`
        : null,
      coverGenerationPending: templateCoverGenerationEnabled && (!existing.hasCoverImage || regenerateCoverOnVersionSave),
      templateStats: {
        totalComponents: prepared.templateMetrics.totalComponents,
        uniqueTypes: prepared.templateMetrics.uniqueTypes,
        componentBreakdown: prepared.templateMetrics.componentBreakdown,
        topTypes: prepared.templateMetrics.topTypes,
        conditionalCount: prepared.templateMetrics.conditionalCount,
        calculationCount: prepared.templateMetrics.calculationCount,
        sessionElapsedMs: prepared.sessionElapsedMs
      },
      progression: {
        xpGained: prepared.xpBreakdown.xpGained,
        xpTotal: prepared.nextProfile.xpTotal,
        level: prepared.nextProfile.level,
        nextLevelXp: nextLevelXp(prepared.nextProfile.level),
        achievementsUnlocked: prepared.achievementState.newlyUnlocked
      },
      scores: {
        diversityScore: prepared.scores.diversityScore,
        balanceScore: prepared.scores.balanceScore,
        complexityScore: prepared.scores.complexityScore,
        craftScore: prepared.scores.craftScore,
        masteryScore: prepared.scores.masteryScore
      },
      silentCoach: buildSilentCoach(prepared.scores)
    };
  }

  async function listTemplates(filters = {}) {
    assertWorkspaceConfigured();
    await ensureReady();
    const result = await store.listTemplates({
      workspaceId,
      ...filters
    });
    return {
      ...result,
      items: await Promise.all((result.items || []).map((item) => decorateTemplateSummaryForReports(item)))
    };
  }

  async function getTemplateById(templateId) {
    assertWorkspaceConfigured();
    await ensureReady();
    return decorateTemplateSummaryForReports(
      await store.getTemplateSummary(String(templateId || '').trim(), workspaceId)
    );
  }

  async function getTemplateVersions(templateId, options = {}) {
    assertWorkspaceConfigured();
    await ensureReady();
    const result = await store.getTemplateVersionHistory(String(templateId || '').trim(), {
      workspaceId,
      ...options
    });
    return {
      ...result,
      items: await Promise.all((result.items || []).map((item) => decorateTemplateVersionForReports(item)))
    };
  }

  async function getTemplateVersionBlob(versionId) {
    assertWorkspaceConfigured();
    await ensureReady();
    const record = await store.getVersionBlob(String(versionId || '').trim(), workspaceId);
    if (!record) return null;
    return {
      versionId: record.versionId,
      templateId: record.templateId,
      name: record.displayName,
      savedAt: record.savedAt,
      sessionElapsedMs: record.sessionElapsedMs == null ? null : Math.max(0, Math.floor(toFiniteNumber(record.sessionElapsedMs))),
      json: record.json
    };
  }

  async function getTemplateCover(templateId) {
    assertWorkspaceConfigured();
    await ensureReady();
    return store.getTemplateCover(String(templateId || '').trim(), workspaceId);
  }

  async function archiveTemplate(templateId) {
    assertWorkspaceConfigured();
    await ensureReady();
    return store.archiveTemplate(String(templateId || '').trim(), workspaceId);
  }

  async function restoreTemplate(templateId) {
    assertWorkspaceConfigured();
    await ensureReady();
    return store.restoreTemplate(String(templateId || '').trim(), workspaceId);
  }

  async function getOverview() {
    assertWorkspaceConfigured();
    await ensureReady();
    const overview = await store.getOverview(workspaceId);
    const topComponents = await buildOverviewTopComponentsFromCurrentTemplates();
    return {
      ...overview,
      topComponents: topComponents.length ? topComponents : overview.topComponents,
      nextLevelXp: nextLevelXp(overview.level),
      silentCoach: buildSilentCoach(overview.latestScores || {})
    };
  }

  async function getComponents() {
    assertWorkspaceConfigured();
    await ensureReady();
    return store.getComponents(workspaceId);
  }

  async function getBuilderUsageTotals() {
    assertWorkspaceConfigured();
    await ensureReady();
    return store.getBuilderUsageTotals(workspaceId);
  }

  async function getTimeline(daysQuery) {
    assertWorkspaceConfigured();
    await ensureReady();
    const n = Number(daysQuery);
    const days = Number.isFinite(n) ? n : 30;
    return store.getTimeline(days, workspaceId);
  }

  async function resetStats() {
    assertWorkspaceConfigured();
    await ensureReady();
    return store.resetWorkspace(workspaceId);
  }

  async function importLegacyTemplate(record = {}) {
    assertWorkspaceConfigured();
    await ensureReady();
    return importLegacyTemplateInternal(record);
  }

  async function ensureWorkspaceUser(user = {}) {
    const resolvedWorkspaceId = String(user.workspaceId || workspaceId || '').trim();
    if (!resolvedWorkspaceId) {
      throw new Error('workspaceId is required.');
    }

    const resolvedDisplayName = String(user.displayName || workspaceDisplayName || '').trim() || workspaceDisplayName;
    const scopedService = resolvedWorkspaceId === workspaceId
      ? serviceApi
      : forWorkspace({
        workspaceId: resolvedWorkspaceId,
        workspaceDisplayName: resolvedDisplayName
      });

    await scopedService.ensureReady();

    if (typeof store.ensureWorkspaceUser === 'function') {
      return store.ensureWorkspaceUser({
        ...user,
        workspaceId: resolvedWorkspaceId,
        displayName: resolvedDisplayName
      });
    }

    return {
      userId: String(user.userId || resolvedWorkspaceId).trim(),
      workspaceId: resolvedWorkspaceId
    };
  }

  function forWorkspace(context = {}) {
    const resolvedWorkspaceId = String(context.workspaceId || workspaceId || '').trim();
    if (!resolvedWorkspaceId) {
      throw new Error('workspaceId is required.');
    }

    const resolvedWorkspaceDisplayName = String(
      context.workspaceDisplayName
      || context.displayName
      || workspaceDisplayName
      || 'Default Workspace'
    ).trim() || 'Default Workspace';

    if (resolvedWorkspaceId === workspaceId && resolvedWorkspaceDisplayName === workspaceDisplayName) {
      return serviceApi;
    }

    const cacheKey = `${resolvedWorkspaceId}:${resolvedWorkspaceDisplayName}`;
    if (!workspaceServices.has(cacheKey)) {
      workspaceServices.set(cacheKey, createTemplateLibraryService({
        ...options,
        store,
        blobStore,
        storeKind,
        workspaceId: resolvedWorkspaceId,
        workspaceDisplayName: resolvedWorkspaceDisplayName,
        logger,
        logInitialization: false,
        skipLegacyBootstrap: true,
        templateCoverGenerator
      }));
    }

    return workspaceServices.get(cacheKey);
  }

  const serviceApi = {
    ACHIEVEMENTS,
    ensureReady,
    getStoreKind: () => storeKind,
    store,
    forWorkspace,
    ensureWorkspaceUser,
    createTemplate,
    createTemplateVersion,
    listTemplates,
    getTemplateById,
    getTemplateVersions,
    getTemplateVersionBlob,
    getTemplateCover,
    archiveTemplate,
    restoreTemplate,
    getOverview,
    getComponents,
    getBuilderUsageTotals,
    getTimeline,
    resetStats,
    importLegacyTemplate
  };

  return serviceApi;
}

let singleton = null;

function getTemplateLibraryService() {
  if (!singleton) {
    singleton = createTemplateLibraryService();
  }
  return singleton;
}

function resetTemplateLibraryService() {
  singleton = null;
}

module.exports = {
  createTemplateLibraryService,
  getTemplateLibraryService,
  resetTemplateLibraryService
};
