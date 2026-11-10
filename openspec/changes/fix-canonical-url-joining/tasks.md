# Tasks

## 1. Shared normaliser

- [ ] 1.1 Add pure `normalizeSiteOrigin(value)` (trim, strip trailing `/`s) in a module importable from both `vite.config.js` and the app (e.g. `frontend/src/config/publicRoutes.js` or a new `src/config/siteOrigin.js`, no `import.meta.env`); unit-test `https://example.com`, `https://example.com/`, `https://example.com///`, surrounding whitespace
- [ ] 1.2 `frontend/vite.config.js`: replace the inline `replace(/\/+$/, '')` with the helper

## 2. Seo component

- [ ] 2.1 `frontend/src/components/Seo.jsx`: build `url` and `imageUrl` from the normalised origin
- [ ] 2.2 `components/Seo.test.jsx` (stub `VITE_SITE_BASE_URL` via `vi.stubEnv`): with a trailing-slash origin, canonical and `og:url` for `/pricing` are `https://example.com/pricing` and `og:image` is `https://example.com/og-image.png`; internal pages emit no canonical

## 3. Verification

- [ ] 3.1 `npm run lint`, `npm test` in `frontend/` pass
- [ ] 3.2 `VITE_SITE_BASE_URL=https://example.com/ VITE_API_BASE_URL=http://localhost:3000 npm run build` and grep `dist/sitemap.xml` for no `//pricing`; `npm run preview`, open `/pricing`, confirm the canonical in the DOM has a single slash
- [ ] 3.3 `npx -y @fission-ai/openspec@1.16.0 validate fix-canonical-url-joining --strict` passes
