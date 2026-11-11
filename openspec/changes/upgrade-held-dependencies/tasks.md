# Tasks

## 1. i18next 27 + react-i18next 18 (frontend)

- [ ] 1.1 After 2026-11-14 (7 days past the 2026-11-07 release), read both changelogs/migration guides; note breaking changes affecting `src/i18n/index.js`, `useTranslation`, `<Trans>`
- [ ] 1.2 `npm install i18next@^27 react-i18next@^18` in `frontend/`; apply required changes
- [ ] 1.3 Verify: `npm run lint`, `npm test`, `npm run build`; manual smoke of a `<Trans>` page (dashboard subscription note) and interpolated copy

## 2. Frontend ESLint 10

- [ ] 2.1 Check `npm view eslint-plugin-react peerDependencies`; if ESLint 10 is supported, upgrade `eslint`, `@eslint/js` and the plugin together
- [ ] 2.2 Otherwise decide option B/C from design.md; if `react/prop-types` goes away, remove `prop-types` and every `propTypes` block and update `frontend/AGENTS.md`
- [ ] 2.3 Verify: `npm run lint` clean with the same (or a documented) rule set; `npm test`, `npm run build`

## 3. Prisma 8 (backend)

- [ ] 3.1 Wait for 8.0.0 GA plus the 7-day cooldown; read the upgrade guide
- [ ] 3.2 Upgrade `prisma`, `@prisma/client`, `@prisma/adapter-pg` together; update `prisma.config.ts`, generator block, `server/config/prismaClient.js`; `npx prisma generate`
- [ ] 3.3 Verify: `npm test`, `npx eslint .`; `npx prisma migrate deploy` + `npx prisma db seed` on a fresh local DB; `docker build ./backend`; boot and hit `/health`

## 4. @logtail/pino 0.6 (backend)

- [ ] 4.1 Review the 0.6 changelog for transport option changes; upgrade
- [ ] 4.2 Verify: `npm test` (`loggerTransport.spec.js`); manual run with a Better Stack test source token shows lines arriving

## 5. Replace swagger-jsdoc (backend)

- [x] 5.1 Snapshot the current generated OpenAPI document (one-time, outside the repo: the coverage spec stays the ongoing guard - a committed fixture would need regenerating on every route doc change)
- [x] 5.2 Option B from design.md: `server/utils/openapiAnnotations.js` (`extractOpenapiBlocks`, `mergeOpenapiAnnotations` with swagger-jsdoc's merge rules, `buildOpenapiDocument` with `fs.globSync`) on the maintained `yaml` package; `swagger-jsdoc` removed; spec'd in `tests/openapiAnnotations.spec.js`
- [x] 5.3 Verified: generated document deep-equals the snapshot (path order is now alphabetical within each `apis` glob instead of filesystem order); `openapiCoverage.spec.js`, `docsRouter.spec.js` pass; `npm ls glob minimatch` shows only dev-tool copies; `npm audit --omit=dev` reports 0 vulnerabilities

## 6. Close-out

- [ ] 6.1 Update the stack sections of `backend/AGENTS.md` / `frontend/AGENTS.md` with new majors
- [ ] 6.2 One `chore(deps)` PR per group above; CI PR gate green on each
