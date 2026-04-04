const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { once } = require('node:events');

const { chromium } = require('playwright');

const { createApp } = require('../src/server');
const { GUIDE_VIDEO_TARGET_DURATION_SECONDS } = require('../src/utils/guideManifest');
const { GUIDE_SAMPLE_FORM } = require('../src/utils/guideSampleForm');

const OUTPUT_DIR = path.join(__dirname, '../public/media/guide');
const DEFAULT_VIEWPORT = { width: 1440, height: 1200 };
const VIDEO_VIEWPORT = { width: 1280, height: 900 };
const COMPONENT_VIEWPORT = { width: 1200, height: 920 };
const GUIDE_VIDEO_TARGET_DURATION_MS = GUIDE_VIDEO_TARGET_DURATION_SECONDS * 1000;
const BLANK_FORM = {
  label: 'Grouping',
  key: 'grouping',
  type: 'fieldset',
  input: false,
  tableView: false,
  components: []
};

const COMPONENT_CAPTURE_SPECS = [
  { id: 'disclaimer', section: 'Site Details', label: 'Crew Notice', setupKind: 'modal', action: 'edit', modalSelector: '#labelOptionsModal .modal-content' },
  { id: 'textarea', section: 'Site Details', label: 'Inspection Summary', setupKind: 'menu' },
  { id: 'account', section: 'Site Details', label: 'Assigned Worker', setupKind: 'menu' },
  { id: 'choiceList', section: 'Site Details', label: 'Roof Condition', setupKind: 'modal', action: 'edit', modalSelector: '#labelOptionsModal .modal-content' },
  { id: 'componentGroup', section: 'Findings', label: 'Crew Tasks', setupKind: 'modal', action: 'edit', modalSelector: '#labelOptionsModal .modal-content' },
  { id: 'survey', section: 'Findings', label: 'Inspection Checklist', setupKind: 'modal', action: 'edit', modalSelector: '#labelOptionsModal .modal-content' },
  { id: 'quiz', section: 'Knowledge Check', photoSection: 'Root (Grouping)', photoLabel: 'Knowledge Check', setupKind: 'section-quiz', modalSelector: '#answerKeyModal .modal-content' },
  { id: 'file', section: 'Findings', label: 'Site Photos', setupKind: 'menu' },
  { id: 'phoneNumber', section: 'Site Details', label: 'Callback Number', setupKind: 'menu' },
  { id: 'address', section: 'Site Details', label: 'Site Address', setupKind: 'menu' },
  { id: 'asset', section: 'Site Details', label: 'Unit', setupKind: 'menu' },
  { id: 'datetime', section: 'Site Details', label: 'Site Visit', setupKind: 'menu' },
  { id: 'number', section: 'Findings', label: 'Inspection Score', setupKind: 'menu' },
  { id: 'datagrid', section: 'Tables', label: 'Material List', setupKind: 'menu' },
  { id: 'editgrid', section: 'Tables', label: 'Repair Line Items', setupKind: 'modal', action: 'edit', modalSelector: '#labelOptionsModal .modal-content' }
];

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function outputPath(fileName) {
  return path.join(OUTPUT_DIR, fileName);
}

async function ensureOutputDir() {
  await fs.mkdir(OUTPUT_DIR, { recursive: true });
}

async function ensureMinimumVideoDuration(page, startedAt) {
  const elapsed = Date.now() - startedAt;
  const remaining = GUIDE_VIDEO_TARGET_DURATION_MS - elapsed;
  if (remaining > 0) {
    await page.waitForTimeout(remaining);
  }
}

async function startServer() {
  const app = createApp();
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  return {
    server,
    baseUrl: `http://127.0.0.1:${address.port}`
  };
}

async function stopServer(server) {
  if (!server) return;
  await new Promise((resolve, reject) => {
    server.close((err) => (err ? reject(err) : resolve()));
  });
}

async function createStorageState(browser, baseUrl, tempDir) {
  if (!String(process.env.APP_PASSWORD || '').trim()) {
    return null;
  }

  const context = await browser.newContext({ viewport: DEFAULT_VIEWPORT });
  const page = await context.newPage();

  await page.goto(`${baseUrl}/login`, { waitUntil: 'networkidle' });
  await page.fill('#password', process.env.APP_PASSWORD);
  await Promise.all([
    page.waitForURL(/\/formbuilder/),
    page.click('button[type="submit"]')
  ]);

  const storageStatePath = path.join(tempDir, 'guide-capture-storage-state.json');
  await context.storageState({ path: storageStatePath });
  await context.close();
  return storageStatePath;
}

