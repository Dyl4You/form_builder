function trimString(value) {
  return String(value || '').trim();
}

function isProductionEnvironment(env = process.env) {
  return trimString(env.NODE_ENV).toLowerCase() === 'production';
}

function hasGoogleAuthConfig(env = process.env) {
  return Boolean(
    trimString(env.GOOGLE_CLIENT_ID)
    && trimString(env.GOOGLE_CLIENT_SECRET)
    && trimString(env.GOOGLE_OAUTH_REDIRECT_URI)
  );
}

function parseEmailSet(rawValue = '') {
  return new Set(
    trimString(rawValue)
      .split(',')
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean)
  );
}

function parseAdminEmails(env = process.env) {
  return parseEmailSet(env.ADMIN_EMAILS);
}

function parseAllowedEmails(env = process.env) {
  return parseEmailSet(env.ALLOWED_EMAILS);
}

function isEmailAllowed(email = '', env = process.env) {
  const allowedEmails = parseAllowedEmails(env);
  if (!allowedEmails.size) return true;
  return allowedEmails.has(trimString(email).toLowerCase());
}

function resolveUserRole(email = '', env = process.env) {
  return parseAdminEmails(env).has(trimString(email).toLowerCase()) ? 'admin' : 'user';
}

function getDevAuthProfile(env = process.env) {
  const email = trimString(env.DEV_AUTH_EMAIL) || 'dev@example.com';
  const workspaceId = trimString(env.DEV_WORKSPACE_ID)
    || trimString(env.TEMPLATE_WORKSPACE_ID)
    || 'default';
  const userId = trimString(env.DEV_AUTH_USER_ID) || workspaceId;
  const displayName = trimString(env.DEV_AUTH_NAME)
    || (workspaceId === 'default' ? 'Default Workspace' : 'Local Developer');

  return {
    authenticated: true,
    authMode: 'dev-bypass',
    userId,
    workspaceId,
    email,
    displayName,
    role: resolveUserRole(email, env)
  };
}

function isFeatureEnabled(value, defaultValue = true) {
  const normalized = trimString(value).toLowerCase();
  if (!normalized) return defaultValue;
  if (['0', 'false', 'no', 'off', 'disabled'].includes(normalized)) return false;
  if (['1', 'true', 'yes', 'on', 'enabled'].includes(normalized)) return true;
  return defaultValue;
}

function isFreeBuilderMode(env = process.env) {
  return isFeatureEnabled(env.FREE_BUILDER_MODE, false);
}

function getPublicAiFeatures(env = process.env) {
  const freeMode = isFreeBuilderMode(env);
  const assistant = isFeatureEnabled(env.ENABLE_AI_ASSIST, !freeMode);
  const imageExtraction = isFeatureEnabled(env.ENABLE_IMAGE_EXTRACTION, true);

  return {
    assistant,
    fileUpload: assistant && isFeatureEnabled(env.ENABLE_FILE_UPLOADS, !freeMode),
    dictation: assistant && isFeatureEnabled(env.ENABLE_AI_DICTATION, !freeMode),
    imageExtraction,
    imageExtractionAiRefinement: imageExtraction
      && !freeMode
      && isFeatureEnabled(env.ENABLE_IMAGE_EXTRACTION_AI_REFINEMENT, false),
    translation: isFeatureEnabled(env.ENABLE_AI_TRANSLATION, !freeMode)
  };
}

function getDefaultWorkspaceId(env = process.env, options = {}) {
  if (Object.prototype.hasOwnProperty.call(options, 'workspaceId')) {
    return trimString(options.workspaceId) || null;
  }

  const configured = trimString(env.TEMPLATE_WORKSPACE_ID);
  if (configured) return configured;

  return isProductionEnvironment(env) ? null : 'default';
}

function getDefaultWorkspaceDisplayName(env = process.env, options = {}) {
  if (Object.prototype.hasOwnProperty.call(options, 'workspaceDisplayName')) {
    return trimString(options.workspaceDisplayName) || 'Default Workspace';
  }
  return trimString(env.TEMPLATE_WORKSPACE_NAME) || 'Default Workspace';
}

function validateRuntimeConfiguration(env = process.env) {
  if (!isProductionEnvironment(env)) {
    return [];
  }

  const missing = [];

  if (!trimString(env.DATABASE_URL)) missing.push('DATABASE_URL');
  if (!trimString(env.GCS_TEMPLATE_BUCKET)) missing.push('GCS_TEMPLATE_BUCKET');
  if (!trimString(env.GOOGLE_CLIENT_ID)) missing.push('GOOGLE_CLIENT_ID');
  if (!trimString(env.GOOGLE_CLIENT_SECRET)) missing.push('GOOGLE_CLIENT_SECRET');
  if (!trimString(env.GOOGLE_OAUTH_REDIRECT_URI)) missing.push('GOOGLE_OAUTH_REDIRECT_URI');
  if (!trimString(env.APP_SESSION_SECRET)) missing.push('APP_SESSION_SECRET');

  return missing;
}

module.exports = {
  getDefaultWorkspaceDisplayName,
  getDefaultWorkspaceId,
  getDevAuthProfile,
  getPublicAiFeatures,
  hasGoogleAuthConfig,
  isEmailAllowed,
  isFreeBuilderMode,
  isProductionEnvironment,
  parseAdminEmails,
  parseAllowedEmails,
  resolveUserRole,
  trimString,
  validateRuntimeConfiguration
};
