/*  routes/formbuilder.js
    ——————————————————————————————————————————— */
const express = require('express');
const router  = express.Router();
const _       = require('lodash');            // _.startCase, _.camelCase
const { getPublicAiFeatures } = require('../config/runtimeConfig');
const { LANG_LABELS, ORIGINAL_VALUE } = require('../utils/templateTranslation');

const DEFAULT_COMPONENT_TYPES = [
  'textarea', 'choiceList', 'survey', 'account', 'datetime', 'disclaimer', 'number',
  'file', 'phoneNumber', 'address', 'asset', 'datagrid', 'editgrid', 'componentGroup', 'quiz'
];

const COMPONENT_USAGE_GROUPS = {
  disclaimer: ['disclaimer', 'content'],
  textarea: ['textarea'],
  account: ['account'],
  choiceList: ['choiceList', 'radio', 'select', 'selectboxes'],
  componentGroup: ['componentGroup'],
  survey: ['survey'],
  quiz: ['quiz'],
  file: ['file', 'documents'],
  phoneNumber: ['phoneNumber'],
  address: ['address'],
  asset: ['asset'],
  datetime: ['datetime', 'date', 'time'],
  number: ['number', 'currency'],
  datagrid: ['datagrid'],
  editgrid: ['editgrid']
};

const FIXED_PALETTE_ORDER = [
  ['componentGroup', 'quiz'],
  ['editgrid', 'componentGroup'],
  ['datagrid', 'editgrid']
];

function toUsageCount(value) {
  const count = Number(value);
  return Number.isFinite(count) ? Math.max(0, count) : 0;
}

function pinPaletteOrder(componentTypes = []) {
  let orderedTypes = Array.isArray(componentTypes) ? componentTypes.slice() : [];

  FIXED_PALETTE_ORDER.forEach(([type, anchor]) => {
    const typeIndex = orderedTypes.indexOf(type);
    const anchorIndex = orderedTypes.indexOf(anchor);
    if (typeIndex === -1 || anchorIndex === -1 || typeIndex === anchorIndex - 1) {
      return;
    }

    orderedTypes.splice(typeIndex, 1);
    const nextAnchorIndex = orderedTypes.indexOf(anchor);
    orderedTypes.splice(nextAnchorIndex, 0, type);
  });

  return orderedTypes;
}

function buildOrderedComponentTypes(rawUsageTotals = {}) {
  const defaultOrderIndex = new Map(DEFAULT_COMPONENT_TYPES.map((type, index) => [type, index]));
  const countsByType = DEFAULT_COMPONENT_TYPES.reduce((acc, type) => {
    acc[type] = (COMPONENT_USAGE_GROUPS[type] || [type])
      .reduce((sum, usageType) => sum + toUsageCount(rawUsageTotals?.[usageType]), 0);
    return acc;
  }, {});

  return pinPaletteOrder(DEFAULT_COMPONENT_TYPES
    .slice()
    .sort((a, b) => {
      if (countsByType[b] !== countsByType[a]) return countsByType[b] - countsByType[a];
      return defaultOrderIndex.get(a) - defaultOrderIndex.get(b);
    }));
}

router.get('/', (_req, res) => {
  res.redirect('/formbuilder');
});

router.get('/design-system', (_req, res) => {
  const html = /* html */ `
  <!DOCTYPE html>
  <html lang="en">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Design System</title>
    <link rel="icon" type="image/svg+xml" href="/favicon.svg">
    <link rel="shortcut icon" href="/favicon.svg">
    <link rel="stylesheet" href="/css/design-system.css">
  </head>
  <body class="ds-page">
    <main class="ds-shell ds-stack">
      <section class="ds-surface ds-stack-sm">
        <p class="ds-eyebrow">Form Builder</p>
        <h1 class="ds-display">Design System</h1>
        <p class="ds-copy">Shared tokens, primitives, and examples used across the builder UI.</p>
        <div class="ds-cluster">
          <a class="ds-btn ds-btn-primary" href="/formbuilder">Open Builder</a>
          <a class="ds-btn ds-btn-secondary" href="/stats">Open Stats</a>
        </div>
      </section>

      <section class="ds-grid">
        <article class="ds-surface ds-stack-sm">
          <p class="ds-eyebrow">Typography</p>
          <h2 class="ds-title">Core Text Styles</h2>
          <p class="ds-copy">Display, title, body copy, and muted helper text are all token-driven.</p>
          <p class="ds-display" style="font-size:2rem;">Fraunces Display</p>
          <p class="ds-title">Plus Jakarta Sans Title</p>
          <p class="ds-copy">Body copy uses the main sans family with balanced contrast.</p>
          <p class="ds-muted">Muted text is reserved for metadata and secondary guidance.</p>
        </article>

        <article class="ds-surface ds-stack-sm">
          <p class="ds-eyebrow">Actions</p>
          <h2 class="ds-title">Button Variants</h2>
          <div class="ds-cluster">
            <button class="ds-btn ds-btn-primary" type="button">Primary</button>
            <button class="ds-btn ds-btn-secondary" type="button">Secondary</button>
            <button class="ds-btn ds-btn-ghost" type="button">Ghost</button>
            <button class="ds-btn ds-btn-danger" type="button">Danger</button>
          </div>
          <div class="ds-cluster">
            <span class="ds-badge ds-badge-info">Info</span>
            <span class="ds-badge ds-badge-warning">Warning</span>
            <span class="ds-badge ds-badge-success">Success</span>
          </div>
        </article>

        <article class="ds-surface ds-stack-sm">
          <p class="ds-eyebrow">Inputs</p>
          <h2 class="ds-title">Form Primitives</h2>
          <input class="ds-input" type="text" value="Component label">
          <select class="ds-select">
            <option>Dropdown option</option>
          </select>
          <textarea class="ds-textarea">Textarea and note fields share the same radius, spacing, and contrast tokens.</textarea>
        </article>
      </section>

      <section class="ds-surface ds-stack-sm">
        <p class="ds-eyebrow">Tokens</p>
        <h2 class="ds-title">Sample Palette</h2>
        <div class="ds-token-grid">
          <article class="ds-token-card">
            <div class="ds-swatch" style="background: var(--ds-color-canvas);"></div>
            <div class="ds-stack-sm">
              <strong>Canvas</strong>
              <code class="ds-code">--ds-color-canvas</code>
            </div>
          </article>
          <article class="ds-token-card">
            <div class="ds-swatch" style="background: var(--ds-color-surface);"></div>
            <div class="ds-stack-sm">
              <strong>Surface</strong>
              <code class="ds-code">--ds-color-surface</code>
            </div>
          </article>
          <article class="ds-token-card">
            <div class="ds-swatch" style="background: var(--ds-color-accent);"></div>
            <div class="ds-stack-sm">
              <strong>Accent</strong>
              <code class="ds-code">--ds-color-accent</code>
            </div>
          </article>
          <article class="ds-token-card">
            <div class="ds-swatch" style="background: var(--ds-color-info);"></div>
            <div class="ds-stack-sm">
              <strong>Info</strong>
              <code class="ds-code">--ds-color-info</code>
            </div>
          </article>
        </div>
      </section>
    </main>
  </body>
  </html>`;

  res.send(html);
});