async function createBuilderContext(browser, baseUrl, options = {}) {
  const viewport = options.viewport || DEFAULT_VIEWPORT;
  const contextOptions = {
    viewport,
    deviceScaleFactor: options.deviceScaleFactor || 2
  };

  if (options.storageState) {
    contextOptions.storageState = options.storageState;
  }

  if (options.videoDir) {
    contextOptions.recordVideo = {
      dir: options.videoDir,
      size: viewport
    };
  }

  const context = await browser.newContext(contextOptions);
  const page = await context.newPage();
  const builderForm = clone(options.form || GUIDE_SAMPLE_FORM);
  const templateContext = {
    name: options.templateName || 'Guide Sample Form',
    templateId: 'guide-sample',
    versionId: 'guide-sample-v1'
  };

  await page.addInitScript(({ form, templateName, templateContextValue }) => {
    localStorage.setItem('importedForm', JSON.stringify(form));
    localStorage.setItem('builderTemplateLoadName', templateName);
    localStorage.setItem('builderTemplateContext', JSON.stringify(templateContextValue));
  }, {
    form: builderForm,
    templateName: options.templateName || 'Guide Sample Form',
    templateContextValue: templateContext
  });

  await page.goto(`${baseUrl}/formbuilder`, { waitUntil: 'networkidle' });
  await page.waitForSelector('#componentTypeContainer .card[data-type="textarea"]');
  await page.waitForSelector('#componentList');
  await page.waitForTimeout(1200);

  if (options.focusMode === 'component') {
    await page.addStyleTag({
      content: `
        .builder-side-panel,
        .builder-json-preview {
          display: none !important;
        }

        #builderMain .builder-workspace {
          width: min(980px, calc(100vw - 28px)) !important;
          grid-template-columns: minmax(0, 1fr) !important;
          gap: 0 !important;
        }

        #builderMain .builder-main-panel.container {
          max-width: 980px !important;
          margin: 0 auto !important;
        }

        #builderMain .builder-destination-panel,
        #builderMain .builder-list-panel {
          max-width: 980px !important;
          margin-left: auto !important;
          margin-right: auto !important;
        }

        body.builder-page {
          zoom: 1.2 !important;
        }
      `
    });
    await page.waitForTimeout(400);
  }

  return { context, page };
}

async function createStatsContext(browser, baseUrl, options = {}) {
  const context = await browser.newContext({
    viewport: options.viewport || DEFAULT_VIEWPORT,
    storageState: options.storageState || undefined
  });
  const page = await context.newPage();

  const overviewPayload = {
    activeTemplates: 12,
    sessionTimeStats: {
      averageMs: 11 * 60 * 1000,
      longestMs: 27 * 60 * 1000
    },
    topComponents: [
      { type: 'choiceList', count: 18 },
      { type: 'textarea', count: 14 },
      { type: 'survey', count: 8 }
    ]
  };

  const templatesPayload = {
    items: [
      {
        templateId: 'tpl_roof_audit',
        currentVersionId: 'ver_roof_audit_4',
        displayName: 'Roof Inspection Starter',
        latestSavedAt: '2026-03-18T13:00:00.000Z',
        totalComponents: 24,
        versionCount: 4,
        uniqueTypes: 11,
        conditionalCount: 2,
        calculationCount: 1,
        sessionElapsedMs: 16 * 60 * 1000,
        status: 'active',
        canLoad: true,
        topMix: [
          { type: 'choiceList', count: 4 },
          { type: 'textarea', count: 3 },
          { type: 'survey', count: 1 }
        ]
      },
      {
        templateId: 'tpl_safety_quiz',
        currentVersionId: 'ver_safety_quiz_2',
        displayName: 'Safety Quiz Pack',
        latestSavedAt: '2026-03-15T09:30:00.000Z',
        totalComponents: 17,
        versionCount: 2,
        uniqueTypes: 8,
        conditionalCount: 0,
        calculationCount: 0,
        sessionElapsedMs: 9 * 60 * 1000,
        status: 'active',
        canLoad: true,
        topMix: [
          { type: 'quiz', count: 1 },
          { type: 'choiceList', count: 3 }
        ]
      }
    ],
    nextCursor: null,
    hasMore: false
  };

  await page.route('**/api/stats/overview', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(overviewPayload)
    });
  });

  await page.route('**/api/templates**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(templatesPayload)
    });
  });

  await page.goto(`${baseUrl}/stats?view=card`, { waitUntil: 'networkidle' });
  await page.waitForSelector('.template-report-card');
  await page.waitForTimeout(600);

  return { context, page };
}

