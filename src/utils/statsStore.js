const fs = require('fs/promises');
const path = require('path');
const crypto = require('crypto');

const { KNOWN_COMPONENT_TYPES, extractTemplateMetrics, stableStringify } = require('./formMetrics');
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

const STORAGE_ROOT = path.join(__dirname, '..', '..', 'data', 'gamification');
const PROFILE_PATH = path.join(STORAGE_ROOT, 'profile.json');
const EVENTS_PATH = path.join(STORAGE_ROOT, 'events.ndjson');
const TEMPLATES_INDEX_PATH = path.join(STORAGE_ROOT, 'templates-index.json');

function defaultProfile() {
  return {
    builderId: 'default',
    templatesSaved: 0,
    componentsTotal: 0,
    componentTypeTotals: {},
    xpTotal: 0,
    level: 1,
    streak: {
      current: 0,
      longest: 0,
      lastActiveDate: null
    },
    achievementsUnlocked: [],
    lastFingerprintByTemplateName: {},
    handcraftedChain: 0,
    neglectedRevivalCount: 0
  };
}

function defaultTemplatesIndex() {
  return {
    nextTemplateSeq: 1,
    templates: []
  };
}

async function ensureStorage() {
  await fs.mkdir(STORAGE_ROOT, { recursive: true });

  await Promise.all([
    ensureFile(PROFILE_PATH, JSON.stringify(defaultProfile(), null, 2)),
    ensureFile(TEMPLATES_INDEX_PATH, JSON.stringify(defaultTemplatesIndex(), null, 2)),
    ensureFile(EVENTS_PATH, '')
  ]);
}

async function ensureFile(filePath, defaultContent) {
  try {
    await fs.access(filePath);
  } catch {
    await fs.writeFile(filePath, defaultContent, 'utf8');
  }
}

async function readJson(filePath, fallbackFactory) {
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    if (!raw.trim()) return fallbackFactory();
    return JSON.parse(raw);
  } catch {
    return fallbackFactory();
  }
}

async function writeJson(filePath, value) {
  await fs.writeFile(filePath, JSON.stringify(value, null, 2), 'utf8');
}

async function appendNdjson(filePath, value) {
  await fs.appendFile(filePath, `${JSON.stringify(value)}\n`, 'utf8');
}

function pad(n, width) {
  return String(n).padStart(width, '0');
}

function formatDateStamp(date) {
  return `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1, 2)}${pad(date.getUTCDate(), 2)}`;
}

