const test = require('node:test');
const assert = require('node:assert/strict');

const uniqueKeysPath = require.resolve('../public/js/uniqueKeys.js');
const { sanitizeComponentSchema } = require('../src/utils/formio');

function withFreshUniqueKeys(run) {
  const previousWindow = global.window;

  delete require.cache[uniqueKeysPath];
  global.window = {};

  try {
    require(uniqueKeysPath);
    run(global.window);
  } finally {
    delete require.cache[uniqueKeysPath];

    if (previousWindow === undefined) {
      delete global.window;
    } else {
      global.window = previousWindow;
    }
  }
}

test('browser sanitizer restores flattened conditional keys to the actual selectboxes key', () => {
  withFreshUniqueKeys((window) => {
    const components = [
      {
        label: 'Line Of Fire / Struck By / Impact / Etc. (select all that apply)',
        key: 'lineOfFireStruckByImpactEtcSelectAllThatApply',
        type: 'selectboxes',
        input: true,
        values: [
          { label: 'Guards on equipment', value: 'guardsOnEquipment' },
          { label: 'Other', value: 'other' }
        ]
      },
      {
        label: 'Other Specify',
        key: 'otherSpecify7',
        type: 'textarea',
        input: true,
        conditional: {
          when: 'lineoffirestruckbyimpactetcselectallthatapply',
          eq: 'other',
          show: true
        }
      }
    ];

    window.sanitizeComponentSchema(components);

    assert.equal(components[0].key, 'lineOfFireStruckByImpactEtcSelectAllThatApply');
    assert.equal(
      components[1].conditional.when,
      'lineOfFireStruckByImpactEtcSelectAllThatApply'
    );
  });
});

test('server sanitizer restores flattened conditional keys to the actual select key', () => {
  const components = [
    {
      label: 'Foreign Body (select all that apply)',
      key: 'foreignBodySelectAllThatApply',
      type: 'select',
      input: true,
      data: {
        values: [
          { label: 'Safety glasses with side shields', value: 'safetyGlassesWithSideShields' },
          { label: 'Other', value: 'other' }
        ]
      }
    },
    {
      label: 'Other Specify',
      key: 'otherSpecify',
      type: 'textarea',
      input: true,
      conditional: {
        when: 'foreignbodyselectallthatapply',
        eq: 'other',
        show: true
      }
    }
  ];

  sanitizeComponentSchema(components);

  assert.equal(components[0].key, 'foreignBodySelectAllThatApply');
  assert.equal(components[1].conditional.when, 'foreignBodySelectAllThatApply');
});