async function saveVideo(video, destinationPath) {
  if (!video) {
    throw new Error(`Expected a recorded video for ${destinationPath}`);
  }

  const sourcePath = await video.path();
  await fs.copyFile(sourcePath, destinationPath);
}

async function captureImage(locatorOrPage, fileName, options = {}) {
  await locatorOrPage.screenshot({
    path: outputPath(fileName),
    animations: 'disabled',
    ...options
  });
}

async function findComponentCard(page, labelText) {
  const card = page.locator('#componentList .component-card[data-path]').filter({
    hasText: labelText
  }).first();
  await card.scrollIntoViewIfNeeded();
  return card;
}

async function selectSection(page, labelText) {
  const section = page.locator('#fieldsetList .fieldset-card').filter({
    hasText: labelText
  }).first();
  await section.scrollIntoViewIfNeeded();
  await section.click();
  await page.waitForTimeout(350);
}

async function clickCardAction(page, labelText, action) {
  const card = await findComponentCard(page, labelText);
  await card.hover();
  const button = card.locator(`.component-action-btn[data-action="${action}"]`).first();
  await button.click({ force: true });
}

async function openCardMenu(page, labelText) {
  const card = await findComponentCard(page, labelText);
  await card.hover();
  await card.locator('.anchor-btn').click({ force: true });
  await page.waitForTimeout(300);
  return card;
}

async function readComponentOrder(page) {
  return page.evaluate(() => {
    return Array.from(document.querySelectorAll('#componentList .component-card[data-path] .comp-label'))
      .map((node) => (node.textContent || '').replace(/\s+/g, ' ').trim())
      .filter(Boolean);
  });
}

async function dragComponentCard(page, sourceLabel, targetLabel) {
  const sourceHandle = page.locator('#componentList .component-card[data-path]').filter({
    hasText: sourceLabel
  }).first().locator('.component-details');
  const targetHandle = page.locator('#componentList .component-card[data-path]').filter({
    hasText: targetLabel
  }).first().locator('.component-details');

  await sourceHandle.scrollIntoViewIfNeeded();
  await targetHandle.scrollIntoViewIfNeeded();

  const sourceBox = await sourceHandle.boundingBox();
  const targetBox = await targetHandle.boundingBox();

  if (!sourceBox || !targetBox) {
    throw new Error(`Unable to drag "${sourceLabel}" to "${targetLabel}" because one of the cards is not visible.`);
  }

  await page.mouse.move(
    sourceBox.x + sourceBox.width / 2,
    sourceBox.y + sourceBox.height / 2
  );
  await page.mouse.down();
  await page.waitForTimeout(180);
  await page.mouse.move(
    targetBox.x + targetBox.width / 2,
    targetBox.y + targetBox.height + 28,
    { steps: 20 }
  );
  await page.waitForTimeout(220);
  await page.mouse.up();
  await page.waitForTimeout(800);
}

async function captureBuilderOverview(browser, baseUrl, storageState) {
  console.log('Capturing builder overview...');
  const { context, page } = await createBuilderContext(browser, baseUrl, { storageState });
  try {
    await captureImage(page.locator('#builderMain'), 'builder-overview.png');
    await captureImage(page.locator('.builder-palette-panel'), 'palette-panel.png');
    await captureImage(page.locator('.builder-destination-panel'), 'sections-rail.png');
    await selectSection(page, 'Site Details');
    await captureImage(page.locator('.builder-list-panel'), 'component-list.png');
  } finally {
    await context.close();
  }
}