function toYmd(date) {
  return date.toISOString().slice(0, 10);
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
  if (normalizedSource === 'generated') {
    return 'generated';
  }
  if (normalizedSource === 'manual' || normalizedSource === 'ai') {
    return 'manual';
  }

  const trimmed = String(rawName || '').trim();
  if (!trimmed || trimmed.toLowerCase() === 'untitled template') {
    return 'generated';
  }
  if (trimmed === generatedName) {
    return 'generated';
  }
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

function resolveTemplateName(rawName, componentBreakdown) {
  return resolveTemplateNameMeta(rawName, componentBreakdown).name;
}

function buildTemplateFingerprintStateKey(nameMeta, fingerprint) {
  if (nameMeta?.source === 'manual') {
    return String(nameMeta?.name || '').trim();
  }

  const safeFingerprint = String(fingerprint || '').trim();
  return safeFingerprint ? `auto:${safeFingerprint}` : String(nameMeta?.name || '').trim();
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

function hashTemplate(formJson) {
  const normalized = stableStringify(formJson || { components: [] });
  return crypto.createHash('sha1').update(normalized).digest('hex');
}

function toFiniteNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function mergeTypeTotals(targetTotals, incomingCounts) {
  const out = { ...(targetTotals || {}) };
  Object.entries(incomingCounts || {}).forEach(([type, count]) => {
    out[type] = (toFiniteNumber(out[type]) || 0) + (toFiniteNumber(count) || 0);
  });
  return out;
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

function getTopTypes(componentTypeTotals, count = 5) {
  return Object.entries(componentTypeTotals || {})
    .map(([type, value]) => ({ type, count: toFiniteNumber(value) }))
    .filter((entry) => entry.count > 0)
    .sort((a, b) => {
      if (b.count !== a.count) return b.count - a.count;
      return a.type.localeCompare(b.type);
    })
    .slice(0, count);
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

function reconstructBreakdownFromDistribution(typeDistribution, totalComponents) {
  const total = Math.max(0, Math.floor(toFiniteNumber(totalComponents)));
  const sourceEntries = Object.entries(typeDistribution || {})
    .map(([type, share]) => {
      const raw = Math.max(0, toFiniteNumber(share)) * total;
      return {
        type,
        raw,
        count: Math.max(0, Math.round(raw))
      };
    })
    .filter((entry) => entry.raw > 0 || entry.count > 0);

  if (!sourceEntries.length) return [];

  let diff = total - sourceEntries.reduce((sum, entry) => sum + entry.count, 0);
  if (diff !== 0) {
    const ordered = sourceEntries.slice().sort((a, b) => {
      const aDelta = a.raw - a.count;
      const bDelta = b.raw - b.count;
      if (diff > 0 && bDelta !== aDelta) return bDelta - aDelta;
      if (diff < 0 && aDelta !== bDelta) return aDelta - bDelta;
      return a.type.localeCompare(b.type);
    });

    let index = 0;
    while (diff !== 0 && ordered.length) {
      const entry = ordered[index % ordered.length];
      if (diff > 0) {
        entry.count += 1;
        diff -= 1;
      } else if (entry.count > 0) {
        entry.count -= 1;
        diff += 1;
      }
      index += 1;
      if (index > ordered.length * Math.max(1, total + 1)) break;
    }
  }

  return sortTypeEntries(sourceEntries);
}

function readTemplateCount(value) {
  if (value == null) return null;
  return Math.max(0, Math.floor(toFiniteNumber(value)));
}

function readTemplateComponentBreakdown(templateEntry) {
  const directBreakdown = sortTypeEntries(templateEntry?.templateStats?.componentBreakdown);
  if (directBreakdown.length) return directBreakdown;

  const fromDistribution = reconstructBreakdownFromDistribution(
    templateEntry?.componentGenome?.typeDistribution,
    templateEntry?.templateStats?.totalComponents
  );
  if (fromDistribution.length) return fromDistribution;

  return sortTypeEntries(templateEntry?.templateStats?.topTypes);
}

function readTemplateStoredJson(templateEntry) {
  const rawJson = templateEntry?.json;
  if (!rawJson || typeof rawJson !== 'object' || Array.isArray(rawJson)) {
    return null;
  }

  try {
    const cloned = JSON.parse(JSON.stringify(rawJson));
    if (!Array.isArray(cloned.components)) {
      cloned.components = [];
    }
    sanitizeComponentSchema(cloned.components);
    return cloned;
  } catch {
    return null;
  }
}

function buildTemplateReportEntry(templateEntry) {
  const totalComponents = Math.max(0, Math.floor(toFiniteNumber(templateEntry?.templateStats?.totalComponents)));
  const componentBreakdown = readTemplateComponentBreakdown(templateEntry);
  const conditionalCount = readTemplateCount(templateEntry?.templateStats?.conditionalCount);
  const calculationCount = readTemplateCount(templateEntry?.templateStats?.calculationCount);
  const nameMeta = resolveTemplateNameMeta(templateEntry?.name, componentBreakdown, templateEntry?.nameSource);
  const storedJson = readTemplateStoredJson(templateEntry);

  return {
    templateId: templateEntry?.templateId || null,
    name: nameMeta.name,
    nameSource: nameMeta.source,
    nameLabel: nameMeta.label,
    isGeneratedName: nameMeta.isGenerated,
    savedAt: templateEntry?.savedAt || null,
    totalComponents,
    uniqueTypes: Math.max(
      0,
      Math.floor(toFiniteNumber(templateEntry?.templateStats?.uniqueTypes)) || componentBreakdown.length
    ),
    conditionalCount,
    calculationCount,
    sessionElapsedMs: readTemplateElapsedMs(templateEntry),
    componentBreakdown,
    hasCompleteMetrics: conditionalCount != null && calculationCount != null,
    canLoad: Boolean(storedJson),
    loadUnavailableReason: storedJson
      ? ''
      : 'This template was saved before builder JSON was stored. Save it again to enable reopen from stats.'
  };
}

function readTemplateElapsedMs(templateEntry) {
  if (!templateEntry || typeof templateEntry !== 'object') return null;

  const fromTemplateStats = templateEntry.templateStats?.sessionElapsedMs;
  if (fromTemplateStats != null) {
    return Math.max(0, Math.floor(toFiniteNumber(fromTemplateStats)));
  }

  const fromActionCounts = templateEntry.actionCounts?.sessionElapsedMs;
  if (fromActionCounts != null) {
    return Math.max(0, Math.floor(toFiniteNumber(fromActionCounts)));
  }

  return null;
}

function computeSessionTimeStats(templateEntries) {
  const samples = [];

  (templateEntries || []).forEach((entry) => {
    const elapsedMs = readTemplateElapsedMs(entry);
    if (elapsedMs == null) return;
    samples.push(elapsedMs);
  });

  if (!samples.length) {
    return {
      trackedCount: 0,
      longestMs: 0,
      shortestMs: 0,
      averageMs: 0
    };
  }

  const aggregate = samples.reduce((acc, value) => ({
    total: acc.total + value,
    longest: Math.max(acc.longest, value),
    shortest: Math.min(acc.shortest, value)
  }), {
    total: 0,
    longest: 0,
    shortest: Number.POSITIVE_INFINITY
  });

  return {
    trackedCount: samples.length,
    longestMs: aggregate.longest,
    shortestMs: Number.isFinite(aggregate.shortest) ? aggregate.shortest : 0,
    averageMs: Math.round(aggregate.total / samples.length)
  };
}

function parseTimelineDays(days) {
  const n = Number(days);
  if (!Number.isFinite(n)) return 30;
  return Math.min(365, Math.max(7, Math.floor(n)));
}

async function readEvents() {
  try {
    const raw = await fs.readFile(EVENTS_PATH, 'utf8');
    return raw
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        try {
          return JSON.parse(line);
        } catch {
          return null;
        }
      })
      .filter(Boolean);
  } catch {
    return [];
  }
}

async function writeNdjson(filePath, values) {
  const lines = (values || []).map((value) => JSON.stringify(value));
  await fs.writeFile(filePath, lines.length ? `${lines.join('\n')}\n` : '', 'utf8');
}

function sortEntriesBySavedAt(entries) {
  return (entries || [])
    .slice()
    .sort((a, b) => {
      const aTime = new Date(a?.savedAt || 0).getTime();
      const bTime = new Date(b?.savedAt || 0).getTime();

      if (Number.isFinite(aTime) && Number.isFinite(bTime) && aTime !== bTime) {
        return aTime - bTime;
      }

      if (Number.isFinite(aTime) !== Number.isFinite(bTime)) {
        return Number.isFinite(aTime) ? -1 : 1;
      }

      return String(a?.templateId || '').localeCompare(String(b?.templateId || ''));
    });
}

function toTypeCounts(componentBreakdown) {
  return (componentBreakdown || []).reduce((acc, entry) => {
    const type = String(entry?.type || '').trim();
    const count = Math.max(0, Math.floor(toFiniteNumber(entry?.count)));
    if (!type || count < 1) return acc;

    acc[type] = (acc[type] || 0) + count;
    return acc;
  }, {});
}

function getEntryYmd(entry) {
  const rawYmd = String(entry?.ymd || '').slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(rawYmd)) return rawYmd;

  const dt = new Date(entry?.savedAt || 0);
  if (Number.isNaN(dt.getTime())) return null;
  return toYmd(dt);
}

function buildAchievementMetrics(entry, componentBreakdown) {
  const typeDistribution = entry?.componentGenome?.typeDistribution || {};
  const dominantTypeShare = Object.values(typeDistribution).reduce(
    (maxShare, value) => Math.max(maxShare, toFiniteNumber(value)),
    0
  );
  const typeSet = new Set((componentBreakdown || []).map((item) => item.type));

  return {
    totalComponents: Math.max(0, Math.floor(toFiniteNumber(entry?.templateStats?.totalComponents))),
    uniqueTypes: Math.max(
      0,
      Math.floor(toFiniteNumber(entry?.templateStats?.uniqueTypes)) || (componentBreakdown || []).length
    ),
    dominantTypeShare,
    conditionalCount: Math.max(0, toFiniteNumber(entry?.templateStats?.conditionalCount)),
    hasEditgrid: typeSet.has('editgrid') || toFiniteNumber(typeDistribution.editgrid) > 0,
    hasDatagrid: typeSet.has('datagrid') || toFiniteNumber(typeDistribution.datagrid) > 0
  };
}

function rebuildProfileFromHistory(templateEntries, events, currentProfile) {
  const nextProfile = defaultProfile();
  nextProfile.builderId = currentProfile?.builderId || 'default';

  sortEntriesBySavedAt(events.filter((event) => event?.type === 'template_saved')).forEach((event) => {
    const componentBreakdown = readTemplateComponentBreakdown(event);
    const actionCounts = event?.actionCounts || {};

    nextProfile.templatesSaved += 1;
    nextProfile.componentsTotal += Math.max(0, Math.floor(toFiniteNumber(event?.templateStats?.totalComponents)));
    nextProfile.componentTypeTotals = mergeTypeTotals(
      nextProfile.componentTypeTotals,
      toTypeCounts(componentBreakdown)
    );
    nextProfile.streak = updateStreak(nextProfile.streak, getEntryYmd(event));

    if (toFiniteNumber(actionCounts.aiActions) === 0 && toFiniteNumber(actionCounts.manualActions) > 0) {
      nextProfile.handcraftedChain += 1;
    } else {
      nextProfile.handcraftedChain = 0;
    }

    if (event?.noveltyHit && toFiniteNumber(actionCounts.manualActions) > 0) {
      nextProfile.neglectedRevivalCount += 1;
    }

    nextProfile.xpTotal += Math.max(0, Math.floor(toFiniteNumber(event?.xp?.xpGained)));

    const achievementState = evaluateAchievements({
      profile: nextProfile,
      metrics: buildAchievementMetrics(event, componentBreakdown)
    });
    nextProfile.achievementsUnlocked = achievementState.achievementsUnlocked;
  });

  nextProfile.level = levelFromXp(nextProfile.xpTotal);

  sortEntriesBySavedAt(templateEntries).forEach((templateEntry) => {
    const componentBreakdown = readTemplateComponentBreakdown(templateEntry);
    const nameMeta = resolveTemplateNameMeta(templateEntry?.name, componentBreakdown, templateEntry?.nameSource);
    if (!templateEntry?.fingerprint) return;

    nextProfile.lastFingerprintByTemplateName[buildTemplateFingerprintStateKey(nameMeta, templateEntry.fingerprint)] = {
      fingerprint: templateEntry.fingerprint,
      savedAt: templateEntry.savedAt || null
    };
  });

  return nextProfile;
}

async function saveTemplate(body = {}) {
  await ensureStorage();

  const payload = normalizeBody(body);
  const now = new Date();
  const savedAt = now.toISOString();
  const activeYmd = toYmd(now);

  const profile = await readJson(PROFILE_PATH, defaultProfile);
  const templatesIndex = await readJson(TEMPLATES_INDEX_PATH, defaultTemplatesIndex);

  const templateMetrics = extractTemplateMetrics(payload.json);
  const templateNameMeta = resolveTemplateNameMeta(payload.name, templateMetrics.componentBreakdown);
  const resolvedName = templateNameMeta.name;
  const scores = computeMasteryScores(templateMetrics, payload.telemetry);
  const sessionElapsedMs = Math.max(0, Math.floor(toFiniteNumber(scores.actionCounts.sessionElapsedMs)));

  const leastUsedBefore = getLeastUsedTypes(profile.componentTypeTotals, 3);
  const noveltyHit = leastUsedBefore.some((type) => templateMetrics.typeCounts[type] > 0);

  const fingerprint = hashTemplate(payload.json);
  const fingerprintStateKey = buildTemplateFingerprintStateKey(templateNameMeta, fingerprint);
  const prevFingerprintState = profile.lastFingerprintByTemplateName?.[fingerprintStateKey];

  let spamDuplicate = false;
  if (prevFingerprintState && prevFingerprintState.fingerprint === fingerprint && prevFingerprintState.savedAt) {
    const prevTime = new Date(prevFingerprintState.savedAt).getTime();
    const nowTime = now.getTime();
    if (Number.isFinite(prevTime) && (nowTime - prevTime) < 24 * 60 * 60 * 1000) {
      spamDuplicate = true;
    }
  }

  const nextStreak = updateStreak(profile.streak, activeYmd);

  const xpBreakdown = computeXp({
    masteryScore: scores.masteryScore,
    manualActions: scores.actionCounts.manualActions,
    noveltyHit,
    streakCurrent: nextStreak.current,
    spamDuplicate
  });

  const templateSeq = toFiniteNumber(templatesIndex.nextTemplateSeq) || 1;
  const templateId = `tpl_${formatDateStamp(now)}_${pad(templateSeq, 3)}`;

  const nextProfile = {
    ...defaultProfile(),
    ...profile
  };

  nextProfile.templatesSaved = toFiniteNumber(nextProfile.templatesSaved) + 1;
  nextProfile.componentsTotal = toFiniteNumber(nextProfile.componentsTotal) + templateMetrics.totalComponents;
  nextProfile.componentTypeTotals = mergeTypeTotals(nextProfile.componentTypeTotals, templateMetrics.typeCounts);

  nextProfile.streak = nextStreak;

  if (scores.actionCounts.aiActions === 0 && scores.actionCounts.manualActions > 0) {
    nextProfile.handcraftedChain = toFiniteNumber(nextProfile.handcraftedChain) + 1;
  } else {
    nextProfile.handcraftedChain = 0;
  }

  if (noveltyHit && scores.actionCounts.manualActions > 0) {
    nextProfile.neglectedRevivalCount = toFiniteNumber(nextProfile.neglectedRevivalCount) + 1;
  }

  nextProfile.lastFingerprintByTemplateName = {
    ...(nextProfile.lastFingerprintByTemplateName || {}),
    [fingerprintStateKey]: {
      fingerprint,
      savedAt
    }
  };

  nextProfile.xpTotal = toFiniteNumber(nextProfile.xpTotal) + xpBreakdown.xpGained;
  nextProfile.level = levelFromXp(nextProfile.xpTotal);

  const achievementState = evaluateAchievements({
    profile: nextProfile,
    metrics: templateMetrics
  });

  nextProfile.achievementsUnlocked = achievementState.achievementsUnlocked;

  const templateEntry = {
    templateId,
    name: resolvedName,
    nameSource: templateNameMeta.source,
    savedAt,
    notes: payload.notes,
    json: payload.json,
    fingerprint,
    templateStats: {
      totalComponents: templateMetrics.totalComponents,
      uniqueTypes: templateMetrics.uniqueTypes,
      componentBreakdown: templateMetrics.componentBreakdown,
      topTypes: templateMetrics.topTypes,
      conditionalCount: templateMetrics.conditionalCount,
      calculationCount: templateMetrics.calculationCount,
      sessionElapsedMs
    },
    scores: {
      diversityScore: scores.diversityScore,
      balanceScore: scores.balanceScore,
      complexityScore: scores.complexityScore,
      craftScore: scores.craftScore,
      masteryScore: scores.masteryScore
    },
    actionCounts: scores.actionCounts,
    xp: xpBreakdown,
    componentGenome: templateMetrics.componentGenome
  };

  const nextTemplatesIndex = {
    nextTemplateSeq: templateSeq + 1,
    templates: [...(templatesIndex.templates || []), templateEntry]
  };

  const event = {
    type: 'template_saved',
    templateId,
    name: resolvedName,
    nameSource: templateNameMeta.source,
    savedAt,
    ymd: activeYmd,
    templateStats: templateEntry.templateStats,
    scores: templateEntry.scores,
    actionCounts: templateEntry.actionCounts,
    sessionElapsedMs,
    xp: xpBreakdown,
    noveltyHit,
    spamDuplicate,
    leastUsedBefore,
    componentGenome: templateEntry.componentGenome
  };

  await writeJson(PROFILE_PATH, nextProfile);
  await writeJson(TEMPLATES_INDEX_PATH, nextTemplatesIndex);
  await appendNdjson(EVENTS_PATH, event);

  const progression = {
    xpGained: xpBreakdown.xpGained,
    xpTotal: nextProfile.xpTotal,
    level: nextProfile.level,
    nextLevelXp: nextLevelXp(nextProfile.level),
    achievementsUnlocked: achievementState.newlyUnlocked
  };

  return {
    ok: true,
    templateId,
    name: resolvedName,
    nameSource: templateNameMeta.source,
    savedAt,
    templateStats: templateEntry.templateStats,
    progression,
    scores: templateEntry.scores,
    silentCoach: buildSilentCoach(templateEntry.scores)
  };
}

async function getOverview() {
  await ensureStorage();

  const profile = await readJson(PROFILE_PATH, defaultProfile);
  const templatesIndex = await readJson(TEMPLATES_INDEX_PATH, defaultTemplatesIndex);
  const templateEntries = templatesIndex.templates || [];
  const latestTemplateEntry = templateEntries.slice(-1)[0] || null;
  const latestTemplateBreakdown = latestTemplateEntry ? readTemplateComponentBreakdown(latestTemplateEntry) : [];
  const latestTemplateNameMeta = latestTemplateEntry
    ? resolveTemplateNameMeta(latestTemplateEntry.name, latestTemplateBreakdown, latestTemplateEntry.nameSource)
    : null;
  const latestTemplate = latestTemplateEntry
    ? {
      ...latestTemplateEntry,
      name: latestTemplateNameMeta.name,
      nameSource: latestTemplateNameMeta.source,
      nameLabel: latestTemplateNameMeta.label,
      isGeneratedName: latestTemplateNameMeta.isGenerated
    }
    : null;

  return {
    builderId: profile.builderId || 'default',
    templatesSaved: toFiniteNumber(profile.templatesSaved),
    componentsTotal: toFiniteNumber(profile.componentsTotal),
    xpTotal: toFiniteNumber(profile.xpTotal),
    level: toFiniteNumber(profile.level) || 1,
    nextLevelXp: nextLevelXp(toFiniteNumber(profile.level) || 1),
    streak: profile.streak || { current: 0, longest: 0, lastActiveDate: null },
    achievementsUnlocked: profile.achievementsUnlocked || [],
    handcraftedChain: toFiniteNumber(profile.handcraftedChain),
    neglectedRevivalCount: toFiniteNumber(profile.neglectedRevivalCount),
    topComponents: getTopTypes(profile.componentTypeTotals, 5),
    sessionTimeStats: computeSessionTimeStats(templateEntries),
    leastUsedTypes: getLeastUsedTypes(profile.componentTypeTotals, 3),
    latestTemplate,
    latestScores: latestTemplate?.scores || {
      diversityScore: 0,
      balanceScore: 0,
      complexityScore: 0,
      craftScore: 0,
      masteryScore: 0
    },
    silentCoach: buildSilentCoach(latestTemplate?.scores || {})
  };
}

async function getTemplatesReport() {
  await ensureStorage();

  const templatesIndex = await readJson(TEMPLATES_INDEX_PATH, defaultTemplatesIndex);
  const templates = (templatesIndex.templates || [])
    .slice()
    .reverse()
    .map(buildTemplateReportEntry);

  return {
    totalTemplates: templates.length,
    templates
  };
}

async function getTemplateById(templateId) {
  await ensureStorage();

  const normalizedTemplateId = String(templateId || '').trim();
  if (!normalizedTemplateId) return null;

  const templatesIndex = await readJson(TEMPLATES_INDEX_PATH, defaultTemplatesIndex);
  const templateEntry = (templatesIndex.templates || []).find((entry) => entry?.templateId === normalizedTemplateId);
  if (!templateEntry) return null;

  const componentBreakdown = readTemplateComponentBreakdown(templateEntry);
  const nameMeta = resolveTemplateNameMeta(templateEntry?.name, componentBreakdown, templateEntry?.nameSource);

  return {
    templateId: normalizedTemplateId,
    name: nameMeta.name,
    savedAt: templateEntry?.savedAt || null,
    json: readTemplateStoredJson(templateEntry)
  };
}

async function deleteTemplateReport(templateId) {
  await ensureStorage();

  const normalizedTemplateId = String(templateId || '').trim();
  if (!normalizedTemplateId) return null;

  const profile = await readJson(PROFILE_PATH, defaultProfile);
  const templatesIndex = await readJson(TEMPLATES_INDEX_PATH, defaultTemplatesIndex);
  const templateEntries = Array.isArray(templatesIndex.templates) ? templatesIndex.templates : [];
  const deletedTemplate = templateEntries.find((entry) => entry?.templateId === normalizedTemplateId);
  if (!deletedTemplate) return null;

  const nextTemplates = templateEntries.filter((entry) => entry?.templateId !== normalizedTemplateId);
  const events = await readEvents();
  const nextEvents = events.filter((event) => event?.templateId !== normalizedTemplateId);
  const nextProfile = rebuildProfileFromHistory(nextTemplates, nextEvents, profile);
  const deletedTemplateName = resolveTemplateName(
    deletedTemplate?.name,
    readTemplateComponentBreakdown(deletedTemplate)
  );

  await writeJson(PROFILE_PATH, nextProfile);
  await writeJson(TEMPLATES_INDEX_PATH, {
    nextTemplateSeq: Math.max(1, Math.floor(toFiniteNumber(templatesIndex.nextTemplateSeq)) || 1),
    templates: nextTemplates
  });
  await writeNdjson(EVENTS_PATH, nextEvents);

  return {
    ok: true,
    templateId: normalizedTemplateId,
    name: deletedTemplateName
  };
}

async function getComponents() {
  await ensureStorage();

  const profile = await readJson(PROFILE_PATH, defaultProfile);
  const totals = profile.componentTypeTotals || {};
  const globalTotal = Math.max(1, toFiniteNumber(profile.componentsTotal));

  const byType = KNOWN_COMPONENT_TYPES
    .map((type) => {
      const count = toFiniteNumber(totals[type]);
      return {
        type,
        count,
        share: Number(((count / globalTotal) * 100).toFixed(2))
      };
    })
    .sort((a, b) => {
      if (b.count !== a.count) return b.count - a.count;
      return a.type.localeCompare(b.type);
    });

  return {
    totalComponents: toFiniteNumber(profile.componentsTotal),
    byType,
    leastUsedTypes: getLeastUsedTypes(totals, 3)
  };
}

async function getTimeline(daysQuery) {
  await ensureStorage();

  const days = parseTimelineDays(daysQuery);
  const events = await readEvents();

  const now = new Date();
  const map = new Map();

  for (let offset = days - 1; offset >= 0; offset -= 1) {
    const dt = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - offset));
    const ymd = toYmd(dt);
    map.set(ymd, {
      date: ymd,
      templatesSaved: 0,
      xpGained: 0,
      masteryAvg: 0,
      _masterySum: 0,
      _masteryCount: 0
    });
  }

  events.forEach((event) => {
    const ymd = String(event.ymd || '').slice(0, 10);
    if (!map.has(ymd)) return;

    const slot = map.get(ymd);
    slot.templatesSaved += 1;
    slot.xpGained += toFiniteNumber(event?.xp?.xpGained);

    const mastery = toFiniteNumber(event?.scores?.masteryScore);
    slot._masterySum += mastery;
    slot._masteryCount += 1;
  });

  const timeline = Array.from(map.values()).map((slot) => {
    const masteryAvg = slot._masteryCount
      ? Number((slot._masterySum / slot._masteryCount).toFixed(2))
      : 0;

    return {
      date: slot.date,
      templatesSaved: slot.templatesSaved,
      xpGained: slot.xpGained,
      masteryAvg
    };
  });

  return { days, timeline };
}

async function resetStats() {
  await ensureStorage();
  await writeJson(PROFILE_PATH, defaultProfile());
  await writeJson(TEMPLATES_INDEX_PATH, defaultTemplatesIndex());
  await fs.writeFile(EVENTS_PATH, '', 'utf8');
  return { ok: true };
}

module.exports = {
  ACHIEVEMENTS,
  saveTemplate,
  getOverview,
  getTemplatesReport,
  getTemplateById,
  deleteTemplateReport,
  getComponents,
  getTimeline,
  resetStats
};
