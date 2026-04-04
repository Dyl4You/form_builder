#!/usr/bin/env node

const { createTemplateLibraryService } = require('../src/utils/templateLibrary');
const {
  importLegacyTemplateRecords,
  loadLegacyTemplateRecords
} = require('../src/utils/legacyTemplateImport');

async function main() {
  const shouldReset = process.argv.includes('--reset');
  const service = createTemplateLibraryService({ skipLegacyBootstrap: true });
  const { records } = await loadLegacyTemplateRecords();

  const existing = await service.listTemplates({ status: 'all', limit: 1 });
  if (existing.items.length && !shouldReset) {
    throw new Error('The template library already contains data. Re-run with --reset to clear it first.');
  }

  if (shouldReset) {
    await service.resetStats();
  }

  const importedCount = await importLegacyTemplateRecords(records, (record) => service.importLegacyTemplate(record));

  const overview = await service.getOverview();
  console.log(`Imported ${importedCount} legacy templates into workspace "${overview.builderId}".`);
  console.log(`Versions saved: ${overview.templatesSaved}. Active templates: ${overview.activeTemplates}.`);
}

main().catch((err) => {
  console.error(err?.stack || err?.message || err);
  process.exit(1);
});
