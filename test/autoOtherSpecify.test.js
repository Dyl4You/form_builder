const test = require('node:test');
const assert = require('node:assert/strict');

const uniqueKeysPath = require.resolve('../public/js/uniqueKeys.js');

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

test('disabling auto Other removes the option and cleans up its textarea companion', () => {
  withFreshUniqueKeys((window) => {
    const components = [
      {
        type: 'select',
        key: 'status',
        data: {
          values: [
            { label: 'Pass', value: 'pass' },
            { label: 'Other', value: 'other' }
          ]
        }
      },
      {
        label: 'Other Specify',
        key: 'statusOtherSpecify',
        type: 'textarea',
        builderAutoOtherSpecify: true,
        conditional: {
          when: 'status',
          eq: 'other',
          show: true
        },
        rows: 1
      }
    ];

    assert.equal(window.disableAutoOtherOnChoiceComponent(components[0]), true);
    assert.equal(components[0].builderDisableAutoOther, true);
    assert.deepEqual(
      components[0].data.values.map(option => option.label),
      ['Pass']
    );

    assert.equal(window.ensureAutoOtherSpecifyFields(components), true);
    assert.equal(components.length, 1);
  });
});

test('manual removal of Other keeps auto-managed Other disabled on later normalization', () => {
  withFreshUniqueKeys((window) => {
    const components = [
      {
        type: 'selectboxes',
        key: 'category',
        values: [
          { label: 'Inspection', value: 'inspection' }
        ]
      }
    ];

    assert.equal(
      window.syncChoiceComponentAutoOtherState(components[0], {
        hadOtherBefore: true,
        wasAutoOtherDisabled: false
      }),
      true
    );
    assert.equal(components[0].builderDisableAutoOther, true);

    window.ensureAutoOtherSpecifyFields(components);

    assert.deepEqual(
      components[0].values.map(option => option.label),
      ['Inspection']
    );
    assert.equal(components.length, 1);
  });
});

test('choice components still get auto Other when there was no explicit removal', () => {
  withFreshUniqueKeys((window) => {
    const components = [
      {
        type: 'select',
        key: 'category',
        data: {
          values: [
            { label: 'Inspection', value: 'inspection' }
          ]
        }
      }
    ];

    assert.equal(
      window.syncChoiceComponentAutoOtherState(components[0], {
        hadOtherBefore: false,
        wasAutoOtherDisabled: false
      }),
      false
    );

    assert.equal(window.ensureAutoOtherSpecifyFields(components), true);
    assert.deepEqual(
      components[0].data.values.map(option => option.label),
      ['Inspection', 'Other']
    );
    assert.equal(components[1].type, 'textarea');
    assert.equal(components[1].conditional.when, 'category');
  });
});

test('quiz-contained dropdowns and select boxes do not get auto Other', () => {
  withFreshUniqueKeys((window) => {
    const components = [
      {
        type: 'fieldset',
        customType: 'quiz',
        key: 'quiz',
        components: [
          {
            type: 'fieldset',
            key: 'quizQuestions',
            components: [
              {
                type: 'select',
                key: 'status',
                data: {
                  values: [
                    { label: 'Pass', value: 'pass' }
                  ]
                }
              },
              {
                type: 'selectboxes',
                key: 'category',
                values: [
                  { label: 'Inspection', value: 'inspection' }
                ]
              }
            ]
          }
        ]
      }
    ];

    assert.equal(window.ensureAutoOtherSpecifyFields(components), false);

    const quizQuestions = components[0].components[0].components;
    assert.deepEqual(
      quizQuestions[0].data.values.map(option => option.label),
      ['Pass']
    );
    assert.deepEqual(
      quizQuestions[1].values.map(option => option.label),
      ['Inspection']
    );
    assert.equal(quizQuestions.length, 2);
  });
});
