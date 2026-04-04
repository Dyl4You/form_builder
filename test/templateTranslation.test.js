const test = require('node:test');
const assert = require('node:assert/strict');

const {
  OUTPUT_MODES,
  translateDefinition
} = require('../src/utils/templateTranslation');

function buildTranslator(dictionary = {}) {
  return async (strings) => strings.map((text) => (
    Object.prototype.hasOwnProperty.call(dictionary, text)
      ? dictionary[text]
      : text
  ));
}

test('wrap mode creates a bilingual root and remaps translated keys safely', async () => {
  const definition = {
    label: 'Grouping',
    key: 'grouping',
    type: 'fieldset',
    input: false,
    tableView: false,
    components: [
      {
        label: 'Inspection Type',
        key: 'inspectionType',
        type: 'radio',
        input: true,
        values: [
          { label: 'Yes', value: 'yes' },
          { label: 'NA', value: 'na' }
        ]
      },
      {
        label: 'Comments',
        key: 'comments',
        type: 'textarea',
        input: true,
        conditional: {
          show: true,
          when: 'inspectionType',
          eq: 'yes'
        }
      },
      {
        label: 'Score',
        key: 'score',
        type: 'number',
        input: true,
        calculateValue: 'value = data.inspectionType === "yes" ? 1 : 0'
      }
    ]
  };

  const translated = await translateDefinition(definition, 'fr', {
    translateBatch: buildTranslator({
      Grouping: 'Groupement',
      'Inspection Type': 'Type d inspection',
      Yes: 'Oui',
      Comments: 'Commentaires',
      Score: 'Pointage'
    })
  });

  assert.equal(translated.type, 'fieldset');
  assert.equal(translated.components.length, 3);
  assert.equal(translated.components[0].key, 'preferredLanguage');

  const originalSection = translated.components[1];
  const translatedSection = translated.components[2];
  assert.equal(originalSection.label, 'English');
  assert.equal(translatedSection.label, 'French');
  assert.equal(originalSection.conditional.when, 'preferredLanguage');
  assert.equal(translatedSection.conditional.when, 'preferredLanguage');

  const translatedRadio = translatedSection.components[0];
  const translatedComments = translatedSection.components[1];
  const translatedScore = translatedSection.components[2];

  assert.equal(translatedRadio.label, 'Type d inspection');
  assert.equal(translatedRadio.key, 'inspectionType1');
  assert.equal(translatedRadio.values[0].label, 'Oui');
  assert.equal(translatedRadio.values[1].label, 'NA');
  assert.equal(translatedComments.label, 'Commentaires');
  assert.equal(translatedComments.key, 'comments1');
  assert.equal(translatedComments.conditional.when, 'inspectionType1');
  assert.equal(translatedScore.key, 'score1');
  assert.match(translatedScore.calculateValue, /data\.inspectionType1/);
});

test('non-wrap mode translates copy without changing existing keys', async () => {
  const definition = {
    label: 'Grouping',
    key: 'grouping',
    type: 'fieldset',
    input: false,
    tableView: false,
    components: [
      {
        label: 'Safety Notes',
        key: 'safetyNotes',
        type: 'content',
        html: '<p>Hello world</p>'
      },
      {
        label: 'Status',
        key: 'status',
        type: 'radio',
        input: true,
        values: [
          { label: 'Pass', value: 'pass' },
          { label: 'NA', value: 'na' }
        ]
      }
    ]
  };

  const translated = await translateDefinition(definition, 'fr', {
    wrapToggle: false,
    translateBatch: buildTranslator({
      Grouping: 'Groupement',
      'Safety Notes': 'Notes de securite',
      'Hello world': 'Bonjour le monde',
      Status: 'Statut',
      Pass: 'Reussi'
    })
  });

  assert.equal(translated.key, 'grouping');
  assert.equal(translated.components[0].key, 'safetyNotes');
  assert.equal(translated.components[0].label, 'Notes de securite');
  assert.equal(translated.components[0].html, '<p>Bonjour le monde</p>');
  assert.equal(translated.components[1].key, 'status');
  assert.equal(translated.components[1].label, 'Statut');
  assert.equal(translated.components[1].values[0].label, 'Reussi');
  assert.equal(translated.components[1].values[1].label, 'NA');
});

test('i18n mode returns a single-schema bundle with renderer options and language hook', async () => {
  const definition = {
    label: 'Grouping',
    key: 'grouping',
    type: 'fieldset',
    input: false,
    tableView: false,
    components: [
      {
        label: 'Inspection Type',
        key: 'inspectionType',
        type: 'radio',
        input: true,
        values: [
          { label: 'Yes', value: 'yes' },
          { label: 'NA', value: 'na' }
        ]
      },
      {
        label: 'Comments',
        key: 'comments',
        type: 'textarea',
        input: true
      }
    ]
  };

  const translated = await translateDefinition(definition, 'fr', {
    outputMode: OUTPUT_MODES.I18N,
    translateBatch: buildTranslator({
      Grouping: 'Groupement',
      'Inspection Type': 'Type d inspection',
      Yes: 'Oui',
      Comments: 'Commentaires',
      'Preferred Language': 'Langue preferee',
      English: 'Anglais',
      French: 'Francais'
    })
  });

  assert.equal(translated.key, 'grouping');
  assert.equal(translated.components[0].key, 'preferredLanguage');
  assert.equal(translated.components[0].defaultValue, 'en');
  assert.deepEqual(
    translated.components[0].values.map((item) => item.value),
    ['en', 'fr']
  );
  assert.equal(translated.components[1].key, 'inspectionType');
  assert.equal(translated.components[2].key, 'comments');
  assert.equal(translated._translationBundle.rendererOptions.language, 'en');
  assert.equal(translated._translationBundle.rendererOptions.i18n.fr['Inspection Type'], 'Type d inspection');
  assert.equal(translated._translationBundle.rendererOptions.i18n.fr['Preferred Language'], 'Langue preferee');
  assert.equal(translated._translationBundle.rendererOptions.i18n.fr.English, 'Anglais');
  assert.equal(translated._translationBundle.rendererOptions.i18n.fr.French, 'Francais');
  assert.equal(translated._translationBundle.languageController.fieldKey, 'preferredLanguage');
  assert.match(translated._translationBundle.languageController.listener, /event\.data\?\.preferredLanguage/);
});