async function captureAddComponentLoop(browser, baseUrl, storageState, tempDir) {
  console.log('Capturing add-component loop...');
  const videoDir = path.join(tempDir, 'video-add-component');
  await fs.mkdir(videoDir, { recursive: true });
  const { context, page } = await createBuilderContext(browser, baseUrl, {
    storageState,
    form: BLANK_FORM,
    templateName: 'Blank Guide Form',
    videoDir,
    viewport: VIDEO_VIEWPORT
  });
  const captureStartedAt = Date.now();

  try {
    await page.waitForTimeout(900);
    await page.click('#addFieldsetBtn');
    await page.waitForSelector('#fieldsetList .fieldset-card[data-key]:not([data-key="root"])');
    await page.waitForTimeout(1200);
    await page.click('#componentTypeContainer .card[data-type="textarea"]');
    await page.waitForSelector('#componentList .component-card[data-path]');
    await page.waitForTimeout(1800);
    await captureImage(page.locator('#builderMain'), 'add-component-loop-poster.png');
  } finally {
    const video = page.video();
    await ensureMinimumVideoDuration(page, captureStartedAt);
    await context.close();
    await saveVideo(video, outputPath('add-component-loop.webm'));
  }
}

async function captureChoiceListVariantMedia(browser, baseUrl, storageState, tempDir) {
  console.log('Capturing choice-list modal and variant loop...');
  const videoDir = path.join(tempDir, 'video-choice-variants');
  await fs.mkdir(videoDir, { recursive: true });
  const { context, page } = await createBuilderContext(browser, baseUrl, {
    storageState,
    form: BLANK_FORM,
    templateName: 'Blank Guide Form',
    videoDir,
    viewport: VIDEO_VIEWPORT
  });
  const captureStartedAt = Date.now();

  try {
    await page.waitForTimeout(900);
    await page.click('#componentTypeContainer .card[data-type="choiceList"]');
    await page.waitForSelector('#labelOptionsModal', { state: 'visible' });
    await page.waitForTimeout(1200);
    await captureImage(page.locator('#labelOptionsModal .modal-content'), 'component-config-choice-list.png');

    await page.click('#lsRadio');
    await page.waitForTimeout(1400);
    await page.click('#lsSelectboxes');
    await page.waitForTimeout(1400);
    await page.click('#lsSelect');
    await page.waitForTimeout(1800);
    await captureImage(page.locator('#labelOptionsModal .modal-content'), 'variant-switch-loop-poster.png');
  } finally {
    const video = page.video();
    await ensureMinimumVideoDuration(page, captureStartedAt);
    await context.close();
    await saveVideo(video, outputPath('variant-switch-loop.webm'));
  }
}

async function captureDragDropLoop(browser, baseUrl, storageState, tempDir) {
  console.log('Capturing drag-and-drop loop...');
  const videoDir = path.join(tempDir, 'video-drag-drop');
  await fs.mkdir(videoDir, { recursive: true });
  const { context, page } = await createBuilderContext(browser, baseUrl, {
    storageState,
    videoDir,
    viewport: VIDEO_VIEWPORT,
    focusMode: 'component'
  });
  const captureStartedAt = Date.now();

  try {
    await selectSection(page, 'Site Details');
    await page.waitForTimeout(1000);
    const orderBefore = await readComponentOrder(page);

    await dragComponentCard(page, 'Repair Follow-Up', 'Site Visit');

    const orderAfter = await readComponentOrder(page);
    const movedIndex = orderAfter.findIndex((label) => label.includes('Repair Follow-Up'));
    const targetIndex = orderAfter.findIndex((label) => label.includes('Site Visit'));

    if (movedIndex === -1 || targetIndex === -1 || movedIndex <= targetIndex) {
      throw new Error(`Drag-and-drop reorder did not complete as expected.\nBefore: ${orderBefore.join(' | ')}\nAfter: ${orderAfter.join(' | ')}`);
    }

    await page.waitForTimeout(1600);
    await captureImage(page.locator('.builder-list-panel'), 'drag-drop-loop-poster.png');
  } finally {
    const video = page.video();
    await ensureMinimumVideoDuration(page, captureStartedAt);
    await context.close();
    await saveVideo(video, outputPath('drag-drop-loop.webm'));
  }
}

