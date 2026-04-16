const express = require('express');

const { isEmailAllowed, trimString } = require('../config/runtimeConfig');
const {
  beginGoogleAuthFlow,
  buildSessionPayloadFromGoogleProfile,
  clearSession,
  consumeGoogleAuthFlow,
  ensureSafeRedirectPath,
  isAuthConfigured,
  issueSession
} = require('../security/requestSecurity');
const { getTemplateLibraryService } = require('../utils/templateLibrary');

const GOOGLE_TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
const GOOGLE_USERINFO_ENDPOINT = 'https://openidconnect.googleapis.com/v1/userinfo';

const router = express.Router();

function escapeHtml(value = '') {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderLoginPage({ error = '', nextPath = '/formbuilder' } = {}) {
  const safeError = escapeHtml(trimString(error));
  const safeNextPath = escapeHtml(ensureSafeRedirectPath(nextPath));

  return /* html */ `<!DOCTYPE html>
  <html lang="en">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Sign In</title>
    <style>
      :root {
        color-scheme: light;
        --bg: #eef2f5;
        --panel: rgba(255, 255, 255, 0.95);
        --text: #13202b;
        --muted: #4f6272;
        --accent: #0d6f66;
        --accent-dark: #09554e;
        --danger: #b42318;
        --border: rgba(19, 32, 43, 0.12);
        --shadow: 0 22px 60px rgba(19, 32, 43, 0.14);
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        min-height: 100vh;
        display: grid;
        place-items: center;
        padding: 24px;
        font-family: "Plus Jakarta Sans", "Segoe UI", sans-serif;
        background:
          radial-gradient(circle at top left, rgba(13, 111, 102, 0.12), transparent 32%),
          radial-gradient(circle at bottom right, rgba(180, 35, 24, 0.08), transparent 28%),
          var(--bg);
        color: var(--text);
      }
      .shell {
        width: min(440px, 100%);
        border: 1px solid var(--border);
        border-radius: 24px;
        padding: 32px;
        background: var(--panel);
        box-shadow: var(--shadow);
      }
      .eyebrow {
        margin: 0 0 10px;
        font-size: 12px;
        letter-spacing: 0.14em;
        text-transform: uppercase;
        color: var(--accent);
      }
      h1 {
        margin: 0 0 10px;
        font-size: 30px;
        line-height: 1.1;
      }
      p {
        margin: 0 0 20px;
        color: var(--muted);
        line-height: 1.5;
      }
      .btn {
        display: inline-flex;
        width: 100%;
        justify-content: center;
        align-items: center;
        gap: 10px;
        border: 0;
        border-radius: 14px;
        padding: 14px 16px;
        font: inherit;
        font-weight: 700;
        color: white;
        background: var(--accent);
        cursor: pointer;
        text-decoration: none;
      }
      .btn:hover { background: var(--accent-dark); }
      .error {
        margin-bottom: 16px;
        padding: 12px 14px;
        border-radius: 12px;
        background: rgba(180, 35, 24, 0.08);
        color: var(--danger);
      }
      .meta {
        margin-top: 18px;
        font-size: 13px;
        color: var(--muted);
      }
    </style>
  </head>
  <body>
    <main class="shell">
      <p class="eyebrow">Form Builder</p>
      <h1>Sign in</h1>
      <p>Use your Google account to access your private form-builder workspace.</p>
      ${safeError ? `<div class="error">${safeError}</div>` : ''}
      <a class="btn" href="/auth/google?next=${encodeURIComponent(safeNextPath)}">Continue With Google</a>
      <p class="meta">Each signed-in user gets a separate template library and stats workspace.</p>
    </main>
  </body>
  </html>`;
}

async function loadGoogleProfileFromCode(code) {
  const mockProfile = trimString(process.env.GOOGLE_OAUTH_MOCK_PROFILE_JSON);
  if (mockProfile) {
    return JSON.parse(mockProfile);
  }

  const tokenBody = new URLSearchParams({
    code,
    client_id: trimString(process.env.GOOGLE_CLIENT_ID),
    client_secret: trimString(process.env.GOOGLE_CLIENT_SECRET),
    redirect_uri: trimString(process.env.GOOGLE_OAUTH_REDIRECT_URI),
    grant_type: 'authorization_code'
  });

  const tokenResponse = await fetch(GOOGLE_TOKEN_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: tokenBody.toString()
  });

  const tokenPayload = await tokenResponse.json().catch(() => ({}));
  if (!tokenResponse.ok || !trimString(tokenPayload?.access_token)) {
    throw new Error(tokenPayload?.error_description || tokenPayload?.error || 'Google sign-in failed during token exchange.');
  }

  const profileResponse = await fetch(GOOGLE_USERINFO_ENDPOINT, {
    headers: {
      Authorization: `Bearer ${tokenPayload.access_token}`
    }
  });

  const profile = await profileResponse.json().catch(() => ({}));
  if (!profileResponse.ok) {
    throw new Error(profile?.error_description || profile?.error || 'Google sign-in failed while loading your account profile.');
  }

  if (profile.email_verified === false) {
    throw new Error('Your Google account email could not be verified.');
  }

  return profile;
}

