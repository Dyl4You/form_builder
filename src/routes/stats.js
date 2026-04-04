const express = require('express');

const { getTemplateLibraryService } = require('../utils/templateLibrary');

const router = express.Router();

function getRequestTemplateService(req) {
  return getTemplateLibraryService().forWorkspace({
    workspaceId: req.auth?.workspaceId,
    workspaceDisplayName: req.auth?.displayName
  });
}

function handleApiError(res, err, fallbackMessage) {
  const status = Number(err?.statusCode) || Number(err?.status) || 500;
  res.status(status).json({ error: err?.message || fallbackMessage });
}

router.post('/api/templates', async (req, res) => {
  try {
    const service = getRequestTemplateService(req);
    const result = await service.createTemplate(req.body || {});
    res.status(201).json(result);
  } catch (err) {
    handleApiError(res, err, 'Failed to save template.');
  }
});

router.post('/api/templates/:templateId/versions', async (req, res) => {
  try {
    const service = getRequestTemplateService(req);
    const result = await service.createTemplateVersion(req.params.templateId, req.body || {});
    res.status(201).json(result);
  } catch (err) {
    handleApiError(res, err, 'Failed to save template version.');
  }
});

router.get('/api/templates', async (req, res) => {
  try {
    const service = getRequestTemplateService(req);
    const result = await service.listTemplates(req.query || {});
    res.json(result);
  } catch (err) {
    handleApiError(res, err, 'Failed to load templates.');
  }
});

router.get('/api/templates/:templateId/versions', async (req, res) => {
  try {
    const service = getRequestTemplateService(req);
    const result = await service.getTemplateVersions(req.params.templateId, req.query || {});
    res.json(result);
  } catch (err) {
    handleApiError(res, err, 'Failed to load template versions.');
  }
});

router.get('/api/template-versions/:versionId/blob', async (req, res) => {
  try {
    const service = getRequestTemplateService(req);
    const record = await service.getTemplateVersionBlob(req.params.versionId);
    if (!record) {
      res.status(404).json({ error: 'Saved template version not found.' });
      return;
    }
    if (!record.json) {
      res.status(409).json({
        error: record.name
          ? `Saved template "${record.name}" cannot be reopened because its form JSON was not stored. Save it again to enable reopen.`
          : 'Saved template cannot be reopened because its form JSON was not stored. Save it again to enable reopen.'
      });
      return;
    }
    res.json(record);
  } catch (err) {
    handleApiError(res, err, 'Failed to load saved template version.');
  }
});

router.get('/api/templates/:templateId/cover', async (req, res) => {
  try {
    const service = getRequestTemplateService(req);
    const cover = await service.getTemplateCover(req.params.templateId);
    if (!cover?.buffer || !cover?.contentType) {
      res.status(404).end();
      return;
    }

    if (cover.updatedAt) {
      res.set('Last-Modified', new Date(cover.updatedAt).toUTCString());
    }
    res.set('Content-Type', cover.contentType);
    res.set('Cache-Control', 'public, max-age=31536000, immutable');
    res.send(cover.buffer);
  } catch (err) {
    res.status(Number(err?.statusCode) || Number(err?.status) || 500).end();
  }
});

router.get('/api/templates/:templateId', async (req, res) => {
  try {
    const service = getRequestTemplateService(req);
    const result = await service.getTemplateById(req.params.templateId);
    if (!result) {
      res.status(404).json({ error: 'Saved template not found.' });
      return;
    }
    res.json(result);
  } catch (err) {
    handleApiError(res, err, 'Failed to load saved template.');
  }
});

router.post('/api/templates/:templateId/archive', async (req, res) => {
  try {
    const service = getRequestTemplateService(req);
    const result = await service.archiveTemplate(req.params.templateId);
    if (!result) {
      res.status(404).json({ error: 'Saved template not found.' });
      return;
    }
    res.json({ ok: true, templateId: result.template_id, name: result.display_name });
  } catch (err) {
    handleApiError(res, err, 'Failed to archive saved template.');
  }
});

router.post('/api/templates/:templateId/restore', async (req, res) => {
  try {
    const service = getRequestTemplateService(req);
    const result = await service.restoreTemplate(req.params.templateId);
    if (!result) {
      res.status(404).json({ error: 'Saved template not found.' });
      return;
    }
    res.json({ ok: true, templateId: result.template_id, name: result.display_name });
  } catch (err) {
    handleApiError(res, err, 'Failed to restore saved template.');
  }
});

router.get('/api/stats/overview', async (_req, res) => {
  try {
    const service = getRequestTemplateService(_req);
    const overview = await service.getOverview();
    res.json(overview);
  } catch (err) {
    handleApiError(res, err, 'Failed to load stats overview.');
  }
});

router.get('/api/stats/components', async (_req, res) => {
  try {
    const service = getRequestTemplateService(_req);
    const components = await service.getComponents();
    res.json(components);
  } catch (err) {
    handleApiError(res, err, 'Failed to load component stats.');
  }
});

router.get('/api/stats/timeline', async (req, res) => {
  try {
    const service = getRequestTemplateService(req);
    const timeline = await service.getTimeline(req.query.days);
    res.json(timeline);
  } catch (err) {
    handleApiError(res, err, 'Failed to load stats timeline.');
  }
});

router.post('/api/stats/reset', async (_req, res) => {
  try {
    const service = getRequestTemplateService(_req);
    const result = await service.resetStats();
    res.json(result);
  } catch (err) {
    handleApiError(res, err, 'Failed to reset stats.');
  }
});