async function captureComponentReferenceMedia(browser, baseUrl, storageState, tempDir) {
  console.log('Capturing component reference media...');

  for (const spec of COMPONENT_CAPTURE_SPECS) {
    console.log(`Capturing ${spec.id} media...`);
    const videoDir = path.join(tempDir, `video-${spec.id}`);
    await fs.mkdir(videoDir, { recursive: true });

    const { context, page } = await createBuilderContext(browser, baseUrl, {
      storageState,
      videoDir,
      viewport: COMPONENT_VIEWPORT,
      focusMode: 'component'
    });
    const captureStartedAt = Date.now();

    try {
      await selectSection(page, spec.photoSection || spec.section);
      await page.waitForTimeout(950);
      const componentCard = await findComponentCard(page, spec.photoLabel || spec.label);
      await captureImage(componentCard, `${spec.id}-card.png`);

      if (spec.setupKind === 'menu') {
        await selectSection(page, spec.section);
        await page.waitForTimeout(900);
        const setupCard = await openCardMenu(page, spec.label);
        await page.waitForTimeout(1800);
        await captureImage(setupCard, `${spec.id}-setup.png`);
      } else if (spec.setupKind === 'section-quiz') {
        await selectSection(page, spec.section);
        await page.waitForTimeout(900);
        await page.click('#openQuizSetupBtn');
        await page.waitForFunction(() => {
          const display = document.getElementById('answerKeyModal')?.style.display || '';
          return display !== '' && display !== 'none';
        });
        await page.waitForTimeout(2000);
        await captureImage(page.locator(spec.modalSelector), `${spec.id}-setup.png`);
      } else if (spec.setupKind === 'quiz') {
        await clickCardAction(page, spec.label, spec.action);
        await page.waitForFunction(() => {
          const display = document.getElementById('answerKeyModal')?.style.display || '';
          return display !== '' && display !== 'none';
        });
        await page.waitForTimeout(2000);
        await captureImage(page.locator(spec.modalSelector), `${spec.id}-setup.png`);
      } else {
        await clickCardAction(page, spec.label, spec.action);
        await page.waitForSelector(spec.modalSelector, { state: 'visible' });
        await page.waitForTimeout(2000);
        await captureImage(page.locator(spec.modalSelector), `${spec.id}-setup.png`);
      }
    } finally {
      const video = page.video();
      await ensureMinimumVideoDuration(page, captureStartedAt);
      await context.close();
      await saveVideo(video, outputPath(`${spec.id}-video.webm`));
    }
  }
}

async function captureSaveAndImportMedia(browser, baseUrl, storageState) {
  console.log('Capturing save/import modals...');
  const { context, page } = await createBuilderContext(browser, baseUrl, { storageState });
  try {
    await page.click('#saveTemplateBtn');
    await page.waitForSelector('#saveTemplateModal[aria-hidden="false"]');
    await captureImage(page.locator('#saveTemplateModal .modal-content'), 'save-template-modal.png');
    await page.click('#saveTemplateCancelBtn');
    await page.waitForTimeout(250);

    await page.click('#importJsonBtn');
    await page.waitForSelector('#importJsonModal', { state: 'visible' });
    await captureImage(page.locator('#importJsonModal .modal-content'), 'import-json-modal.png');
  } finally {
    await context.close();
  }
}

