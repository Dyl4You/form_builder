const test = require('node:test');
const assert = require('node:assert/strict');

const { extractTemplateMetrics } = require('../src/utils/formMetrics');

test('extractTemplateMetrics ignores action helper bundles owned by a field component', () => {
  const metrics = extractTemplateMetrics({
    components: [
      {
        type: 'radio',
        key: 'incidentType',
        label: 'Incident Type',
        input: true,
        _actionsDriverKey: 'actions'
      },
      {
        type: 'fieldset',
        key: 'actions',
        label: 'Actions',
        input: false,
        components: [
          {
            type: 'textarea',
            key: 'comments',
            label: 'Comments',
            input: true
          },
          {
            type: 'fieldset',
            key: 'grouping',
            label: 'Grouping',
            input: false,
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
            input: true
          },
          {
            type: 'selectboxes',
            key: 'actions1',
            label: 'Actions',
            input: true
          }
        ]
      }
    ]
  });

  assert.equal(metrics.totalComponents, 1);
  assert.equal(metrics.uniqueTypes, 1);
  assert.equal(metrics.conditionalCount, 0);
  assert.equal(metrics.calculationCount, 0);
  assert.deepEqual(metrics.componentBreakdown, [{ type: 'radio', count: 1 }]);
  assert.deepEqual(metrics.topTypes, [{ type: 'radio', count: 1 }]);
});