router.delete('/api/stats/templates/:templateId', async (req, res) => {
  try {
    const service = getRequestTemplateService(req);
    const result = await service.archiveTemplate(req.params.templateId);
    if (!result) {
      res.status(404).json({ error: 'Saved template not found.' });
      return;
    }
    res.json({ ok: true, templateId: result.template_id, name: result.display_name });
  } catch (err) {
    handleApiError(res, err, 'Failed to archive saved template.');
  }
});

router.get('/stats', (_req, res) => {
  const html = /* html */ `
  <!DOCTYPE html>
  <html lang="en">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Template Library</title>
    <link rel="icon" type="image/svg+xml" href="/favicon.svg">
    <link rel="shortcut icon" href="/favicon.svg">
    <script>
      document.documentElement.dataset.builderTheme = 'dark';
    </script>
    <link rel="stylesheet" href="/css/formBuilder.css">
    <link rel="stylesheet" href="/css/stats.css">
  </head>
  <body class="builder-page stats-page">
    <div class="builder-backdrop stats-backdrop" aria-hidden="true"></div>
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

    <main class="wrapper stats-wrapper">
      <div class="builder-workspace stats-workspace">
        <div class="container builder-main-panel stats-main-panel">
          <div class="stats-top-row">
            <section class="builder-side-section stats-hero-panel stats-main-hero">
              <div class="stats-hero-head">
                <div class="stats-hero-copy">
                  <p class="builder-side-kicker">Form Builder</p>
                  <h1>Template Library</h1>
                  <p class="builder-side-copy">Browse active and archived templates, reopen loadable versions, and keep the library fast as it grows.</p>
                </div>
                <p class="stats-hero-chip">Builder-Matched View</p>
              </div>
              <div class="stats-hero-actions">
                <a class="btn btn-primary" href="/formbuilder">Back To Builder</a>
                <a class="btn" href="/guide" target="_blank" rel="noopener noreferrer">Open Guide</a>
                <button id="resetStatsBtn" class="btn btn-danger" type="button">Reset Stats</button>
              </div>
            </section>

            <section class="builder-side-section stats-summary-panel">
              <div class="stats-side-section-head">
                <p class="builder-side-kicker">Overview</p>
                <h2>Library Health</h2>
                <p class="builder-side-copy">Current activity across the saved template workspace.</p>
              </div>
              <div class="stats-summary">
                <article class="summary-card">
                  <div class="summary-card-body">
                    <p class="summary-label">Active Templates</p>
                    <strong id="activeTemplatesCount">0</strong>
                  </div>
                </article>
                <article class="summary-card">
                  <div class="summary-card-body">
                    <p class="summary-label">Average Session</p>
                    <strong id="sessionAverage">00:00</strong>
                  </div>
                </article>
              </div>
            </section>

            <section class="builder-side-section panel stats-usage-panel" id="componentPanel">
              <div class="stats-side-section-head">
                <p class="builder-side-kicker">Usage</p>
                <h2>Top Components</h2>
                <p class="builder-side-copy">Most-used components across saved versions.</p>
              </div>
              <ul id="topComponents" class="stat-list"></ul>
            </section>
          </div>

          <section class="panel stats-library-panel" id="savedTemplatesPanel">
            <div class="builder-list-header stats-library-header">
              <div class="component-list-heading">
                <div class="builder-list-heading-copy">
                  <p class="builder-side-kicker">Library</p>
                  <h2>Saved Templates</h2>
                  <p class="builder-side-copy">Search and filter the current template library. More templates load automatically as you scroll.</p>
                </div>
              </div>
              <div class="stats-library-header-actions">
                <div class="template-view-toggle" role="group" aria-label="Saved template view">
                  <button
                    id="templateViewCardBtn"
                    class="template-view-btn"
                    type="button"
                    data-view-mode="card"
                    aria-pressed="true"
                  >
                    Card
                  </button>
                  <button
                    id="templateViewListBtn"
                    class="template-view-btn"
                    type="button"
                    data-view-mode="list"
                    aria-pressed="false"
                  >
                    List
                  </button>
                </div>
                <p id="templateResultsMeta" class="results-meta">Ready</p>
              </div>
            </div>

            <div class="template-library-body">
              <form id="templateFilters" class="template-filters" autocomplete="off">
                <label class="filter-field filter-field-search">
                  <span>Search</span>
                  <input id="templateSearchInput" name="q" type="search" placeholder="Find template names">
                </label>
                <label class="filter-field">
                  <span>Status</span>
                  <select id="templateStatusSelect" name="status">
                    <option value="active">Active</option>
                    <option value="archived">Archived</option>
                    <option value="all">All</option>
                  </select>
                </label>
                <label class="filter-field">
                  <span>Saved From</span>
                  <input id="templateSavedFromInput" name="savedFrom" type="date">
                </label>
                <label class="filter-field">
                  <span>Saved To</span>
                  <input id="templateSavedToInput" name="savedTo" type="date">
                </label>
              </form>

              <div id="savedTemplateReport" class="template-report"></div>
              <div class="template-panel-feedback">
                <p id="savedTemplateEmptyState" class="empty-state" hidden>No templates matched these filters.</p>
                <p id="savedTemplateLoading" class="loading-copy" hidden>Loading more templates…</p>
                <p id="savedTemplateEndState" class="muted end-state" hidden>All matching templates are loaded.</p>
                <p id="savedTemplateError" class="error-inline" hidden></p>
              </div>
              <div id="savedTemplateSentinel" class="template-sentinel" aria-hidden="true"></div>
            </div>
          </section>
        </div>
      </div>
    </main>

    <script src="/js/statsDashboard.js"></script>
  </body>
  </html>`;

  res.send(html);
});

module.exports = router;
