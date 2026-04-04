const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');

const {
  GUIDE_MANIFEST,
  GUIDE_COMPONENT_TYPES,
  GUIDE_MEDIA_REFERENCES
} = require('../src/utils/guideManifest');

test('guide manifest includes exactly one entry for each canonical builder component type', () => {
  const componentIds = GUIDE_MANIFEST.components.map((component) => component.id);
  const uniqueComponentIds = new Set(componentIds);

  assert.equal(
    componentIds.length,
    uniqueComponentIds.size,
    'guide component entries should not contain duplicates'
  );

  assert.deepEqual(
    [...uniqueComponentIds].sort(),
    [...GUIDE_COMPONENT_TYPES].sort()
  );
});

test('guide component entries include compact reference content and required media', () => {
  GUIDE_MANIFEST.components.forEach((component) => {
    assert.ok(component.summary, `${component.id} is missing a summary`);
    assert.ok(Array.isArray(component.options) && component.options.length > 0, `${component.id} is missing unique options`);

    assert.ok(component.media?.photo?.src, `${component.id} is missing a component photo`);
    assert.equal(component.media?.photo?.kind, 'image', `${component.id} component photo should be an image`);

    if (component.media?.setup) {
      assert.equal(component.media?.setup?.kind, 'image', `${component.id} setup view should be an image`);
    }

    if (component.showVideo) {
      assert.ok(component.media?.video?.src, `${component.id} is missing a component video`);
      assert.equal(component.media?.video?.kind, 'video', `${component.id} video should be a video`);
      assert.ok(component.media?.video?.poster, `${component.id} video is missing a poster`);
    }
  });
});

test('guide media references resolve to committed public assets', async () => {
  await Promise.all(GUIDE_MEDIA_REFERENCES.map(async (mediaRef) => {
    const relativePath = String(mediaRef || '').replace(/^\/+/, '');
    const absolutePath = path.join(__dirname, '..', 'public', relativePath.replace(/^public\//, ''));
    await fs.access(absolutePath);
  }));
});
