const fs = require('fs/promises');
const path = require('path');

const DEFAULT_LEGACY_DATA_DIR = path.join(__dirname, '..', '..', 'data', 'gamification');

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

async function readNdjson(filePath) {
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    if (!raw.trim()) return [];
    return raw
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => JSON.parse(line));
  } catch (err) {
    if (err?.code === 'ENOENT') return [];
    throw err;
  }
}

function buildLegacyImportRecords(templatesIndex = {}, events = []) {
  const eventByTemplateId = new Map(
    (events || [])
      .filter((entry) => entry?.type === 'template_saved' && entry?.templateId)
      .map((entry) => [entry.templateId, entry])
  );

  return (templatesIndex.templates || [])
    .slice()
    .sort((a, b) => {
      const aTime = new Date(a?.savedAt || 0).getTime();
      const bTime = new Date(b?.savedAt || 0).getTime();
      if (aTime !== bTime) return aTime - bTime;
      return String(a?.templateId || '').localeCompare(String(b?.templateId || ''));
    })
    .map((template) => {
      const event = eventByTemplateId.get(template.templateId) || {};
      const canLoad = Boolean(template?.json && typeof template.json === 'object' && !Array.isArray(template.json));
      const templateStats = {
        ...(event?.templateStats || {}),
        ...(template?.templateStats || {})
      };
      const actionCounts = {
        ...(event?.actionCounts || {}),
        ...(template?.actionCounts || {})
      };
      const scores = {
        ...(event?.scores || {}),
        ...(template?.scores || {})
      };
      const xp = {
        ...(event?.xp || {}),
        ...(template?.xp || {})
      };
      const componentGenome = {
        ...(event?.componentGenome || {}),
        ...(template?.componentGenome || {}),
        complexitySignature: {
          ...(event?.componentGenome?.complexitySignature || {}),
          ...(template?.componentGenome?.complexitySignature || {})
        },
        typeDistribution: {
          ...(event?.componentGenome?.typeDistribution || {}),
          ...(template?.componentGenome?.typeDistribution || {})
        }
      };

      return {
        templateId: template.templateId,
        versionId: `${template.templateId}_v001`,
        name: template.name,
        nameSource: template.nameSource || event.nameSource,
        savedAt: template.savedAt || event.savedAt,
        ymd: event.ymd,
        notes: template.notes,
        json: canLoad ? template.json : null,
        telemetry: actionCounts,
        fingerprint: template.fingerprint,
        templateStats,
        scores,
        actionCounts,
        xp,
        componentGenome
      };
    });
}

async function loadLegacyTemplateRecords(options = {}) {
  const dataDir = options.dataDir || DEFAULT_LEGACY_DATA_DIR;
  const templatesPath = options.templatesPath || path.join(dataDir, 'templates-index.json');
  const eventsPath = options.eventsPath || path.join(dataDir, 'events.ndjson');
  const templatesIndex = await readJson(templatesPath, { templates: [] });
  const events = await readNdjson(eventsPath);
  const records = buildLegacyImportRecords(templatesIndex, events);

  return {
    records,
    source: {
      dataDir,
      templatesPath,
      eventsPath
    }
  };
}

async function importLegacyTemplateRecords(records = [], importRecord) {
  if (typeof importRecord !== 'function') {
    throw new TypeError('importRecord must be a function.');
  }

  let count = 0;
  for (const record of records) {
    await importRecord(record);
    count += 1;
  }

  return count;
}

module.exports = {
  DEFAULT_LEGACY_DATA_DIR,
  buildLegacyImportRecords,
  loadLegacyTemplateRecords,
  importLegacyTemplateRecords
};
