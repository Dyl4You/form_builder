const crypto = require('crypto');

const {
  getDevAuthProfile,
  hasGoogleAuthConfig,
  isProductionEnvironment,
  resolveUserRole,
  trimString
} = require('../config/runtimeConfig');

const DEFAULT_SESSION_COOKIE = 'fb_session';
const DEFAULT_OAUTH_FLOW_COOKIE = 'fb_oauth_flow';
const DEFAULT_SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 14;
const DEFAULT_OAUTH_FLOW_TTL_MS = 1000 * 60 * 10;
const DEFAULT_AI_WINDOW_MS = 1000 * 60 * 15;
const DEFAULT_AI_MAX = 30;
const DEFAULT_API_WINDOW_MS = 1000 * 60 * 15;
const DEFAULT_API_MAX = 120;

const DEFAULT_QUOTA_POLICIES = {
  generate: {
    windowMs: 1000 * 60 * 15,
    windowMax: 30,
    dayMax: 150
  },
  patch: {
    windowMs: 1000 * 60 * 15,
    windowMax: 60,
    dayMax: 300
  },
  'translate-template': {
    windowMs: 1000 * 60 * 15,
    windowMax: 10,
    dayMax: 50
  }
};

function toPositiveInt(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function isAuthConfigured(env = process.env) {
  return hasGoogleAuthConfig(env);
}

function getSessionSecret() {
  return trimString(process.env.APP_SESSION_SECRET) || 'development-session-secret';
}

function getCookieName() {
  return trimString(process.env.APP_SESSION_COOKIE_NAME) || DEFAULT_SESSION_COOKIE;
}

function getOauthFlowCookieName() {
  return trimString(process.env.APP_OAUTH_FLOW_COOKIE_NAME) || DEFAULT_OAUTH_FLOW_COOKIE;
}

function getSessionTtlMs() {
  return toPositiveInt(process.env.APP_SESSION_TTL_MS, DEFAULT_SESSION_TTL_MS);
}

function getOauthFlowTtlMs() {
  return toPositiveInt(process.env.APP_OAUTH_FLOW_TTL_MS, DEFAULT_OAUTH_FLOW_TTL_MS);
}

function parseCookies(headerValue = '') {
  return String(headerValue || '')
    .split(';')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .reduce((acc, entry) => {
      const separatorIndex = entry.indexOf('=');
      if (separatorIndex <= 0) return acc;
      const key = entry.slice(0, separatorIndex).trim();
      const value = entry.slice(separatorIndex + 1).trim();
      if (!key) return acc;
      acc[key] = value;
      return acc;
    }, {});
}

function base64urlEncode(value) {
  return Buffer.from(String(value || ''), 'utf8').toString('base64url');
}

function base64urlDecode(value) {
  return Buffer.from(String(value || ''), 'base64url').toString('utf8');
}

function signValue(value) {
  return crypto
    .createHmac('sha256', getSessionSecret())
    .update(String(value || ''))
    .digest('base64url');
}

function safeEqual(left, right) {
  const leftHash = crypto.createHash('sha256').update(String(left || '')).digest();
  const rightHash = crypto.createHash('sha256').update(String(right || '')).digest();
  return crypto.timingSafeEqual(leftHash, rightHash);
}

function createSignedToken(payload = {}) {
  const encoded = base64urlEncode(JSON.stringify(payload));
  const signature = signValue(encoded);
  return `${encoded}.${signature}`;
}

function readSignedToken(token = '') {
  const raw = String(token || '').trim();
  if (!raw) return null;

  const separatorIndex = raw.lastIndexOf('.');
  if (separatorIndex <= 0) return null;

  const encoded = raw.slice(0, separatorIndex);
  const providedSignature = raw.slice(separatorIndex + 1);
  const expectedSignature = signValue(encoded);
  if (!safeEqual(providedSignature, expectedSignature)) {
    return null;
  }

  try {
    return JSON.parse(base64urlDecode(encoded));
  } catch {
    return null;
  }
}

function createSessionToken(payload = {}) {
  return createSignedToken({
    purpose: 'session',
    iat: Date.now(),
    ...payload
  });
}

function readSessionToken(token = '') {
  const parsed = readSignedToken(token);
  if (!parsed || parsed.purpose !== 'session') return null;

  const issuedAt = Number(parsed?.iat);
  if (!Number.isFinite(issuedAt)) return null;
  if ((Date.now() - issuedAt) > getSessionTtlMs()) return null;

  const userId = trimString(parsed?.userId);
  const workspaceId = trimString(parsed?.workspaceId);
  const email = trimString(parsed?.email).toLowerCase();

  if (!userId || !workspaceId || !email) return null;

  return {
    userId,
    workspaceId,
    email,
    displayName: trimString(parsed?.displayName) || email,
    role: trimString(parsed?.role) === 'admin' ? 'admin' : 'user',
    issuedAt
  };
}

function createOauthFlowToken(payload = {}) {
  return createSignedToken({
    purpose: 'oauth-flow',
    iat: Date.now(),
    ...payload
  });
}

function readOauthFlowToken(token = '') {
  const parsed = readSignedToken(token);
  if (!parsed || parsed.purpose !== 'oauth-flow') return null;

  const issuedAt = Number(parsed?.iat);
  if (!Number.isFinite(issuedAt)) return null;
  if ((Date.now() - issuedAt) > getOauthFlowTtlMs()) return null;

  return parsed;
}

function isSecureRequest(req) {
  if (req?.secure) return true;
  const proto = String(req?.headers?.['x-forwarded-proto'] || '').split(',')[0].trim().toLowerCase();
  return proto === 'https';
}

function setCookie(res, name, value, options = {}) {
  const parts = [`${name}=${value}`];
  parts.push(`Path=${options.path || '/'}`);
  if (options.maxAge === 0) {
    parts.push('Max-Age=0');
  } else if (Number.isFinite(options.maxAge) && options.maxAge > 0) {
    parts.push(`Max-Age=${Math.floor(options.maxAge / 1000)}`);
  }
  if (options.httpOnly !== false) parts.push('HttpOnly');
  if (options.sameSite) parts.push(`SameSite=${options.sameSite}`);
  if (options.secure) parts.push('Secure');

  const nextValue = parts.join('; ');
  const existing = res.getHeader('Set-Cookie');
  if (!existing) {
    res.setHeader('Set-Cookie', nextValue);
    return;
  }

  const values = Array.isArray(existing) ? existing.slice() : [String(existing)];
  values.push(nextValue);
  res.setHeader('Set-Cookie', values);
}

function ensureSafeRedirectPath(value = '') {
  const candidate = String(value || '').trim();
  if (!candidate.startsWith('/')) return '/formbuilder';
  if (candidate.startsWith('//')) return '/formbuilder';
  if (candidate.includes('\r') || candidate.includes('\n')) return '/formbuilder';
  return candidate;
}

function issueSession(req, res, payload = {}) {
  const token = createSessionToken(payload);
  setCookie(res, getCookieName(), token, {
    maxAge: getSessionTtlMs(),
    secure: isSecureRequest(req),
    sameSite: 'Lax'
  });
}

function clearSession(req, res) {
  setCookie(res, getCookieName(), '', {
    maxAge: 0,
    secure: isSecureRequest(req),
    sameSite: 'Lax'
  });
}

function clearOauthFlow(req, res) {
  setCookie(res, getOauthFlowCookieName(), '', {
    maxAge: 0,
    secure: isSecureRequest(req),
    sameSite: 'Lax'
  });
}

function beginGoogleAuthFlow(req, res, nextPath = '/formbuilder') {
  if (!isAuthConfigured()) {
    return null;
  }

  const state = crypto.randomBytes(24).toString('hex');
  const safeNextPath = ensureSafeRedirectPath(nextPath);
  const flowToken = createOauthFlowToken({
    state,
    nextPath: safeNextPath
  });

  setCookie(res, getOauthFlowCookieName(), flowToken, {
    maxAge: getOauthFlowTtlMs(),
    secure: isSecureRequest(req),
    sameSite: 'Lax'
  });

  const params = new URLSearchParams({
    client_id: trimString(process.env.GOOGLE_CLIENT_ID),
    redirect_uri: trimString(process.env.GOOGLE_OAUTH_REDIRECT_URI),
    response_type: 'code',
    scope: 'openid email profile',
    state,
    prompt: 'select_account'
  });

  return {
    state,
    authorizationUrl: `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`
  };
}

function consumeGoogleAuthFlow(req, res, providedState) {
  const cookies = parseCookies(req.headers?.cookie);
  const stored = readOauthFlowToken(cookies[getOauthFlowCookieName()]);
  clearOauthFlow(req, res);

  if (!stored) {
    return {
      ok: false,
      error: 'Your sign-in session expired. Please try again.'
    };
  }

  if (!providedState || !safeEqual(providedState, stored.state || '')) {
    return {
      ok: false,
      error: 'Could not verify the Google sign-in response. Please try again.'
    };
  }

  return {
    ok: true,
    nextPath: ensureSafeRedirectPath(stored.nextPath || '/formbuilder')
  };
}

function buildSessionPayloadFromGoogleProfile(profile = {}, env = process.env) {
  const providerUserId = trimString(profile.sub);
  const email = trimString(profile.email).toLowerCase();
  const displayName = trimString(profile.name) || email;

  if (!providerUserId || !email) {
    throw new Error('Google sign-in did not return a usable account profile.');
  }

  const userId = `google_${providerUserId.replace(/[^a-zA-Z0-9_-]/g, '')}`;

  return {
    userId,
    workspaceId: userId,
    provider: 'google',
    providerUserId,
    email,
    displayName,
    role: resolveUserRole(email, env)
  };
}

function attachRequestContext(req, _res, next) {
  if (!isAuthConfigured()) {
    req.auth = getDevAuthProfile();
    return next();
  }

  const cookies = parseCookies(req.headers?.cookie);
  const session = readSessionToken(cookies[getCookieName()]);
  req.auth = session
    ? {
      authenticated: true,
      authMode: 'google',
      userId: session.userId,
      workspaceId: session.workspaceId,
      email: session.email,
      displayName: session.displayName,
      role: session.role,
      issuedAt: session.issuedAt
    }
    : {
      authenticated: false,
      authMode: 'google'
    };
  return next();
}

function requirePageAuth(req, res, next) {
  if (req.auth?.authenticated) return next();
  const nextPath = ensureSafeRedirectPath(req.originalUrl || '/formbuilder');
  return res.redirect(`/auth/google?next=${encodeURIComponent(nextPath)}`);
}

function requireApiAuth(req, res, next) {
  if (req.auth?.authenticated) return next();
  return res.status(401).json({ error: 'Authentication required.' });
}

function buildSecurityHeaders(req, res, next) {
  if (isSecureRequest(req)) {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'same-origin');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');

  if (trimString(process.env.DISABLE_CSP) !== '1') {
    res.setHeader(
      'Content-Security-Policy',
      [
        "default-src 'self'",
        "base-uri 'self'",
        "frame-ancestors 'none'",
        "object-src 'none'",
        "form-action 'self'",
        "img-src 'self' data: blob:",
        "connect-src 'self'",
        "font-src 'self' data: https://fonts.gstatic.com https://cdnjs.cloudflare.com",
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdnjs.cloudflare.com",
        "script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://cdn.ckeditor.com"
      ].join('; ')
    );
  }

  return next();
}

function buildInMemoryRateLimiter(options = {}) {
  const windowMs = toPositiveInt(options.windowMs, DEFAULT_API_WINDOW_MS);
  const max = toPositiveInt(options.max, DEFAULT_API_MAX);
  const message = String(options.message || 'Too many requests. Please try again later.');
  const keyPrefix = String(options.keyPrefix || 'rl');
  const store = new Map();

  function cleanupExpired(now) {
    for (const [key, entry] of store.entries()) {
      if ((now - entry.startedAt) >= windowMs) {
        store.delete(key);
      }
    }
  }

  return function rateLimit(req, res, next) {
    const now = Date.now();
    if ((now % windowMs) < 50) cleanupExpired(now);

    const clientKey = String(req.ip || req.socket?.remoteAddress || 'unknown');
    const routeKey = `${keyPrefix}:${clientKey}`;
    const current = store.get(routeKey);

    if (!current || (now - current.startedAt) >= windowMs) {
      store.set(routeKey, { count: 1, startedAt: now });
      return next();
    }

    current.count += 1;
    if (current.count > max) {
      const retryAfterSeconds = Math.max(1, Math.ceil((windowMs - (now - current.startedAt)) / 1000));
      res.setHeader('Retry-After', String(retryAfterSeconds));
      return res.status(429).json({
        error: message,
        retryAfterSeconds
      });
    }

    return next();
  };
}

function createAiRateLimiter() {
  return buildInMemoryRateLimiter({
    windowMs: toPositiveInt(process.env.AI_RATE_LIMIT_WINDOW_MS, DEFAULT_AI_WINDOW_MS),
    max: toPositiveInt(process.env.AI_RATE_LIMIT_MAX, DEFAULT_AI_MAX),
    message: 'AI request rate limit exceeded. Please wait before trying again.',
    keyPrefix: 'ai'
  });
}

function createApiRateLimiter() {
  return buildInMemoryRateLimiter({
    windowMs: toPositiveInt(process.env.API_RATE_LIMIT_WINDOW_MS, DEFAULT_API_WINDOW_MS),
    max: toPositiveInt(process.env.API_RATE_LIMIT_MAX, DEFAULT_API_MAX),
    message: 'API request rate limit exceeded. Please wait before trying again.',
    keyPrefix: 'api'
  });
}

function configureTrustProxy(app) {
  const raw = trimString(process.env.TRUST_PROXY).toLowerCase();
  if (!raw) return;
  if (['1', 'true', 'yes', 'on'].includes(raw)) {
    app.set('trust proxy', true);
    return;
  }
  const numeric = Number.parseInt(raw, 10);
  if (Number.isInteger(numeric) && numeric >= 0) {
    app.set('trust proxy', numeric);
  }
}

function getQuotaPolicy(action) {
  const key = String(action || '').trim();
  const fallback = DEFAULT_QUOTA_POLICIES[key];
  if (!fallback) return null;

  const envPrefix = `AI_QUOTA_${key.toUpperCase().replace(/[^A-Z0-9]+/g, '_')}`;
  return {
    action: key,
    windowMs: toPositiveInt(process.env[`${envPrefix}_WINDOW_MS`], fallback.windowMs),
    windowMax: toPositiveInt(process.env[`${envPrefix}_WINDOW_MAX`], fallback.windowMax),
    dayMax: toPositiveInt(process.env[`${envPrefix}_DAY_MAX`], fallback.dayMax)
  };
}

function floorTime(date, windowMs) {
  const now = new Date(date);
  return new Date(Math.floor(now.getTime() / windowMs) * windowMs);
}

function startOfUtcDay(date) {
  const now = new Date(date);
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

async function applyUserActionQuota(pool, options = {}) {
  const userId = trimString(options.userId);
  const policy = options.policy || getQuotaPolicy(options.action);
  const now = options.now instanceof Date ? options.now : new Date();

  if (!pool || !userId || !policy) {
    return { allowed: true };
  }

  const buckets = [
    {
      period: 'window',
      limit: policy.windowMax,
      bucketStart: floorTime(now, policy.windowMs),
      durationMs: policy.windowMs
    },
    {
      period: 'day',
      limit: policy.dayMax,
      bucketStart: startOfUtcDay(now),
      durationMs: 24 * 60 * 60 * 1000
    }
  ];

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    for (const bucket of buckets) {
      const result = await client.query(
        `INSERT INTO user_request_quotas (
           user_id,
           action,
           period,
           bucket_start,
           request_count
         )
         VALUES ($1, $2, $3, $4, 1)
         ON CONFLICT (user_id, action, period, bucket_start)
         DO UPDATE SET
           request_count = user_request_quotas.request_count + 1,
           updated_at = NOW()
         RETURNING request_count`,
        [userId, policy.action, bucket.period, bucket.bucketStart.toISOString()]
      );

      const count = Number(result.rows[0]?.request_count) || 0;
      if (count > bucket.limit) {
        await client.query('ROLLBACK');
        const retryAfterSeconds = Math.max(
          1,
          Math.ceil(((bucket.bucketStart.getTime() + bucket.durationMs) - now.getTime()) / 1000)
        );
        return {
          allowed: false,
          action: policy.action,
          period: bucket.period,
          retryAfterSeconds,
          limit: bucket.limit
        };
      }
    }

    await client.query('COMMIT');
    return { allowed: true };
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch {}
    throw error;
  } finally {
    client.release();
  }
}

async function getQuotaPool() {
  const { getTemplateLibraryService } = require('../utils/templateLibrary');
  const service = getTemplateLibraryService();
  await service.ensureReady();
  if (typeof service.getStoreKind === 'function' && service.getStoreKind() !== 'postgres') {
    return null;
  }
  return service.store?.pool || null;
}

function createUserQuotaMiddleware(action) {
  const policy = getQuotaPolicy(action);

  return async function enforceUserQuota(req, res, next) {
    if (!policy || !req.auth?.userId) {
      return next();
    }

    const shouldEnforce = isProductionEnvironment() || trimString(process.env.ENABLE_USER_QUOTAS) === '1';
    if (!shouldEnforce) {
      return next();
    }

    try {
      const pool = await getQuotaPool();
      if (!pool) return next();

      const result = await applyUserActionQuota(pool, {
        userId: req.auth.userId,
        policy
      });

      if (result.allowed) return next();

      res.setHeader('Retry-After', String(result.retryAfterSeconds));
      return res.status(429).json({
        error: `Quota exceeded for ${policy.action}. Please try again later.`,
        action: policy.action,
        retryAfterSeconds: result.retryAfterSeconds
      });
    } catch (error) {
      return next(error);
    }
  };
}

module.exports = {
  applyUserActionQuota,
  attachRequestContext,
  beginGoogleAuthFlow,
  buildSecurityHeaders,
  buildSessionPayloadFromGoogleProfile,
  clearOauthFlow,
  clearSession,
  configureTrustProxy,
  consumeGoogleAuthFlow,
  createAiRateLimiter,
  createApiRateLimiter,
  createSessionToken,
  createUserQuotaMiddleware,
  ensureSafeRedirectPath,
  getCookieName,
  getOauthFlowCookieName,
  isAuthConfigured,
  issueSession,
  parseCookies,
  readSessionToken,
  requireApiAuth,
  requirePageAuth,
  safeEqual,
  setCookie
};
