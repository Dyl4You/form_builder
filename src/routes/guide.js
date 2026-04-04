const express = require('express');

const {
  GUIDE_MANIFEST,
  GUIDE_VIDEO_TARGET_DURATION_SECONDS
} = require('../utils/guideManifest');

const router = express.Router();

function escapeHtml(value = '') {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderList(items = [], className = 'guide-list') {
  if (!Array.isArray(items) || !items.length) return '';
  return `<ul class="${className}">${items.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>`;
}

function renderMediaPanel(title, media, options = {}) {
  if (!media) return '';

  const isVideo = media.kind === 'video';
  const hint = isVideo
    ? `${GUIDE_VIDEO_TARGET_DURATION_SECONDS}-second slow demo`
    : 'Inline screenshot';
  const caption = media?.caption ? escapeHtml(media.caption) : '';
  const titleText = escapeHtml(title);
  const altText = escapeHtml(media.alt || '');
  const src = escapeHtml(media.src || '');
  const poster = escapeHtml(media.poster || '');

  const mediaMarkup = isVideo
    ? `
      <video
        class="guide-component-media"
        data-guide-video-preview
        controls
        muted
        loop
        playsinline
        preload="metadata"
        poster="${poster}"
        aria-label="${altText}"
      >
        <source src="${src}" type="video/webm">
      </video>
    `
    : `
      <img
        class="guide-component-media"
        src="${src}"
        alt="${altText}"
        loading="lazy"
        decoding="async">
    `;

  return `
    <figure class="guide-media-panel${options.wide ? ' guide-media-panel--wide' : ''}">
      <figcaption class="guide-media-panel__head">
        <span class="guide-media-panel__label">${titleText}</span>
        <span class="guide-media-panel__hint">${hint}</span>
      </figcaption>
      <div class="guide-media-panel__frame">
        ${mediaMarkup}
      </div>
      ${caption ? `<p class="guide-media-panel__caption">${caption}</p>` : ''}
    </figure>`;
}

function renderComponentReferenceCard(component, index) {
  const primaryMedia = component?.showVideo && component?.media?.video
    ? renderMediaPanel('Demo', component.media.video, { wide: true })
    : '';
  const secondaryMediaItems = [
    renderMediaPanel('Preview', component?.media?.photo),
    renderMediaPanel('Setup View', component?.media?.setup)
  ].filter(Boolean);

  const mediaRowClass = secondaryMediaItems.length === 1
    ? 'guide-component-media-row guide-component-media-row--single'
    : 'guide-component-media-row';

  return `
    <article id="palette-${escapeHtml(component.id || '')}" class="guide-component-card guide-anchor-section">
      <div class="guide-component-copy">
        <div class="guide-component-header">
          <div class="guide-component-kicker-row">
            <span class="guide-component-index">${String(index + 1).padStart(2, '0')}</span>
            <div class="guide-component-badges">
              <span class="guide-component-badge">${escapeHtml(component.category || 'Component')}</span>
              ${component?.showVideo ? `<span class="guide-component-badge guide-component-badge--accent">${GUIDE_VIDEO_TARGET_DURATION_SECONDS}s demo</span>` : ''}
            </div>
          </div>
          <div class="guide-component-title-block">
            <h2>${escapeHtml(component.title || '')}</h2>
            <p class="guide-component-subtitle">${escapeHtml(component.summary || '')}</p>
          </div>
        </div>

        <section class="guide-component-section">
          <p class="guide-component-section-label">What it does</p>
          <p class="guide-component-body">${escapeHtml(component.summary || '')}</p>
        </section>

        <section class="guide-component-section">
          <p class="guide-component-section-label">Key options</p>
          ${renderList(component.options || [], 'guide-list guide-list--compact')}
        </section>
      </div>

      <div class="guide-component-media-stack">
        ${primaryMedia}
        <div class="${mediaRowClass}">
          ${secondaryMediaItems.join('')}
        </div>
      </div>
    </article>`;
}

router.get('/guide', (_req, res) => {
  const heroLinks = GUIDE_MANIFEST.links
    .map((link, index) => `<a class="btn ${index === 0 ? 'btn-primary' : 'btn-ghost'}" href="${escapeHtml(link.href)}">${escapeHtml(link.label)}</a>`)
    .join('');
  const practicePack = GUIDE_MANIFEST.practicePack;
  const practicePackHtml = practicePack
    ? `
      <section class="builder-side-section guide-practice-panel">
        <div class="guide-practice-copy">
          <div>
            <p class="builder-side-kicker">Practice Pack</p>
            <h2>${escapeHtml(practicePack.title || '')}</h2>
          </div>
          <p class="builder-side-copy">${escapeHtml(practicePack.summary || '')}</p>
        </div>
        ${renderList(practicePack.details || [], 'guide-list guide-list--compact')}
        <div class="guide-practice-actions">
          ${(practicePack.links || [])
            .map((link, index) => (
              `<a class="btn ${index === 0 ? 'btn-primary' : 'btn-ghost'}" href="${escapeHtml(link.href)}" target="_blank" rel="noopener noreferrer">${escapeHtml(link.label)}</a>`
            ))
            .join('')}
        </div>
      </section>
    `
    : '';

  const componentJumpLinks = GUIDE_MANIFEST.components
    .map((component) => `<a href="#palette-${escapeHtml(component.id)}">${escapeHtml(component.title)}</a>`)
    .join('');

  const componentCards = GUIDE_MANIFEST.components
    .map((component, index) => renderComponentReferenceCard(component, index))
    .join('');

  const html = /* html */ `<!DOCTYPE html>
  <html lang="en">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${escapeHtml(GUIDE_MANIFEST.title)}</title>
    <link rel="icon" type="image/svg+xml" href="/favicon.svg">
    <link rel="shortcut icon" href="/favicon.svg">
    <script>
      document.documentElement.dataset.builderTheme = 'dark';
      document.documentElement.dataset.guideVideoTargetDuration = '${String(GUIDE_VIDEO_TARGET_DURATION_SECONDS)}';
    </script>
    <link rel="stylesheet" href="/css/formBuilder.css">
    <link rel="stylesheet" href="/css/stats.css">
    <link rel="stylesheet" href="/css/guide.css">
    <script src="/js/guidePage.js" defer></script>
  </head>
  <body class="builder-page stats-page guide-page">
    <div class="builder-backdrop stats-backdrop" aria-hidden="true"></div>
    <span class="builder-corner-brand" aria-hidden="true">
      <svg viewBox="0 0 28 28" focusable="false" aria-hidden="true">
        <g fill="currentColor">
          <rect x="12.5" y="-1" width="3" height="8" rx="1"/>
          <rect x="12.5" y="-1" width="3" height="8" rx="1" transform="rotate(45 14 14)"/>
          <rect x="12.5" y="-1" width="3" height="8" rx="1" transform="rotate(90 14 14)"/>
          <rect x="12.5" y="-1" width="3" height="8" rx="1" transform="rotate(135 14 14)"/>
          <rect x="12.5" y="-1" width="3" height="8" rx="1" transform="rotate(180 14 14)"/>
          <rect x="12.5" y="-1" width="3" height="8" rx="1" transform="rotate(225 14 14)"/>
          <rect x="12.5" y="-1" width="3" height="8" rx="1" transform="rotate(270 14 14)"/>
          <rect x="12.5" y="-1" width="3" height="8" rx="1" transform="rotate(315 14 14)"/>
          <circle cx="14" cy="14" r="11.5"/>
        </g>
        <circle cx="14" cy="14" r="6.5" fill="rgba(15, 19, 24, 0.96)"/>
        <path d="M10.1 14.2 12.7 16.9 18.1 9.8" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2.6"/>
      </svg>
    </span>

    <main class="wrapper guide-wrapper">
      <div class="builder-workspace guide-workspace">
        <div class="container builder-main-panel guide-main-panel">
          <section class="builder-side-section stats-hero-panel guide-hero-panel">
            <div class="stats-hero-head">
              <div class="stats-hero-copy">
                <p class="builder-side-kicker">Component Docs</p>
                <h1>${escapeHtml(GUIDE_MANIFEST.title)}</h1>
                <p class="builder-side-copy">${escapeHtml(GUIDE_MANIFEST.summary)}</p>
                <p class="guide-hero-note">${escapeHtml(GUIDE_MANIFEST.subtitle)}</p>
              </div>
              <p class="stats-hero-chip">${GUIDE_MANIFEST.components.length} Components</p>
            </div>
            <div class="guide-hero-meta">
              <p class="guide-hero-meta-item">Only component cards are shown on this page.</p>
              <p class="guide-hero-meta-item">Videos run as ${GUIDE_VIDEO_TARGET_DURATION_SECONDS}-second slow loops.</p>
              <p class="guide-hero-meta-item">Screenshots and videos stay visible inline.</p>
            </div>
            <div class="stats-hero-actions">
              ${heroLinks}
            </div>
          </section>

          ${practicePackHtml}

          <section class="builder-side-section guide-nav-panel">
            <div class="guide-nav-head">
              <div>
                <p class="builder-side-kicker">Jump To A Component</p>
                <h2>Open the card you need</h2>
              </div>
              <p class="builder-side-copy">The builder links still land on the same component anchors.</p>
            </div>
            <div class="guide-component-jump-grid">
              ${componentJumpLinks}
            </div>
          </section>

          <section id="palette-reference" class="guide-component-list" aria-label="Component documentation">
            ${componentCards}
          </section>
        </div>
      </div>
    </main>

  </body>
  </html>`;

  res.send(html);
});

module.exports = router;
