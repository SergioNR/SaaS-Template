# Tasks

## 1. Crash alert delivery

- [ ] 1.1 Make `logError` in `backend/server/config/loggerFunctions.js` return the Telegram send promise (resolved `undefined` on any internal failure; never throws, never rejects); verify `tests/loggerFunctions.spec.js` asserts the returned promise resolves even when the integration mock rejects
- [ ] 1.2 Add (or reuse from `processLifecycle.js`) a `raceWithTimeout(promise, ms)` helper with a non-`unref`'d timer; verify a unit spec for both outcomes
- [ ] 1.3 Rewrite `crashProcess` in `backend/server/app.js`: re-entrancy flag, `await raceWithTimeout(logError(...), 3000)`, `flushLogs()`, `process.exit(1)`; extract it to a testable module if needed (e.g. `utils/processLifecycle.js`) and verify with a spec that mocks `process.exit`: exit called once, after the alert promise settles or after 3 s with fake timers; a second crash event does not call exit again

## 2. Cron drain at shutdown

- [ ] 2.1 `stopCronJobs` in `backend/server/cron/jobsContainer.js` returns `Promise.allSettled` of every job's `stop()`; verify with a spec mocking the three schedulers' `stop()`
- [ ] 2.2 `gracefulShutdown` in `app.js` awaits cron drain together with `closeServer()` and `waitForBackgroundTasks` under one 8 s deadline; logs a warning when the cron drain did not finish; only then `closeResources()`; verify with a spec or a manual run: start a tick that sleeps 3 s (temporary local job), send SIGTERM, observe the disconnect after the tick's completion log
- [ ] 2.3 Decide the open question on downgrading post-shutdown tick errors; if adopted, implement in `runExclusiveCronTick` and cover it in `tests/cronAdvisoryLock.spec.js`

## 3. Docs and validation

- [ ] 3.1 Update the Process bullet in `backend/AGENTS.md`: crash handlers await the alert (3 s cap) before exiting; shutdown waits for running cron ticks inside the 8 s drain
- [ ] 3.2 Manual check: with a Telegram test chat configured, trigger an unhandled rejection locally (temporary route) → the alert arrives before the process exits
- [ ] 3.3 Run `npm test` and `npx eslint .` in `backend/`; both clean
- [ ] 3.4 `npx -y @fission-ai/openspec@1.16.0 validate harden-process-lifecycle --strict` passes