// ────────────────────────────────────────────────────────────────────────────
// GET /formbuilder
// ────────────────────────────────────────────────────────────────────────────
router.get('/formbuilder', async (req, res) => {
  const aiFeatures = getPublicAiFeatures();
  const optionsImageHint = aiFeatures.imageExtraction
    ? 'Drag a screenshot here to extract options.'
    : 'Enter options manually.';
  const surveyImageHint = aiFeatures.imageExtraction
    ? 'Drag a screenshot here to extract questions.'
    : 'Enter survey questions manually.';
  const componentGroupImageHint = aiFeatures.imageExtraction
    ? 'Drag a screenshot here to extract survey labels.'
    : 'Enter survey or radio labels manually.';
  const aiDropOverlayHtml = aiFeatures.fileUpload
    ? '<div id="aiDropOverlay" class="ai-drop-overlay">Drop files to queue for AI Assist</div>'
    : '';
  const aiComposerActionsHtml = [
    aiFeatures.fileUpload
      ? `<label for="aiFile" class="ai-mini-tool" aria-label="Upload file" title="Upload file">
            <i class="fa-solid fa-file-arrow-up"></i>
          </label>`
      : '',
    aiFeatures.dictation
      ? `<button type="button" id="aiMicBtn" class="ai-mini-tool" aria-label="Dictate prompt" title="Dictate prompt">
            <i class="fa-solid fa-microphone"></i>
          </button>`
      : ''
  ].filter(Boolean).join('');
  const aiFileInputHtml = aiFeatures.fileUpload
    ? `<input id="aiFile"
         type="file"
         accept=".pdf,.docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document,image/*"
         hidden />`
    : '';
  const aiAssistantHtml = aiFeatures.assistant
    ? `<!-- ——— AI side-chat ———————————————————————————— -->
${aiDropOverlayHtml}

<aside id="aiChat" class="ai-chat">
  <header class="ai-chat-topbar" data-ai-drag-handle>
    <button id="aiClose" type="button" aria-label="Close AI Assist">×</button>
  </header>

  <section id="aiMsgs" class="ai-chat-history"></section>

  <form id="aiForm" enctype="multipart/form-data">
    <div class="ai-composer">
      <div class="ai-input-shell">
        <textarea id="aiInput"
                  rows="4"
                  placeholder="Ask AI to change this form..."
                  autocomplete="off"></textarea>
        <div class="ai-composer-actions">
          ${aiComposerActionsHtml}
        </div>
        <button type="submit" class="ai-send-inline" aria-label="Send prompt">
          <i class="fa-solid fa-arrow-up"></i>
        </button>
      </div>
      ${aiFileInputHtml}
    </div>
  </form>
</aside>

<button id="aiAssistBtn" class="ai-assist-fab" type="button" aria-label="Open AI Assist">
  <span class="ai-assist-label">AI</span>
	</button>
	<!-- ——————————————————————————————————————————————— -->`
    : '';
  const aiAssistantScriptHtml = aiFeatures.assistant
    ? `<script src="/js/aiAssist.js" defer></script>
	    <script src="/js/aiChat.js" defer></script>`
    : '';

  /* ---------- COMPONENT PALETTE ---------- */
  const componentTypes = pinPaletteOrder(DEFAULT_COMPONENT_TYPES);
  const componentTypeMeta = {
    disclaimer: {
      label: 'Disclaimer',
      tooltip: 'Add a formatted notice or instruction block.',
      icon: 'fa-circle-info'
    },
    textarea: {
      label: 'Short Input',
      tooltip: 'Collect brief written responses, or switch to a detailed 3-row input.',
      icon: 'fa-pen'
    },
    account: {
      label: 'Worker',
      tooltip: 'Choose a worker or account entry from a managed list.',
      icon: 'fa-user'
    },
    choiceList: {
      label: 'Choices',
      tooltip: 'Create a dropdown, radio group, or select-box list from one card.',
      icon: 'fa-list-check'
    },
    componentGroup: {
      label: 'Field Group',
      tooltip: 'Create a section that contains either one survey or one radio question per line.',
      icon: 'fa-layer-group'
    },
    datagrid: {
      label: 'Basic Table',
      tooltip: 'Build repeatable grouped rows without opening the full editor first.',
      icon: 'fa-table'
    },
    survey: {
      label: 'Survey',
      tooltip: 'Build question-and-answer survey blocks with quick presets.',
      icon: 'fa-clipboard-list'
    },
    quiz: {
      label: 'Knowledge Check',
      tooltip: 'Create a quiz section with answer-key setup and graded results.',
      icon: 'fa-graduation-cap'
    },
    file: {
      label: 'Photo',
      tooltip: 'Capture one or more photos or files in the form.',
      icon: 'fa-camera'
    },
    phoneNumber: {
      label: 'Phone',
      tooltip: 'Collect formatted phone numbers.',
      icon: 'fa-phone'
    },
    address: {
      label: 'Address',
      tooltip: 'Insert a bundled street, city, state, and zip block.',
      icon: 'fa-location-dot'
    },
    asset: {
      label: 'Equipment',
      tooltip: 'Choose an asset from a managed list.',
      icon: 'fa-screwdriver-wrench'
    },
    datetime: {
      label: 'Date / Time',
      tooltip: 'Capture date and time, or switch it to date-only or time-only.',
      icon: 'fa-calendar-days'
    },
    number: {
      label: 'Number',
      tooltip: 'Create a number field and switch it to currency when needed.',
      icon: 'fa-hashtag'
    },
    editgrid: {
      label: 'Custom Table',
      tooltip: 'Build repeatable rows with a configurable layout.',
      icon: 'fa-table-list'
    }
  };

  const cardsHtml = componentTypes
    .map(t => {
      const meta = componentTypeMeta[t] || {};
      const label = _.escape(meta.label || _.startCase(t));
      const iconClass = _.escape(meta.icon || 'fa-square');
      const tooltip = _.escape(meta.tooltip || '');
      return `
        <div class="card component-type-card" data-type="${t}" aria-label="${label}">
          <span class="component-type-card__main">
            <i class="component-type-card__icon fa-solid ${iconClass}" aria-hidden="true"></i>
            <span class="component-type-card__label">${label}</span>
          </span>
          <div class="component-type-card__tooltip-card" role="presentation">
            <p class="component-type-card__tooltip-copy">${tooltip}</p>
          </div>
        </div>`;
    })
    .join('');
  const translationLanguageEntries = Object.entries(LANG_LABELS)
    .filter(([code]) => code !== ORIGINAL_VALUE && code !== 'en')
    .map(([code, label]) => [label, code]);
  const translationLanguageMapJson = _.escape(JSON.stringify(Object.fromEntries(translationLanguageEntries)));
  const initialFieldsetCardsHtml = `
    <button type="button" class="fieldset-card selected" data-key="root" aria-label="Root (Grouping)" aria-pressed="true">
      <span class="fieldset-card__label">Root (Grouping)</span>
    </button>`;
  const initialComponentListHtml = `<div class="component-empty-dropzone" aria-hidden="true"></div>`;
  const saveTemplateTranslateActionHtml = aiFeatures.translation
    ? `
                    <div class="save-template-translate-inline">
                      <label for="saveTemplateTranslationLanguageSelect" class="modal-section-title">Translation Language</label>
                      <input
                        id="saveTemplateTranslationLanguageSelect"
                        type="text"
                        list="saveTemplateTranslationLanguageList"
                        maxlength="120"
                        placeholder="No Translation"
                        autocomplete="off"
                        spellcheck="false"
                        data-language-map="${translationLanguageMapJson}">
                      <datalist id="saveTemplateTranslationLanguageList">
                        ${translationLanguageEntries
                          .map(([label, code]) => `<option value="${_.escape(label)}" data-code="${_.escape(code)}"></option>`)
                          .join('')}
                      </datalist>
                    </div>`
    : '';

  /* ---------- FULL HTML ---------- */
  const html = /* html */`
  <!DOCTYPE html>
  <html lang="en">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta
      name="description"
      content="Build, edit, and save Form.io templates with a visual form builder and AI-assisted drafting tools.">
    <title>Form Builder</title>
    <link rel="icon" type="image/svg+xml" href="/favicon.svg">
    <link rel="shortcut icon" href="/favicon.svg">
    <link rel="preconnect" href="https://cdn.jsdelivr.net" crossorigin>
    <link rel="preconnect" href="https://cdnjs.cloudflare.com" crossorigin>
    <link rel="preconnect" href="https://cdn.ckeditor.com" crossorigin>

    <!-- SortableJS (used by the builder & Kanban) --------------------------->
    <script src="https://cdn.jsdelivr.net/npm/sortablejs@1.15.0/Sortable.min.js" defer></script>

    <!-- Font Awesome ------------------------------------------------------->
    <link rel="stylesheet"
          href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css"
          crossorigin="anonymous" referrerpolicy="no-referrer">

    <!-- Builder styles ----------------------------------------------------->
    <script>
      document.documentElement.dataset.builderTheme = 'dark';
    </script>
    <link rel="stylesheet" href="/css/formBuilder.css">

    <!-- comment-icon sprite (for inline edit icons) ------------------------>
    <svg id="icon-comment" style="display:none" viewBox="0 0 24 24"
         xmlns="http://www.w3.org/2000/svg">
      <path fill="currentColor"
            d="M21 6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h12l4 4-.01-16Z"/>
    </svg>
  </head>

  <body class="builder-page">
    <div id="sessionTimer" class="session-timer">
      <div id="sessionTimerSummary" class="session-timer-summary">
        <div class="session-timer-display-trigger">
          <span class="session-timer-display-copy">
            <span class="session-timer-display-label">Current Session</span>
            <span id="sessionTimerDisplay">00:00</span>
          </span>
          <button
            id="sessionTimerReset"
            class="session-timer-reset-popover"
            type="button"
            data-reset-scope="builder"
          >
            Reset
          </button>
        </div>
        <div class="session-timer-actions">
          <a class="session-timer-summary-link" href="/stats">
            <span class="session-timer-summary-copy">
              <span class="session-timer-label">View Stats</span>
            </span>
          </a>
        </div>
      </div>
    </div>

	    <div class="builder-backdrop" aria-hidden="true"></div>
	    <span class="builder-corner-brand" aria-hidden="true">
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 150 38.172" focusable="false" aria-hidden="true">
        <path d="M415.383,62.643h9.08l-9.08-13.064,8.833-13.28h-8.74l-4.231,7.258L406.18,36.3H397.1l8.925,12.878-8.678,13.465h8.74l4.262-7.319Z" transform="translate(-274.463 -25.089)"/>
        <path d="M358.8,63.643h8.091V37.3H358.8Z" transform="translate(-247.991 -25.781)"/>
        <path d="M364.282,0A3.582,3.582,0,1,1,360.7,3.582,3.585,3.585,0,0,1,364.282,0Z" transform="translate(-249.304)" fill-rule="evenodd"/>
        <path d="M299,38.128h8.246V18.084h4.447V11.259h-4.447v-.247c0-2.841,1.112-3.8,4.293-3.613V.419C303.35-.013,299,3.446,299,10.487v.772h-3v6.856h3V38.128Z" transform="translate(-204.585 -0.265)"/>
        <path d="M237.891,50.722c0-4.54,2.224-7.721,6.053-7.721h2.224V36.3a9.851,9.851,0,0,0-8.277,4.663V36.609H229.8V62.983h8.091V50.722Z" transform="translate(-158.83 -25.089)"/>
        <path d="M166.106,61.03,162.4,58.188h0l3.706,6.238L172.561,53Z" transform="translate(-112.246 -36.632)"/>
        <path d="M153.827,46.85l3.212-1.328-1.575-3.768-3.212,1.328a10.425,10.425,0,0,0-2.965-2.965l1.328-3.212L146.848,35.3l-1.328,3.212a10.682,10.682,0,0,0-4.2,0L139.991,35.3l-3.768,1.575,1.328,3.212a10.425,10.425,0,0,0-2.965,2.965l-3.212-1.328L129.8,45.491l3.212,1.328a10.681,10.681,0,0,0,0,4.2L129.8,52.348l1.575,3.768,3.212-1.328a10.954,10.954,0,0,0,2.965,3l-1.328,3.212,3.768,1.575,1.328-3.212a10.682,10.682,0,0,0,4.2,0l1.328,3.212,3.768-1.575-1.328-3.212a10.425,10.425,0,0,0,2.965-2.965l3.212,1.328,1.575-3.768-3.212-1.328a10.681,10.681,0,0,0,0-4.2ZM143.389,55.22a6.269,6.269,0,1,1,6.269-6.269,6.274,6.274,0,0,1-6.269,6.269Z" transform="translate(-89.713 -24.398)"/>
        <path d="M186.4,56.4l2.749-3.4-2.131,4.015Z" transform="translate(-128.834 -36.632)"/>
        <path d="M0,20.169c0,11.087,7.721,18.87,18.653,18.87,8.833,0,15.473-4.91,17.573-12.94H26.313a8.243,8.243,0,0,1-7.783,4.756c-5.559,0-9.358-4.107-9.358-10.655s3.8-10.655,9.358-10.655A8.122,8.122,0,0,1,26.282,14.3H36.2c-2.1-8.03-8.771-13-17.573-13C7.721,1.269,0,9.082,0,20.169Z" transform="translate(0 -0.898)"/>
      </svg>
    </span>

	    <main id="builderMain" class="wrapper"><!-- sidebar + builder -->
        <div class="builder-workspace">
          <aside class="builder-side-panel" aria-label="Builder controls">
            <section class="builder-side-section builder-palette-panel">
              <div class="builder-side-section__head">
                <p class="builder-side-kicker">Palette</p>
                <h3>Components</h3>
                <p class="builder-side-copy">Add the next field below the selected component.</p>
              </div>
              <div id="componentTypeContainer" class="card-container builder-component-palette">
                ${cardsHtml}
              </div>
            </section>
          </aside>

	      <!-- ──────────────── MAIN BUILDER ──────────────── -->
	      <div class="container builder-main-panel">
        <section class="builder-destination-panel">
          <div class="builder-destination-head">
            <div class="builder-destination-copy">
              <p class="builder-side-kicker">Destination</p>
              <h3>Sections</h3>
              <p class="builder-side-copy">Choose a section, then click a component to place it.</p>
            </div>
            <div class="card-container builder-section-actions builder-section-actions--primary">
              <button id="addFieldsetBtn" class="card add-fieldset-button" data-tooltip="Add a new section."><span class="add-fieldset-button__label">Add Section</span></button>
            </div>
          </div>
          <div class="builder-destination-selector">
            <div class="builder-destination-rail" aria-label="Section browser">
              <button
                type="button"
                class="builder-destination-scroll builder-destination-scroll--prev"
                data-builder-section-scroll="prev"
                aria-controls="fieldsetList"
                aria-label="Scroll sections left"
                disabled
              >
                <i class="fa-solid fa-chevron-left" aria-hidden="true"></i>
              </button>
              <div class="builder-destination-viewport">
                <div id="fieldsetList" class="fieldset-container builder-destination-list">${initialFieldsetCardsHtml}</div>
              </div>
              <button
                type="button"
                class="builder-destination-scroll builder-destination-scroll--next"
                data-builder-section-scroll="next"
                aria-controls="fieldsetList"
                aria-label="Scroll sections right"
                disabled
              >
                <i class="fa-solid fa-chevron-right" aria-hidden="true"></i>
              </button>
            </div>
          </div>
          <div id="builderSectionContextTray" class="builder-destination-context" hidden>
            <div class="builder-destination-context__copy">
              <p class="builder-destination-context__eyebrow">Advanced Setup</p>
              <p id="builderSectionContextText" class="builder-destination-context__text">Tools for the current quiz section or selected custom table.</p>
            </div>
            <div class="card-container builder-section-actions builder-section-actions--context">
              <button id="openEditGridSetupBtn" type="button" class="card add-fieldset-button" data-tooltip="Configure the active custom table layout." hidden><span class="add-fieldset-button__label">Custom Table Setup</span></button>
              <button id="openQuizSetupBtn" type="button" class="card add-fieldset-button" data-tooltip="Set the pass mark and correct answers for the active quiz." hidden><span class="add-fieldset-button__label">Quiz Setup</span></button>
            </div>
          </div>
        </section>

        <section class="builder-list-panel">
          <!-- ▸ Component list header ------------------------------------------->
          <div class="builder-list-header">
            <div class="component-list-heading">
              <div class="builder-list-heading-copy">
                <h3>Component List</h3>
                <p>Click a component to move the insert target.</p>
              </div>
              <button id="undoBuilderBtn" class="component-list-undo-btn" type="button" disabled>
                <i class="fa-solid fa-rotate-left" aria-hidden="true"></i>
                <span>Undo</span>
              </button>
            </div>
          </div>

	          <!-- ▸ Component list container ---------------------------------------->
	          <div id="componentList">${initialComponentListHtml}</div>
        </section>

        <!-- ▸ JSON preview ----------------------------------------------------->
        <div id="jsonPreviewContainer" class="builder-json-preview">
          <pre id="formPreview"></pre>
          <div class="builder-json-actions">
            <div class="save-template-launcher">
              <div id="saveTemplateModal" class="save-template-flyout" hidden aria-hidden="true">
                <div class="save-template-modal-content">
                  <div class="modal-header">
                    <span class="close-btn" onclick="closeSaveTemplateModal()" aria-label="Close local publish panel">×</span>
                  </div>
                  <div class="modal-body save-template-modal-body">
                    <section class="save-template-section">
                      <p class="modal-section-title">Template Name</p>
                      <input
                        id="saveTemplateNameInput"
                        type="text"
                        maxlength="120"
                        placeholder="Enter template name"
                        autocomplete="off"
                        spellcheck="false">
                    </section>

                    <section class="save-template-section">
                      <p class="modal-section-title">Corfix Group Name</p>
                      <div class="save-template-inline-panel">
                        <input
                          id="saveTemplateGroupPickerInput"
                          type="text"
                          list="saveTemplateGroupPickerList"
                          maxlength="120"
                          placeholder="Enter group name"
                          autocomplete="off"
                          spellcheck="false">
                        <datalist id="saveTemplateGroupPickerList"></datalist>
                        <p id="saveTemplateGroupsStatus" class="save-template-groups-status" aria-live="polite"></p>
                      </div>
                    </section>

                    <section class="save-template-section">
                      ${saveTemplateTranslateActionHtml}
                    </section>

                  </div>
                </div>
              </div>
              <button id="saveTemplateBtn" type="button">Publish</button>
            </div>
            <button id="copyJsonBtn">Copy JSON</button>
            <button id="importJsonBtn">Import JSON</button>
          </div>
        </div>

        <!-- ===================== DARK OVERLAY ===================== -->
        <div id="overlay" class="overlay"></div>

        <!-- ===================== IMPORT-JSON MODAL ================= -->
        <div id="importJsonModal" class="modal">
          <div class="modal-content import-json-modal-content">
            <div class="modal-header">
              <div class="import-json-modal-heading">
                <h3>Import JSON</h3>
                <p>Paste a full form schema or a single component object.</p>
              </div>
              <span class="close-btn" onclick="closeImportJsonModal()">×</span>
            </div>
            <div class="modal-body import-json-modal-body">
              <label for="importJsonTextarea" class="modal-section-title">JSON Payload</label>
              <p class="modal-help-text">
                Accepted formats: a full form object with a <code>components</code> array, or one component object with a <code>type</code>.
              </p>
              <textarea id="importJsonTextarea"
                        class="import-json-textarea"
                        spellcheck="false"
                        placeholder='{
  "components": []
}'></textarea>
            </div>
            <div class="modal-buttons">
              <button id="importJsonCancelBtn" type="button" onclick="closeImportJsonModal()">Cancel</button>
              <button id="importJsonLoadBtn" type="button">Load JSON</button>
            </div>
          </div>
        </div>

        <!-- ===================== LABEL / OPTIONS MODAL ============== -->
        <div id="labelOptionsModal" class="modal">
          <div class="modal-content label-options-modal-content">
            <div class="modal-header">
              <h3 id="labelOptionsModalTitle">Configure Component</h3>
              <span class="close-btn" onclick="closeLabelOptionsModal()">×</span>
            </div>
            <div class="modal-body label-options-modal-body">
              <!-- (all fields exactly as before) -->
              <div class="label-options-field">
                <label id="labelOptionsLabelCaption">Component Label:</label>
                <input id="labelOptionsLabelInput" type="text" placeholder="Enter label">
              </div>

              <div id="fieldsetLabelPresets" class="preset-row" style="display:none;">
                <button type="button" class="preset-btn" data-label="General Information">
                  General Information
                </button>
              </div>

              <!-- Options ------------------------------------------------------>
              <div id="optionsSection" style="display:none;margin-top:15px;">
                <label>Options:</label>
                <ol id="bulkOptionsInputUnified"
                    class="line-list-editor"
                    aria-label="Options list"></ol>
                <div id="bulkOptionsImageStatus" class="option-image-status" aria-live="polite">
                  ${optionsImageHint}
                </div>

                <div id="choiceRadioPresets" class="card-container" style="margin-top:6px;">
                  <div class="card preset-card" data-options="Safe,At Risk,NA">Safe / At Risk / NA</div>
                  <div class="card preset-card" data-options="Pass,Fail,NA">Pass / Fail / NA</div>
                  <div class="card preset-card" data-options="Yes,No,NA">Yes / No / NA</div>
                </div>
              </div>

              <!-- Disclaimer --------------------------------------------------->
              <div id="disclaimerSection" style="display:none;margin-top:15px;">
                <div class="label-options-editor-shell">
                  <textarea id="disclaimerRTE" style="width:100%;height:260px;"></textarea>
                </div>
                <div class="disclaimer-media-toolbar">
                  <button id="disclaimerAddPhotoBtn" class="disclaimer-media-btn" type="button">
                    <i class="fa-regular fa-image" aria-hidden="true"></i>
                    <span>Add Photo</span>
                  </button>
                  <input id="disclaimerPhotoInput" type="file" accept="image/*" hidden>
                  <div id="disclaimerPhotoStatus" class="disclaimer-media-status" aria-live="polite">
                    Insert a photo from your device into the disclaimer.
                  </div>
                </div>
              </div>

              <!-- Survey Section ----------------------------------------------->
              <div id="surveySection" style="display:none;margin-top:15px;">
                <label>Survey Questions</label>
                <ol id="surveyQuestionsInputUnified"
                    class="line-list-editor"
                    aria-label="Survey questions list"></ol>
                <div id="surveyQuestionsImageStatus" class="option-image-status" aria-live="polite">
                  ${surveyImageHint}
                </div>

                <label>Survey Options</label>
                <ol id="surveyOptionsInputUnified"
                    class="line-list-editor"
                    aria-label="Survey options list"></ol>

                <div id="surveyOptionPresets" class="card-container" style="margin-top:6px;">
                  <div class="card preset-card" data-options="Safe,At Risk,NA">Safe / At Risk / NA</div>
                  <div class="card preset-card" data-options="Pass,Fail,NA">Pass / Fail / NA</div>
                  <div class="card preset-card" data-options="Yes,No,NA">Yes / No / NA</div>
                </div>

                <div id="surveyQuestionsTagContainerUnified" style="display:none;"></div>
                <div id="surveyOptionsTagContainerUnified" style="display:none;"></div>
              </div>

              <div id="componentGroupSection" style="display:none;margin-top:15px;">
                <label>Build As</label>
                <div id="componentGroupModeContainer" style="display:flex;gap:10px;margin-top:10px;">
                  <button id="componentGroupModeSurvey" class="row-button">Survey</button>
                  <button id="componentGroupModeRadio" class="row-button">Radios</button>
                </div>

                <label id="componentGroupItemsLabel" style="display:block;margin-top:15px;">Survey Labels</label>
                <ol id="componentGroupItemsInputUnified"
                    class="line-list-editor"
                    aria-label="Field group labels list"></ol>
                <div id="componentGroupItemsImageStatus" class="option-image-status" aria-live="polite">
                  ${componentGroupImageHint}
                </div>

                <p class="modal-help-text">Response options use the preset below.</p>

                <div id="componentGroupPresetRow" class="card-container" style="margin-top:6px;">
                  <div class="card preset-card" data-options="Yes,No,NA">Yes / No / NA</div>
                  <div class="card preset-card" data-options="Pass,Fail,NA">Pass / Fail / NA</div>
                  <div class="card preset-card" data-options="Safe,At Risk,NA">Safe / At Risk / NA</div>
                </div>
              </div>

              <!-- Speed Section ------------------------------------------------->
              <div id="speedSection" style="display:none;margin-top:15px;">
                <label>Speed Labels (one per line):</label>
                <textarea id="speedLabelsInputUnified"
                          style="width:100%;height:80px;"
                          placeholder="e.g. Low Side Eaves&#10;Rib Screws&#10;Open Purlins…"></textarea>

                <label>Speed Values (optional):</label>
                <textarea id="speedValuesInputUnified"
                          style="width:100%;height:60px;"
                          placeholder="(Add any secondary data here)"></textarea>

                <div id="speedPresetRow" class="card-container" style="margin-top:6px;">
                  <div class="card preset-card" data-options="Yes,No,NA">Yes / No / NA</div>
                  <div class="card preset-card" data-options="Pass,Fail,NA">Pass / Fail / NA</div>
                  <div class="card preset-card" data-options="Safe,At Risk,NA">Safe / At Risk / NA</div>
                </div>
              </div>

              <div id="quizPassSection" style="display:none;margin-top:15px;">
                <label>Pass Mark</label>
                <p class="modal-help-text">Minimum number of correct answers required to pass.</p>
                <input id="quizPassInput"
                       type="number"
                       min="1"
                       step="1"
                       value="1"
                       style="width:100px">
              </div>

              <!-- Toggles Row --------------------------------------------------->
              <div id="togglesRow" style="display:none;margin-top:15px;display:flex;align-items:center;gap:40px;">
                <div id="hideLabelSection">
                  <label>Hide Label</label>
                  <label class="switch" style="margin-left:10px;">
                    <input type="checkbox" id="hideLabelToggle">
                    <span class="slider round"></span>
                  </label>
                </div>
                <div id="requiredToggleSection">
                  <label>Required</label>
                  <label class="switch" style="margin-left:10px;">
                    <input type="checkbox" id="requiredToggle" checked>
                    <span class="slider round"></span>
                  </label>
                </div>
                <div id="actionsToggleSection">
                  <label>Actions</label>
                  <label class="switch" style="margin-left:10px;">
                    <input type="checkbox" id="actionsToggle">
                    <span class="slider round"></span>
                  </label>
                </div>
              </div>

              <div id="numberDefaultSection" style="display:none;margin-top:15px;">
                <label>Default Value</label>
                <input id="numberDefaultInput" type="number" style="width:120px">
              </div>




              <!-- Row length ---------------------------------------------------->
              <div id="rowButtonsContainer" style="display:none;margin-top:15px;">
                <label>Rows</label>
                <div style="display:flex;gap:10px;margin-top:10px;">
                  <button id="row1Btn" class="row-button">1</button>
                  <button id="row3Btn" class="row-button row-button--rows" data-tooltip="Detailed Input" aria-label="Detailed Input">
                    <i class="fa-solid fa-bars" aria-hidden="true"></i>
                    <span class="visually-hidden">Detailed Input</span>
                  </button>
                </div>
              </div>

              <!-- Date/Time mode ------------------------------------------------>
              <div id="dateTimeModeContainer" style="display:none;margin-top:15px;">
                <label>Date / Time Mode</label>
                <div style="display:flex;gap:10px;margin-top:10px;">
                  <button id="dtModeDateTime" class="row-button">Date & Time</button>
                  <button id="dtModeDate"      class="row-button">Date</button>
                  <button id="dtModeTime"      class="row-button">Time</button>
                </div>
              </div>

              <!-- List-style (choice list) ------------------------------------->
              <div id="listStyleContainer" style="display:none;margin-top:15px;">
                <label>List Style</label>
                <div style="display:flex;gap:10px;margin-top:10px;">
                  <button id="lsSelect"      class="row-button">Dropdown</button>
                  <button id="lsRadio"       class="row-button">Radio</button>
                  <button id="lsSelectboxes" class="row-button">Select Boxes</button>
                </div>
              </div>

              <!-- Number style -------------------------------------------------->
              <div id="numStyleContainer" style="display:none;margin-top:15px;">
                <label>Number Style</label>
                <div style="display:flex;gap:10px;margin-top:10px;">
                  <button id="nsNumber"   class="row-button">Number</button>
                  <button id="nsCurrency" class="row-button">Currency</button>
                </div>
              </div>

              <div id="editGridSection" style="display:none;margin-top:15px;">
                <label>Custom Table Add-Another Label</label>
                <input id="editGridAddAnotherInput" type="text" placeholder="Add Another">

                <div id="editGridRowBuilder" class="editgrid-builder" style="margin-top:15px;"></div>
              </div>

            </div><!-- /.modal-body -->
            <div class="modal-buttons">
              <div id="editGridFooterActions" class="editgrid-builder-actions" style="display:none;">
                <button id="editGridAddRowBtn" class="row-button" type="button">Add Row</button>
                <button id="editGridClearLayoutBtn" class="row-button" type="button">Clear Layout</button>
              </div>
              <button id="labelOptionsModalSaveBtn">Save</button>
            </div>
          </div><!-- /.modal-content -->
        </div><!-- /#labelOptionsModal -->

        <!-- ===================== CONDITIONAL MODAL ================= -->
        <div id="conditionalModal" class="modal">
          <div class="modal-content calc-modal-content">
            <div class="modal-header">
              <h3>Configure Conditional Logic</h3>
              <span class="close-btn" onclick="closeConditionalModal()">×</span>
            </div>
            <div class="modal-body calc-modal-body conditional-modal-body">
              <p class="conditional-modal-intro">
                Choose the field and value that should control when this component appears.
              </p>

              <div class="conditional-modal-grid">
                <section class="conditional-modal-panel" aria-labelledby="conditionalWhenLabel">
                  <div class="conditional-modal-panel-head">
                    <label id="conditionalWhenLabel" class="conditional-modal-label" for="whenKeySearch">Triggering Component</label>
                    <p class="conditional-modal-copy">Only select, select boxes, and radio fields can be used as triggers.</p>
                  </div>
                  <input id="whenKeySearch" class="conditional-search-input" type="search" placeholder="Search components">
                  <div
                    id="whenKeyCards"
                    class="card-container calc-field-cards conditional-card-container"
                    tabindex="0"
                    aria-label="Triggering components"
                  ></div>
                </section>

                <section class="conditional-modal-panel" aria-labelledby="conditionalValueLabel">
                  <div class="conditional-modal-panel-head">
                    <label id="conditionalValueLabel" class="conditional-modal-label" for="eqValueSearch">Trigger Value</label>
                    <p class="conditional-modal-copy">Select the value that should make this component visible.</p>
                  </div>
                  <input id="eqValueSearch" class="conditional-search-input" type="search" placeholder="Search values">
                  <div
                    id="eqValueCards"
                    class="card-container calc-field-cards conditional-card-container"
                    tabindex="0"
                    aria-label="Trigger values"
                  ></div>
                </section>
              </div>
            </div>
            <div class="modal-buttons">
              <button id="backFromConditionalBtn" type="button">Back</button>
              <button id="saveConditionalLogicBtn">Save</button>
              <button id="clearConditionalLogicBtn">Clear Trigger</button>
            </div>
          </div>
        </div>

        <div id="componentOptionsModal" class="modal">
          <div class="modal-content">
            <div class="modal-header">
              <h3>Component Options</h3>
              <span class="close-btn" onclick="closeComponentOptionsModal()">×</span>
            </div>
            <div class="modal-body">
              <div id="componentOptionDetails"></div>
            </div>
            <div class="modal-buttons">
              <button id="componentAddConditionalBtn" type="button">Conditional</button>
              <button id="componentEditBtn" type="button">Edit</button>
              <button id="componentDeleteBtn" type="button">Delete</button>
            </div>
          </div>
        </div>

        <!-- ===================== INPUT MODAL ======================= -->
        <div id="inputModal" class="modal">
          <div class="modal-content">
            <div class="modal-header">
              <h3>Enter Component Label</h3>
              <span class="close-btn" onclick="closeInputModal()">×</span>
            </div>
            <div class="modal-body">
              <input id="componentLabelInput" type="text" placeholder="Component label">
              <button id="dictateLabelAdvancedBtn" type="button" onclick="dictateLabelAdvanced()">Speak (Advanced)</button>
            </div>
            <div class="modal-buttons" id="inputModalButtons"></div>
          </div>
        </div>

        <!-- ===================== SURVEY Q MODAL ==================== -->
        <div id="surveyQuestionsModal" class="modal">
          <div class="modal-content">
            <div class="modal-header">
              <h3>Enter Survey Questions</h3>
              <span class="close-btn" onclick="closeSurveyQuestionsModal()">×</span>
            </div>
            <div class="modal-body">
              <div id="surveyQuestionsTagContainer" class="tag-container">
                <input id="surveyQuestionTagInput" type="text" placeholder="">
              </div>
            </div>
            <div class="modal-buttons">
              <button id="surveyQuestionsModalSaveBtn">Save</button>
            </div>
          </div>
        </div>

        <!-- ===================== SURVEY OPTIONS MODAL =============== -->
        <div id="surveyOptionsModal" class="modal">
          <div class="modal-content">
            <div class="modal-header">
              <h3>Enter Survey Options</h3>
              <span class="close-btn" onclick="closeSurveyOptionsModal()">×</span>
            </div>
            <div class="modal-body">
              <div id="surveyOptionsTagContainer" class="tag-container">
                <input id="surveyOptionTagInput" type="text" placeholder="">
              </div>
            </div>
            <div class="modal-buttons">
              <button id="surveyOptionsModalSaveBtn">Save</button>
            </div>
          </div>
        </div>

        <!-- ===================== OPTIONS MODAL ====================== -->
        <div id="optionsModal" class="modal">
          <div class="modal-content">
            <div class="modal-header">
              <h3>Enter Options</h3>
              <span class="close-btn" onclick="closeOptionsModal()">×</span>
            </div>
            <div class="modal-body">
              <div id="optionsTagContainer" class="tag-container">
                <input id="optionTagInput" type="text" placeholder="Type in options">
              </div>
            </div>
            <div class="modal-buttons">
              <button id="optionsModalSaveBtn">Save</button>
            </div>
          </div>
        </div>

        <!-- ===================== DISCLAIMER MODAL =================== -->
        <div id="disclaimerModal" class="modal">
          <div class="modal-content">
            <div class="modal-header">
              <h3>Edit Disclaimer</h3>
              <span class="close-btn" onclick="closeDisclaimerModal()">×</span>
            </div>
            <div class="modal-body">
              <textarea id="disclaimerTextArea" rows="10" placeholder="Enter disclaimer text"></textarea>
            </div>
            <div class="modal-buttons">
              <button id="saveDisclaimerBtn">Save</button>
            </div>
          </div>
        </div>

        <!-- ===================== MOVE-TO MODAL ====================== -->
        <div id="moveToModal" class="modal">
          <div class="modal-content">
            <div class="modal-header">
              <h3>Select Section</h3>
              <span class="close-btn" onclick="closeMoveToModal()">×</span>
            </div>
            <div class="modal-body">
              <div id="moveToFieldsetCards" class="card-container"></div>
            </div>
          </div>
        </div>

        <!-- ===================== AUTO-CALC MODAL ==================== -->
        <div id="calcModal" class="modal">
          <div class="modal-content calc-modal-content">
            <div class="modal-header calc-modal-header">
              <div class="calc-modal-header-copy">
                <h3>Calculator</h3>
                <p class="calc-modal-subtitle">Build a formula using the number and currency fields already on this form.</p>
              </div>
              <button
                type="button"
                class="close-btn"
                aria-label="Close calculator modal"
                onclick="closeCalcModal()"
              >×</button>
            </div>
            <div class="modal-body calc-modal-body">
              <section class="calc-panel calc-formula-panel" aria-labelledby="calcFormulaLabel">
                <div class="calc-panel-head">
                  <div class="calc-panel-heading">
                    <label id="calcFormulaLabel" for="calcEditor" class="calc-section-label">Formula</label>
                    <p class="calc-panel-copy">Use field tokens like <code>{{subtotal}}</code> or insert operators below.</p>
                  </div>
                </div>
                <textarea id="calcEditor" class="calc-editor" spellcheck="false" placeholder="{{subtotal}} + {{tax}}"></textarea>
                <div class="calc-toolbar">
                  <span class="calc-toolbar-label">Quick Insert</span>
                  <div id="calcInsertOps" class="calc-op-grid">
                    <button class="calc-op-btn" type="button" data-insert=" + " data-tooltip="Add">+</button>
                    <button class="calc-op-btn" type="button" data-insert=" - " data-tooltip="Subtract">−</button>
                    <button class="calc-op-btn" type="button" data-insert=" * " data-tooltip="Multiply">×</button>
                    <button class="calc-op-btn" type="button" data-insert=" / " data-tooltip="Divide">÷</button>
                    <button class="calc-op-btn" type="button" data-insert=" % " data-tooltip="Remainder">%</button>
                    <button class="calc-op-btn" type="button" data-insert="()" data-cursor-offset="-1" data-tooltip="Parentheses">( )</button>
                  </div>
                </div>
                <div class="calc-recommendations-shell">
                  <div class="calc-panel-heading">
                    <span class="calc-section-label">Suggested Formulas</span>
                    <p class="calc-panel-copy">Start from a common pattern, then adjust it if needed.</p>
                  </div>
                  <div id="calcRecommendations" class="calc-recommendation-cards"></div>
                </div>
                <div id="calcStatus" class="calc-status" aria-live="polite"></div>
              </section>

              <section class="calc-panel calc-components-panel" aria-labelledby="calcComponentsLabel">
                <div class="calc-fields-head">
                  <div class="calc-panel-heading">
                    <label id="calcComponentsLabel" for="calcFieldSearch" class="calc-section-label">Components</label>
                    <p class="calc-panel-copy">Insert any numeric field that should be part of this calculation.</p>
                  </div>
                  <span id="calcFieldCount" class="calc-count-badge">0 fields</span>
                </div>
                <div class="calc-search-wrap">
                  <input id="calcFieldSearch" type="search" placeholder="Search components">
                </div>
                <div class="calc-card-shell">
                  <div id="calcFieldCards" class="calc-field-cards"></div>
                </div>
              </section>
            </div>
            <div class="modal-buttons">
              <button id="calcClearBtn" type="button">Clear Formula</button>
              <button id="calcSaveBtn" type="button" disabled>Save Formula</button>
            </div>
          </div>
        </div>


        <div id="answerKeyModal" class="modal">
          <div class="modal-content answer-key-modal-content">
            <div class="modal-header">
              <div class="answer-key-modal-heading">
                <h3>Quiz Setup</h3>
                <p id="answerKeyModalCopy" class="modal-help-text">Set the pass mark and choose the correct answers for each quiz question.</p>
              </div>
              <span class="close-btn" onclick="closeAnswerKeyModal()" aria-label="Close quiz setup modal">×</span>
            </div>
            <div class="modal-body answer-key-modal-body">
              <section class="answer-key-section answer-key-pass-section">
                <div class="answer-key-section-copy">
                  <label for="answerKeyPassMarkInput" class="modal-section-title">Pass Mark</label>
                  <p class="modal-help-text">Minimum number of correct answers required to pass.</p>
                </div>
                <div class="answer-key-pass-input-shell">
                  <div class="answer-key-pass-input-card">
                    <span class="answer-key-pass-input-label">Correct answers</span>
                    <input id="answerKeyPassMarkInput" type="number" min="1" step="1" value="1" inputmode="numeric">
                  </div>
                </div>
              </section>

              <section class="answer-key-section answer-key-questions-section">
                <div class="answer-key-section-copy">
                  <div class="modal-section-title">Correct Answers</div>
                  <p id="answerKeyQuestionCount" class="modal-help-text"></p>
                </div>
                <div id="akeyRows" class="answer-key-rows"></div>
              </section>
            </div>
            <div class="modal-buttons">
              <button type="button" onclick="closeAnswerKeyModal()">Cancel</button>
              <button id="akeySave" type="button">Save</button>
            </div>
          </div>
        </div>

      </div><!-- /.container -->
      </div><!-- /.builder-workspace -->




	    </main><!-- /.wrapper -->

${aiAssistantHtml}

	    <!-- ===================== SCRIPTS ===================== -->
	    <script src="https://cdn.jsdelivr.net/npm/lodash@4.17.21/lodash.min.js" defer></script>
	    <script src="/js/uniqueKeys.js" defer></script>
	    <script src="/js/dataHelpers.js" defer></script>
	    <script src="/js/sessionTimer.js" defer></script>
	    <script src="/js/modalHelpers.js" defer></script>
	    <script src="/js/createComponent.js" defer></script>
	    <script>
	      window.__builderComponentTypes = ${JSON.stringify(componentTypes)};
	      window.__builderCkeditorScriptUrl = "https://cdn.ckeditor.com/ckeditor5/41.1.0/classic/ckeditor.js";
	      window.__builderAiFeatures = ${JSON.stringify(aiFeatures)};
	    </script>
	    <script src="/js/mainFormBuilder.js" defer></script>
	    ${aiAssistantScriptHtml}
	    
	  </body>
	  </html>
	  `;

  res.send(html);
});

module.exports = router;
module.exports.buildOrderedComponentTypes = buildOrderedComponentTypes;
