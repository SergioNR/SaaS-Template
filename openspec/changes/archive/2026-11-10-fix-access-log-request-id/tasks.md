# Tasks

## 1. Access line request id

- [x] 1.1 Add `reqId: req.id ?? null` to `requestLogProps` in `backend/server/middlewares/requestLogger.js`; verify `tests/requestLogger.spec.js` asserts the prop
- [x] 1.2 `tests/appIntegration.spec.js`: capture the access line for one request (success) and one 500 (handler throws) and assert `reqId` equals the response `X-Request-Id`, and equals the error-handler line's `requestId` for the 500

## 2. Docs and validation

- [x] 2.1 Re-read the Access log / Request ids bullets in `backend/AGENTS.md`; they must describe the shipped behaviour (top-level `reqId` on access and audit lines, `requestId` on error lines)
- [x] 2.2 Manual smoke: `npm run start:local`, call any endpoint, check the stdout access line has `reqId` matching the `X-Request-Id` header — not run by hand (no local Postgres in the implementing environment); the same assertion runs over HTTP in `appIntegration.spec.js` (`access line request id`)
- [x] 2.3 Run `npm test` and `npx eslint .` in `backend/`; both clean
- [x] 2.4 `npx -y @fission-ai/openspec@1.16.0 validate fix-access-log-request-id --strict` passes
