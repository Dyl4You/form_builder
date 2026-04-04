const test = require('node:test');
const assert = require('node:assert/strict');

const {
  getDevAuthProfile,
  getPublicAiFeatures
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
      fileUpload: true,
      dictation: true,
      imageExtraction: true
    }
  );

  assert.deepEqual(
    getPublicAiFeatures({
      ENABLE_FILE_UPLOADS: '0',
      ENABLE_AI_DICTATION: 'false',
      ENABLE_IMAGE_EXTRACTION: 'off'
    }),
    {
      fileUpload: false,
      dictation: false,
      imageExtraction: false
    }
  );
});
