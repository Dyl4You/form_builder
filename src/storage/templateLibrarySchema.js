const TEMPLATE_LIBRARY_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS workspaces (
  workspace_id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  templates_saved INTEGER NOT NULL DEFAULT 0,
  components_total BIGINT NOT NULL DEFAULT 0,
  xp_total BIGINT NOT NULL DEFAULT 0,
  level INTEGER NOT NULL DEFAULT 1,
  streak_current INTEGER NOT NULL DEFAULT 0,
  streak_longest INTEGER NOT NULL DEFAULT 0,
  streak_last_active_date DATE,
  handcrafted_chain INTEGER NOT NULL DEFAULT 0,
  neglected_revival_count INTEGER NOT NULL DEFAULT 0,
  achievements_unlocked JSONB NOT NULL DEFAULT '[]'::jsonb,
  last_fingerprint_by_template_name JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS users (
  user_id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL UNIQUE REFERENCES workspaces(workspace_id) ON DELETE CASCADE,
  provider TEXT NOT NULL DEFAULT 'google',
  provider_user_id TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'user',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (provider, provider_user_id),
  CHECK (role IN ('user', 'admin'))
);

CREATE TABLE IF NOT EXISTS templates (
  template_id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(workspace_id) ON DELETE CASCADE,
  display_name TEXT NOT NULL,
  name_source TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  current_version_id TEXT,
  first_saved_at TIMESTAMPTZ NOT NULL,
  latest_saved_at TIMESTAMPTZ NOT NULL,
  archived_at TIMESTAMPTZ,
  archived_reason TEXT,
  cover_blob_key TEXT,
  cover_content_type TEXT,
  cover_prompt TEXT,
  cover_updated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (status IN ('active', 'archived'))
);

ALTER TABLE templates ADD COLUMN IF NOT EXISTS cover_blob_key TEXT;
ALTER TABLE templates ADD COLUMN IF NOT EXISTS cover_content_type TEXT;
ALTER TABLE templates ADD COLUMN IF NOT EXISTS cover_prompt TEXT;
ALTER TABLE templates ADD COLUMN IF NOT EXISTS cover_updated_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS template_versions (
  version_id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(workspace_id) ON DELETE CASCADE,
  template_id TEXT NOT NULL REFERENCES templates(template_id) ON DELETE CASCADE,
  version_number INTEGER NOT NULL,
  saved_at TIMESTAMPTZ NOT NULL,
  ymd DATE NOT NULL,
  display_name TEXT NOT NULL,
  name_source TEXT NOT NULL,
  notes JSONB NOT NULL DEFAULT '{}'::jsonb,
  fingerprint TEXT NOT NULL,
  can_load BOOLEAN NOT NULL DEFAULT FALSE,
  blob_key TEXT,
  blob_size_bytes BIGINT NOT NULL DEFAULT 0,
  total_components INTEGER NOT NULL DEFAULT 0,
  unique_types INTEGER NOT NULL DEFAULT 0,
  conditional_count INTEGER,
  calculation_count INTEGER,
  session_elapsed_ms BIGINT,
  max_depth INTEGER NOT NULL DEFAULT 0,
  advanced_feature_count INTEGER NOT NULL DEFAULT 0,
  scores JSONB NOT NULL DEFAULT '{}'::jsonb,
  action_counts JSONB NOT NULL DEFAULT '{}'::jsonb,
  xp JSONB NOT NULL DEFAULT '{}'::jsonb,
  component_genome JSONB NOT NULL DEFAULT '{}'::jsonb,
  telemetry JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (template_id, version_number)
);

CREATE TABLE IF NOT EXISTS template_version_component_counts (
  version_id TEXT NOT NULL REFERENCES template_versions(version_id) ON DELETE CASCADE,
  component_type TEXT NOT NULL,
  component_count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (version_id, component_type)
);

CREATE TABLE IF NOT EXISTS workspace_component_totals (
  workspace_id TEXT NOT NULL REFERENCES workspaces(workspace_id) ON DELETE CASCADE,
  component_type TEXT NOT NULL,
  component_count BIGINT NOT NULL DEFAULT 0,
  PRIMARY KEY (workspace_id, component_type)
);

CREATE TABLE IF NOT EXISTS workspace_daily_stats (
  workspace_id TEXT NOT NULL REFERENCES workspaces(workspace_id) ON DELETE CASCADE,
  ymd DATE NOT NULL,
  versions_saved INTEGER NOT NULL DEFAULT 0,
  xp_gained BIGINT NOT NULL DEFAULT 0,
  mastery_sum NUMERIC(18, 2) NOT NULL DEFAULT 0,
  mastery_count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (workspace_id, ymd)
);

CREATE INDEX IF NOT EXISTS idx_templates_workspace_status_latest
  ON templates (workspace_id, status, latest_saved_at DESC, template_id DESC);

CREATE INDEX IF NOT EXISTS idx_templates_workspace_latest
  ON templates (workspace_id, latest_saved_at DESC, template_id DESC);

CREATE INDEX IF NOT EXISTS idx_template_versions_template_saved
  ON template_versions (template_id, saved_at DESC, version_number DESC);

CREATE INDEX IF NOT EXISTS idx_template_versions_workspace_saved
  ON template_versions (workspace_id, saved_at DESC);

CREATE INDEX IF NOT EXISTS idx_template_versions_workspace_ymd
  ON template_versions (workspace_id, ymd DESC);

CREATE INDEX IF NOT EXISTS idx_template_versions_fingerprint
  ON template_versions (workspace_id, fingerprint, saved_at DESC);

CREATE INDEX IF NOT EXISTS idx_component_counts_type
  ON template_version_component_counts (component_type, version_id);

CREATE TABLE IF NOT EXISTS user_request_quotas (
  user_id TEXT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  period TEXT NOT NULL,
  bucket_start TIMESTAMPTZ NOT NULL,
  request_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, action, period, bucket_start),
  CHECK (period IN ('window', 'day'))
);

CREATE INDEX IF NOT EXISTS idx_user_request_quotas_updated
  ON user_request_quotas (updated_at DESC);
`;

module.exports = {
  TEMPLATE_LIBRARY_SCHEMA_SQL
};
