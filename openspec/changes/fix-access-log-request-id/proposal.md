# Proposal

## Why

Request ids are generated per request (`generateRequestId` in `backend/server/middlewares/requestLogger.js`), echoed as `X-Request-Id`, and written as `reqId` on audit lines and `requestId` on error-handler lines and Telegram alerts. But the access line itself does not carry it: pino-http only binds `req.id` through the `req` serializer (it adds a top-level `reqId` only with `quietReqLogger`), and our custom `serializeRequest` (`requestLogger.js:12-15`) keeps just `method` and `path`. So an alert's request id matches the error line and the audit line, but not the access line that holds the status, response time, user, company and IP - the line you actually want when triaging. `backend/AGENTS.md` already documents `reqId` on access lines, so code and docs disagree.

## What Changes

- Every access line carries a top-level `reqId` equal to the request's `X-Request-Id` (same field name as audit lines, so one Better Stack filter matches both).
- Nothing else in the access line changes; headers, query strings and bodies stay out.
- No new routes, env vars or migrations.

## Capabilities

### New Capabilities

<!-- none -->

### Modified Capabilities

- `observability`: the access-line requirement lists `reqId`; the request-id requirement states the id appears on access lines too.

## Impact

- `backend/server/middlewares/requestLogger.js` - add `reqId: req.id` to `requestLogProps` (preferred over `quietReqLogger`, which would also rebind every child logger line).
- Tests: `backend/tests/requestLogger.spec.js` (props include `reqId`), `backend/tests/appIntegration.spec.js` (captured access line `reqId` equals the response's `X-Request-Id`).
- `backend/AGENTS.md` - already states it; re-read the Logging bullet after the fix and keep it accurate.

## Out of scope

- Honouring inbound request ids or trace propagation.
- Adding the id to detached background work logs (no `req` there).
