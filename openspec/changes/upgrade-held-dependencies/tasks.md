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

- [ ] 5.1 Snapshot the current generated OpenAPI document to a test fixture
- [ ] 5.2 Implement the option chosen in design.md; remove `swagger-jsdoc`
- [ ] 5.3 Verify: generated document deep-equals the snapshot; `openapiCoverage.spec.js`, `docsRouter.spec.js` pass; `npm ls glob minimatch` no longer shows the swagger-jsdoc copies; `npm audit --omit=dev` clean of them

## 6. Close-out

- [ ] 6.1 Update the stack sections of `backend/AGENTS.md` / `frontend/AGENTS.md` with new majors
- [ ] 6.2 One `chore(deps)` PR per group above; CI PR gate green on each
