# Tasks

## 1. Alert format

- [ ] 1.1 In `backend/server/integrations/telegram/sendLogsToTelegram.js` add an escaped `Error Code` line (`N/A` when absent) and compute `Error Details` with the empty / invocation-header-only fallback to the code; verify with a spec that builds the message for (a) a normal error, (b) `{ name: 'PrismaClientKnownRequestError', code: 'ECONNREFUSED', message: '\nInvalid `prisma.file.findMany()` invocation:\n\n' }`, (c) an error without code
- [ ] 1.2 Include `code` in the dedupe key (`message|name|code|errorMessage`); verify in the spec that two errors with the same empty message but different codes both send, and identical ones within 60 s send once

## 2. Transient classification

- [ ] 2.1 Add `isTransientDatabaseError(error)` to `backend/server/utils/prismaErrors.js` (codes `P1001`, `P1017`, `ECONNREFUSED`, `ECONNRESET`, `ETIMEDOUT` on the error or `error.cause`); verify `tests/prismaErrors.spec.js` covers each code, the `cause` path, `P2002` (false), null/undefined (false)

## 3. Cron downgrade

- [ ] 3.1 In `backend/server/cron/exclusiveCronTick.js` keep a per-job consecutive transient-failure count (reset on success and on a skipped lock); log `logWarn` with job name, code and count below 3, `logError` exactly on the third, `logWarn` after; non-transient errors keep `logError` immediately and reset nothing; export a spec reset helper; verify in `tests/cronAdvisoryLock.spec.js` (mock `runWithAdvisoryLockInDb` to reject with `{ code: 'ECONNREFUSED' }` three times, then resolve)
- [ ] 3.2 Verify the 10-minute lock-hold timeout error (non-transient) still alerts on first occurrence

## 4. Docs and validation

- [ ] 4.1 `backend/AGENTS.md` Logging section: alerts include the error code with the empty-message fallback; cron ticks downgrade transient database errors until 3 consecutive failures; update the `README.md` Telegram row if it describes alert contents
- [ ] 4.2 Manual check: start the API with `PRISMA_POSTGRES_URL` pointing at `localhost:<closed port>` and a Telegram test chat, call an endpoint that queries the database → alert shows `Error Code: ECONNREFUSED` and details `ECONNREFUSED`
- [ ] 4.3 Run `npm test` and `npx eslint .` in `backend/`; both clean
- [ ] 4.4 `npx -y @fission-ai/openspec@1.16.0 validate include-error-code-in-alerts --strict` passes
