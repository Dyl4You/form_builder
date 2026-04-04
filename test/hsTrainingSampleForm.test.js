const test = require('node:test');
const assert = require('node:assert/strict');

const { extractTemplateMetrics } = require('../src/utils/formMetrics');
const { HS_TRAINING_SAMPLE_FORM } = require('../src/utils/hsTrainingSampleForm');

function collectCustomTypes(components = [], result = new Set()) {
  (components || []).forEach((component) => {
    if (!component || typeof component !== 'object') return;
    if (component.customType) {
      result.add(component.customType);
    }
    if (Array.isArray(component.components)) {
      collectCustomTypes(component.components, result);
    }
  });
  return result;
}

function findComponentByLabel(components = [], label) {
  for (const component of components || []) {
    if (!component || typeof component !== 'object') continue;
    if (component.label === label) {
      return component;
    }
    if (Array.isArray(component.components)) {
      const nested = findComponentByLabel(component.components, label);
      if (nested) return nested;
    }
  }
  return null;
}

test('H&S training sample covers the full teaching component mix and workflows', () => {
  const metrics = extractTemplateMetrics(HS_TRAINING_SAMPLE_FORM);
  const customTypes = collectCustomTypes(HS_TRAINING_SAMPLE_FORM.components);

  assert.ok(metrics.totalComponents > 20);
  assert.ok(metrics.uniqueTypes >= 12);
  assert.ok(metrics.conditionalCount >= 3);
  assert.ok(metrics.calculationCount >= 2);
  assert.equal(metrics.hasDatagrid, true);
  assert.equal(metrics.hasEditgrid, true);

  [
    'fieldset',
    'content',
    'textarea',
    'account',
    'asset',
    'select',
    'datetime',
    'phoneNumber',
    'address',
    'survey',
    'radio',
    'selectboxes',
    'file',
    'number',
    'currency',
    'datagrid',
    'editgrid'
  ].forEach((type) => {
    assert.ok(metrics.typeCounts[type] >= 1, `expected component type ${type}`);
  });

  ['disclaimer', 'componentGroup', 'quiz'].forEach((type) => {
    assert.ok(customTypes.has(type), `expected custom component type ${type}`);
  });
});

test('H&S training sample keeps builder-specific survey and table examples aligned', () => {
  const inspectionChecklist = findComponentByLabel(HS_TRAINING_SAMPLE_FORM.components, 'Inspection Checklist');
  const jobStepsHazards = findComponentByLabel(HS_TRAINING_SAMPLE_FORM.components, 'Job Steps And Hazards');
  const permitChecks = findComponentByLabel(HS_TRAINING_SAMPLE_FORM.components, 'Permit Checks');
  const correctiveActionRegister = findComponentByLabel(HS_TRAINING_SAMPLE_FORM.components, 'Corrective Action Register');

  assert.ok(inspectionChecklist, 'expected Inspection Checklist survey');
  assert.deepEqual(
    inspectionChecklist.values.map((value) => value.label),
    ['Safe', 'At Risk', 'N/A']
  );

  [jobStepsHazards, permitChecks, correctiveActionRegister].forEach((component) => {
    assert.ok(component, `expected component ${component?.label || 'missing'}`);
    assert.equal(component.type, 'editgrid');
  });
});