router.get('/login', (req, res) => {
  const nextPath = ensureSafeRedirectPath(req.query?.next || '/formbuilder');

  if (req.auth?.authenticated) {
    return res.redirect(nextPath);
  }

  if (!isAuthConfigured()) {
    return res.redirect(nextPath);
  }

  res.setHeader('Cache-Control', 'no-store');
  return res.send(renderLoginPage({
    error: req.query?.error || '',
    nextPath
  }));
});

router.get('/auth/google', (req, res) => {
  const nextPath = ensureSafeRedirectPath(req.query?.next || '/formbuilder');

  if (req.auth?.authenticated) {
    return res.redirect(nextPath);
  }

  if (!isAuthConfigured()) {
    return res.redirect(nextPath);
  }

  try {
    const flow = beginGoogleAuthFlow(req, res, nextPath);
    return res.redirect(flow.authorizationUrl);
  } catch (error) {
    res.setHeader('Cache-Control', 'no-store');
    return res.status(503).send(renderLoginPage({
      error: error?.message || 'Google sign-in is not available right now.',
      nextPath
    }));
  }
});

router.get('/auth/google/callback', async (req, res) => {
  const fallbackNextPath = ensureSafeRedirectPath(req.query?.next || '/formbuilder');

  if (!isAuthConfigured()) {
    return res.redirect(fallbackNextPath);
  }

  const flow = consumeGoogleAuthFlow(req, res, trimString(req.query?.state));
  if (!flow.ok) {
    res.setHeader('Cache-Control', 'no-store');
    return res.status(401).send(renderLoginPage({
      error: flow.error,
      nextPath: fallbackNextPath
    }));
  }

  if (trimString(req.query?.error)) {
    res.setHeader('Cache-Control', 'no-store');
    return res.status(401).send(renderLoginPage({
      error: trimString(req.query?.error_description) || trimString(req.query?.error),
      nextPath: flow.nextPath
    }));
  }

  const code = trimString(req.query?.code);
  if (!code) {
    res.setHeader('Cache-Control', 'no-store');
    return res.status(400).send(renderLoginPage({
      error: 'Google sign-in did not return an authorization code.',
      nextPath: flow.nextPath
    }));
  }

  try {
    const profile = await loadGoogleProfileFromCode(code);
    const email = trimString(profile?.email).toLowerCase();
    if (!isEmailAllowed(email)) {
      const error = new Error('This account is not allowed to access this beta.');
      error.statusCode = 403;
      throw error;
    }
    const sessionPayload = buildSessionPayloadFromGoogleProfile(profile);
    const service = getTemplateLibraryService().forWorkspace({
      workspaceId: sessionPayload.workspaceId,
      workspaceDisplayName: sessionPayload.displayName
    });

    await service.ensureWorkspaceUser(sessionPayload);
    issueSession(req, res, sessionPayload);
    return res.redirect(flow.nextPath);
  } catch (error) {
    res.setHeader('Cache-Control', 'no-store');
    return res.status(error?.statusCode || 500).send(renderLoginPage({
      error: error?.message || 'Google sign-in failed.',
      nextPath: flow.nextPath
    }));
  }
});

router.post('/logout', (req, res) => {
  clearSession(req, res);
  return res.redirect('/login');
});

module.exports = router;
