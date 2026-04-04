# Design System

This project now has a baseline design system for future features.

## Source Of Truth

- Tokens and primitives: `public/css/design-system.css`
- Legacy builder styles (now tokenized): `public/css/formBuilder.css`
- Live preview page: `/design-system`

## Core Principles

- Use semantic tokens, not raw hex values.
- Reuse DS primitives before introducing new one-off classes.
- Keep spacing, radius, and motion values on token scale.
- Treat accessibility states (focus/hover/contrast) as first-class.

## Token Categories

- Typography: `--ds-font-display`, `--ds-font-sans`, `--ds-font-mono`
- Color: `--ds-color-*` (`canvas`, `surface`, `text`, `accent`, `danger`, `info`)
- Spacing: `--ds-space-*`
- Radius: `--ds-radius-*`
- Motion: `--ds-duration-*`, `--ds-ease-standard`
- Layering: `--ds-z-*`

Legacy aliases are exposed as `--fb-*` for existing builder UI migration.

## Primitives You Can Use Immediately

- Layout: `ds-page`, `ds-shell`, `ds-stack`, `ds-stack-sm`, `ds-grid`, `ds-cluster`
- Surfaces: `ds-surface`, `ds-surface-strong`
- Typography helpers: `ds-display`, `ds-title`, `ds-eyebrow`, `ds-copy`, `ds-muted`
- Buttons: `ds-btn` + `ds-btn-primary|secondary|ghost|danger`
- Inputs: `ds-input`, `ds-select`, `ds-textarea`
- Status: `ds-badge` + `ds-badge-info|warning|success`
- Token docs: `ds-token-grid`, `ds-token-card`, `ds-swatch`, `ds-code`

## Feature Implementation Checklist

1. Start new UI with `design-system.css` classes and tokens.
2. Add new component variants as DS classes (`ds-*`) only when reusable.
3. If touching old builder styles, prefer replacing literals with `--fb-*` or `--ds-*`.
4. Validate keyboard focus and contrast before merging.
5. Add/refresh examples on `/design-system` when new primitives are introduced.

## Migration Strategy

- Phase 1 (current): token bridge in legacy CSS and shared DS primitives.
- Phase 2: new screens/features ship directly with `ds-*` classes.
- Phase 3: move heavily reused legacy selectors to DS primitives and remove duplicates.