async function captureConditionalMedia(browser, baseUrl, storageState, tempDir) {
  console.log('Capturing conditional-logic modal and loop...');
  const videoDir = path.join(tempDir, 'video-conditional');
  await fs.mkdir(videoDir, { recursive: true });
  const { context, page } = await createBuilderContext(browser, baseUrl, {
    storageState,
    videoDir,
    viewport: VIDEO_VIEWPORT
  });
  const captureStartedAt = Date.now();

  try {
    await selectSection(page, 'Site Details');
    await page.waitForTimeout(900);
    await clickCardAction(page, 'Inspection Summary', 'conditional');
    await page.waitForSelector('#conditionalModal', { state: 'visible' });
    await page.evaluate(() => {
      const triggerCard = document.querySelector('#whenKeyCards [data-key="roofCondition"]');
      triggerCard?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await page.waitForFunction(() => document.querySelectorAll('#eqValueCards .card').length > 0);
    await page.waitForTimeout(700);
    await page.evaluate(() => {
      const cards = Array.from(document.querySelectorAll('#eqValueCards .card'));
      const valueCard = cards.find((card) => /repair/i.test(card.textContent || ''));
      valueCard?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await page.waitForTimeout(1900);
    await captureImage(page.locator('#conditionalModal .modal-content'), 'conditional-logic.png');
    await captureImage(page.locator('#conditionalModal .modal-content'), 'conditional-logic-loop-poster.png');
  } finally {
    const video = page.video();
    await ensureMinimumVideoDuration(page, captureStartedAt);
    await context.close();
    await saveVideo(video, outputPath('conditional-logic-loop.webm'));
  }
}

async function captureCalculatorMedia(browser, baseUrl, storageState) {
  console.log('Capturing calculator modal...');
  const { context, page } = await createBuilderContext(browser, baseUrl, { storageState });
  try {
    await selectSection(page, 'Findings');
    await page.evaluate(() => {
      const cards = Array.from(document.querySelectorAll('#componentList .component-card[data-path]'));
      const targetCard = cards.find((card) => /total with tax/i.test(card.textContent || ''));
      const actionButton = targetCard?.querySelector('.component-action-btn[data-action="calc"]');
      if (!actionButton) {
        throw new Error('Unable to open calculator modal for Total With Tax.');
      }
      actionButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await page.waitForFunction(() => document.getElementById('calcModal')?.style.display === 'block');
    await captureImage(page.locator('#calcModal .modal-content'), 'calculator-modal.png');
  } finally {
    await context.close();
  }
}

async function captureQuizSetupMedia(browser, baseUrl, storageState) {
  console.log('Capturing quiz setup modal...');
  const { context, page } = await createBuilderContext(browser, baseUrl, { storageState });
  try {
    await selectSection(page, 'Knowledge Check');
    await page.click('#openQuizSetupBtn');
    await page.waitForFunction(() => {
      const display = document.getElementById('answerKeyModal')?.style.display || '';
      return display !== '' && display !== 'none';
    });
    await captureImage(page.locator('#answerKeyModal .modal-content'), 'quiz-setup.png');
  } finally {
    await context.close();
  }
}

async function captureAiAssistMedia(browser, baseUrl, storageState) {
  console.log('Capturing AI assist panel...');
  const { context, page } = await createBuilderContext(browser, baseUrl, { storageState });
  try {
    await page.click('#aiAssistBtn');
    await page.waitForSelector('#aiChat.open');
    await page.waitForTimeout(300);
    await captureImage(page.locator('#aiChat'), 'ai-assist.png');
  } finally {
    await context.close();
  }
}

async function captureStatsMedia(browser, baseUrl, storageState) {
  console.log('Capturing stats page...');
  const { context, page } = await createStatsContext(browser, baseUrl, { storageState });
  try {
    await captureImage(page.locator('.stats-main-panel'), 'stats-library.png');
  } finally {
    await context.close();
  }
}

async function captureDesignSystemMedia(browser, baseUrl, storageState) {
  console.log('Capturing design-system page...');
  const context = await browser.newContext({
    viewport: DEFAULT_VIEWPORT,
    storageState: storageState || undefined
  });
  const page = await context.newPage();

  try {
    await page.goto(`${baseUrl}/design-system`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(300);
    await captureImage(page.locator('.ds-shell'), 'design-system.png');
  } finally {
    await context.close();
  }
}

async function main() {
  await ensureOutputDir();

  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'guide-capture-'));
  let server;
  let browser;

  try {
    let baseUrl = '';
    ({ server, baseUrl } = await startServer());

    try {
      browser = await chromium.launch({ headless: true });
    } catch (err) {
      throw new Error(
        `Unable to launch Playwright Chromium. Install it with "npx playwright install chromium".\n${err.message}`
      );
    }

    const storageState = await createStorageState(browser, baseUrl, tempDir);

    await captureBuilderOverview(browser, baseUrl, storageState);
    await captureComponentReferenceMedia(browser, baseUrl, storageState, tempDir);
    await captureAddComponentLoop(browser, baseUrl, storageState, tempDir);
    await captureChoiceListVariantMedia(browser, baseUrl, storageState, tempDir);
    await captureDragDropLoop(browser, baseUrl, storageState, tempDir);
    await captureSaveAndImportMedia(browser, baseUrl, storageState);
    await captureConditionalMedia(browser, baseUrl, storageState, tempDir);
    await captureCalculatorMedia(browser, baseUrl, storageState);
    await captureQuizSetupMedia(browser, baseUrl, storageState);
    await captureAiAssistMedia(browser, baseUrl, storageState);
    await captureStatsMedia(browser, baseUrl, storageState);
    await captureDesignSystemMedia(browser, baseUrl, storageState);

    console.log(`Guide media refreshed in ${OUTPUT_DIR}`);
  } finally {
    if (browser) {
      await browser.close().catch(() => {});
    }
    await stopServer(server).catch(() => {});
  }
}

main().catch((err) => {
  console.error(err.stack || err.message || err);
  process.exit(1);
});
