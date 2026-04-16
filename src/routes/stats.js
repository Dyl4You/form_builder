const express = require('express');

const { getTemplateLibraryService } = require('../utils/templateLibrary');
const {
  createCorfixGroup,
  listCorfixGroups,
  publishTemplateToCorfix
} = require('../utils/corfixPublisher');

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

async function publishSavedTemplateToCorfix(req, result) {
  return publishTemplateToCorfix({
    title: result?.name || req.body?.name,
    schema: req.body?.json,
    groupIds: req.body?.corfixGroupIds || req.body?.groupIds,
    companyId: req.body?.corfixCompanyId || req.body?.companyId,
    logger: console
  });
}

router.get('/api/corfix/groups', async (req, res) => {
  try {
    const result = await listCorfixGroups({
      companyId: req.query?.corfixCompanyId || req.query?.companyId,
      logger: console
    });

    if (result.ok || result.skipped) {
      res.json(result);
      return;
    }

    res.status(Number(result.status) || 502).json(result);
  } catch (err) {
    handleApiError(res, err, 'Failed to load Corfix groups.');
  }
});

router.post('/api/corfix/groups', async (req, res) => {
  try {
    const result = await createCorfixGroup({
      name: req.body?.name,
      companyId: req.body?.corfixCompanyId || req.body?.companyId,
      logger: console
    });

    if (result.ok) {
      res.status(201).json(result);
      return;
    }

    if (result.skipped) {
      res.json(result);
      return;
    }

    res.status(Number(result.status) || 502).json(result);
  } catch (err) {
    handleApiError(res, err, 'Failed to create Corfix group.');
  }
});

router.post('/api/templates', async (req, res) => {
  try {
    const service = getRequestTemplateService(req);
    const result = await service.createTemplate(req.body || {});
    const corfix = await publishSavedTemplateToCorfix(req, result);
    res.status(201).json({
      ...result,
      corfix
    });
  } catch (err) {
    handleApiError(res, err, 'Failed to save template.');
  }
});

router.post('/api/templates/:templateId/versions', async (req, res) => {
  try {
    const service = getRequestTemplateService(req);
    const result = await service.createTemplateVersion(req.params.templateId, req.body || {});
    const corfix = await publishSavedTemplateToCorfix(req, result);
    res.status(201).json({
      ...result,
      corfix
    });
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
    <title>Builder Stats</title>
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
    <a class="builder-corner-brand stats-home-link" href="/formbuilder" aria-label="Return to form builder">
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
    </a>

    <main class="wrapper stats-wrapper">
      <div class="builder-workspace stats-workspace">
        <div class="container builder-main-panel stats-main-panel">
          <div class="stats-top-row">
            <section class="builder-side-section panel stats-usage-panel" id="componentPanel">
              <div class="stats-side-section-head">
                <p class="builder-side-kicker">Usage</p>
                <h2>Top Components</h2>
                <p class="builder-side-copy">Most-used components across the tracked builder workspace.</p>
              </div>
              <ul id="topComponents" class="stat-list"></ul>
            </section>

            <section class="builder-side-section stats-summary-panel">
              <div class="stats-side-section-head">
                <p class="builder-side-kicker">Session</p>
                <h2>Average Session</h2>
                <p class="builder-side-copy">Current average session length across the builder workspace.</p>
              </div>
              <div class="stats-summary">
                <div class="summary-row">
                  <p class="summary-label">Average Session</p>
                  <strong id="sessionAverage">00:00</strong>
                </div>
              </div>
            </section>
          </div>
        </div>
      </div>
    </main>

    <script src="/js/statsDashboard.js"></script>
  </body>
  </html>`;

  res.send(html);
});

module.exports = router;
