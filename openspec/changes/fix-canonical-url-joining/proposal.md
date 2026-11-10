# Proposal

## Why

`VITE_SITE_BASE_URL` is normalised in one place and not the other. The build-time `robots.txt`/`sitemap.xml` plugin strips trailing slashes (`frontend/vite.config.js:13`), but `Seo.jsx` joins the raw value with the path (`frontend/src/components/Seo.jsx:16` for canonical/`og:url`, `:19` for the absolute `og:image`). An origin configured as `https://example.com/` therefore ships `https://example.com//pricing` as the canonical URL and `https://example.com//og-image.png` as the social image, while the sitemap lists `https://example.com/pricing` — search engines see a canonical that matches no sitemap entry. The README invites either form, so the misconfiguration is easy.

## What Changes

- One origin normaliser (`normalizeSiteOrigin()` — trims whitespace and trailing slashes) shared by `vite.config.js` (SEO files plugin) and `Seo.jsx` (canonical, `og:url`, absolute image URLs).
- Canonical, `og:url` and absolute image URLs are identical for an origin configured with or without a trailing slash, and match the sitemap entries.
- Unit specs for the normaliser and for `Seo` output.

## Capabilities

### New Capabilities

<!-- none -->

### Modified Capabilities

- `public-site`: "Only public pages are indexable and canonical" and "Every page renders its own SEO metadata" state that URLs are built from the origin with any trailing slash removed.

## Impact

- New `frontend/src/config/siteOrigin.js` (or a function in `publicRoutes.js`, which `vite.config.js` already imports — must stay free of `import.meta.env` so the Vite config can load it).
- `frontend/vite.config.js`, `frontend/src/components/Seo.jsx`.
- Specs: `config/siteOrigin.test.js` (or `publicRoutes.test.js`), `components/Seo.test.jsx`.
- No env var changes; README wording may mention the slash is optional.

## Out of scope

- Validating that the origin is an absolute `https` URL (the build already fails when it is missing).
- Path-prefixed deployments (origin with a sub-path); still unsupported.
