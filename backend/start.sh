#!/bin/sh
set -e

#* prisma.config.ts falls back to a placeholder URL when the variable is
#* missing (needed for `prisma generate` at build time) - at runtime that
#* would surface as an obscure connection error, so fail fast with a clear one
: "${PRISMA_POSTGRES_DIRECT_URL:?PRISMA_POSTGRES_DIRECT_URL is required}"

#* One-time bridge for the 2026-11-11 migration squash: marks 0_init as
#* applied on databases that ran the old history, and refuses to start on one
#* that stopped part-way (see the script header). Removable once every
#* environment has 0_init recorded
node --import tsx ./prisma/baselineSquashedMigrations.js

npx prisma migrate deploy # for LATEST and NEXT builds

echo "Starting application"
#* exec node directly (not `npm run start`): with tini as PID 1 the signal
#* reaches node itself, so SIGTERM triggers gracefulShutdown in app.js.
#* Keep the flags in sync with the `start` script in package.json
exec node --import tsx ./server/app.js
