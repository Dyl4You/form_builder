const test = require('node:test');
const assert = require('node:assert/strict');

const {
  getDevAuthProfile,
  getPublicAiFeatures,
  isEmailAllowed,
  parseAllowedEmails
} = require('../src/config/runtimeConfig');

test('getDevAuthProfile defaults local development to the legacy shared workspace', () => {
  const profile = getDevAuthProfile({});

  assert.equal(profile.userId, 'default');
  assert.equal(profile.workspaceId, 'default');
  assert.equal(profile.displayName, 'Default Workspace');
});

test('getPublicAiFeatures keeps legacy AI surfaces enabled unless explicitly disabled', () => {
  assert.deepEqual(
    getPublicAiFeatures({}),
    {
      assistant: true,
      fileUpload: true,
      dictation: true,
      imageExtraction: true,
      imageExtractionAiRefinement: false,
      translation: true
    }
  );

  assert.deepEqual(
    getPublicAiFeatures({
      ENABLE_AI_ASSIST: '0',
      ENABLE_FILE_UPLOADS: '0',
      ENABLE_AI_DICTATION: 'false',
      ENABLE_IMAGE_EXTRACTION: 'off',
      ENABLE_AI_TRANSLATION: 'off'
    }),
    {
      assistant: false,
      fileUpload: false,
      dictation: false,
      imageExtraction: false,
      imageExtractionAiRefinement: false,
      translation: false
    }
  );
});

test('getPublicAiFeatures free mode keeps screenshot OCR but disables paid AI surfaces', () => {
  assert.deepEqual(
    getPublicAiFeatures({
      FREE_BUILDER_MODE: '1'
    }),
    {
      assistant: false,
      fileUpload: false,
      dictation: false,
      imageExtraction: true,
      imageExtractionAiRefinement: false,
      translation: false
    }
  );
});

test('allowed email parsing is empty by default and opt-in when configured', () => {
  assert.deepEqual(Array.from(parseAllowedEmails({})), []);
  assert.equal(isEmailAllowed('anyone@example.com', {}), true);

  assert.deepEqual(
    Array.from(parseAllowedEmails({
      ALLOWED_EMAILS: 'alpha@example.com, Bravo@Example.com'
    })).sort(),
    ['alpha@example.com', 'bravo@example.com']
  );

  assert.equal(
    isEmailAllowed('alpha@example.com', {
      ALLOWED_EMAILS: 'alpha@example.com, bravo@example.com'
    }),
    true
  );

  assert.equal(
    isEmailAllowed('charlie@example.com', {
      ALLOWED_EMAILS: 'alpha@example.com, bravo@example.com'
    }),
    false
  );
});
