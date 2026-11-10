# syntax=docker/dockerfile:1

# Define a build argument for Node.js version (pinned to a minor so backend
# and frontend images move together - see frontend/Dockerfile)
ARG NODE_VERSION=26.12

# ---------------------------------------------------------------------------
# Stage 1: production dependencies + generated Prisma client
# ---------------------------------------------------------------------------
FROM node:${NODE_VERSION}-alpine AS deps

WORKDIR /usr/src/app

# Install production dependencies only (prisma CLI + tsx are runtime
# dependencies: start.sh runs `prisma migrate deploy` and the server runs via tsx)
# Uses bind mounts for the files and a cache mount for npm
RUN --mount=type=bind,source=package.json,target=package.json \
    --mount=type=bind,source=package-lock.json,target=package-lock.json \
    --mount=type=cache,target=/root/.npm \
    npm ci --omit=dev

# Generate the Prisma client (output: server/config/generated, see
# prisma/schema.prisma). No database URL is needed here: prisma.config.ts
# falls back to a placeholder when PRISMA_POSTGRES_DIRECT_URL is unset
COPY prisma/schema.prisma ./prisma/schema.prisma
COPY prisma.config.ts ./
RUN --mount=type=cache,target=/root/.npm npx prisma generate

# ---------------------------------------------------------------------------
# Stage 2: runtime - source + prod node_modules + generated client only
# ---------------------------------------------------------------------------
FROM node:${NODE_VERSION}-alpine AS runtime

# Production mode for every library that checks NODE_ENV (express, etc.)
ENV NODE_ENV=production

# tini reaps zombies and forwards signals to node (PID 1 duties node does not do)
RUN apk add --no-cache tini

# Set the working directory inside the container
WORKDIR /usr/src/app

COPY --from=deps /usr/src/app/node_modules ./node_modules

# Application source, start.sh, prisma.config.ts and prisma/migrations -
# .dockerignore keeps out tests, docs, the seed script, env files and any
# host-generated Prisma client
COPY . .

# Generated client from the deps stage (never from the host)
COPY --from=deps /usr/src/app/server/config/generated ./server/config/generated

# start.sh is tracked without the exec bit
RUN chmod +x start.sh

# Switch to non-root user for better security - the app files stay owned by
# root, so the process cannot modify its own code
USER node

# Declare that the container will listen on port 3000
EXPOSE 3000

# Readiness probe against /health (server up + database answering). Uses the
# bundled node runtime - alpine ships neither curl nor a TLS-capable wget.
# start_period covers `prisma migrate deploy` on boot
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
    CMD node -e "fetch('http://127.0.0.1:' + (process.env.PORT || 3000) + '/health').then((r) => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

# tini as PID 1 so SIGTERM reaches node and gracefulShutdown runs
ENTRYPOINT ["/sbin/tini", "--"]

# Set the default command to run the production startup script
CMD ["./start.sh"]
