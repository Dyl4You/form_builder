# Deploying The Public Beta

This branch targets a small public beta with:
- Google sign-in
- per-user workspaces
- Postgres for metadata
- Google Cloud Storage for saved template blobs and cover images
- optional AI surface flags for upload, image extraction, and dictation

## 1) Required Production Environment
- `NODE_ENV=production`
- `OPENAI_API_KEY`
- `APP_SESSION_SECRET`
- `DATABASE_URL`
- `GCS_TEMPLATE_BUCKET`
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `GOOGLE_OAUTH_REDIRECT_URI`
- Optional:
  - `CORFIX_API_TOKEN`
  - `CORFIX_COMPANY_ID`
  - `CORFIX_API_BASE_URL`
  - `OPENAI_MODEL`
  - `PORT`
  - `ADMIN_EMAILS`
  - `ENABLE_FILE_UPLOADS=0`
  - `ENABLE_IMAGE_EXTRACTION=0`
  - `ENABLE_AI_DICTATION=0`
  - per-route quota overrides such as `AI_QUOTA_GENERATE_WINDOW_MAX`

The app now fails startup in production if the required Postgres, GCS, Google OAuth, or session config is missing.

## 2) Recommended GCP Setup
1. Provision Cloud SQL Postgres.
2. Provision a GCS bucket for template blobs and cover images.
3. Create a Google OAuth web app and register the exact callback URL used by the deployment.
4. Store secrets in Secret Manager or the provider env config.
5. Deploy the app with `gcloud app deploy app.yaml`.

## 3) Runtime Notes
- The server binds to `0.0.0.0`.
- File/image/audio ingestion can be disabled per deployment with the feature flags above.
- Local development can still run without Google OAuth by using the built-in dev auth profile and the legacy `default` workspace.
