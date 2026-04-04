# Form Builder

Form Builder is a server-rendered Node/Express app for building Form.io templates with a visual builder, AI-assisted drafting tools, saved template versions, translation helpers, and usage stats.

This branch keeps the existing local builder experience available by default while also including the public-launch foundation:
- local development stays on the legacy shared workspace unless you opt into per-user dev settings
- Google sign-in and per-user workspaces are available for public deployments
- AI upload, image extraction, and dictation stay enabled unless you explicitly disable them with feature flags

## Quick Start

1. Install dependencies:

```bash
npm ci
```

2. Set environment variables:

```bash
OPENAI_API_KEY=your_key_here
APP_SESSION_SECRET=long-random-secret
# Optional local-dev defaults:
# OPENAI_MODEL=gpt-4.1-mini
# DEV_AUTH_USER_ID=dev-user
# DEV_AUTH_EMAIL=dev@example.com
# PORT=3000
```

3. Start the app:

```bash
npm start
```

4. Open the local pages:

- `http://localhost:3000/formbuilder`
- `http://localhost:3000/guide`
- `http://localhost:3000/stats`
- `http://localhost:3000/design-system`

When Google OAuth is not configured, local development uses a built-in dev auth profile that points at the legacy `default` workspace unless you override it. Production requires Google OAuth plus Postgres and GCS.

## Common Commands

```bash
npm run dev
npm test
npm run docs:capture
```

`npm run docs:capture` refreshes the committed guide screenshots and looping `.webm` clips in `public/media/guide`. Install the Playwright browser once before the first capture run:

```bash
npx playwright install chromium
```

## Documentation

- Product setup, screen tours, and component reference: `/guide`
- Deployment and sharing notes: `DEPLOY.md`
- Design-system tokens and primitives: `/design-system`

## Notes

- Set `ENABLE_FILE_UPLOADS=0`, `ENABLE_AI_DICTATION=0`, or `ENABLE_IMAGE_EXTRACTION=0` to turn off those surfaces for a public deployment.
- Template cover generation disables itself when OCR text verification support is not installed.
