# syntax=docker/dockerfile:1

# Pinned to a Node 26 minor - bump deliberately
ARG NODE_VERSION=26.12

# First stage: build the application
FROM node:${NODE_VERSION}-alpine AS build

# Vite bakes VITE_* vars into the bundle at build time - pass them with --build-arg
ARG VITE_API_BASE_URL
ARG VITE_PUBLIC_POSTHOG_KEY
ARG VITE_SITE_BASE_URL

# Fail fast when a required build arg is missing
RUN test -n "$VITE_API_BASE_URL" || { echo 'VITE_API_BASE_URL build arg is required' >&2; exit 1; }; \
  test -n "$VITE_SITE_BASE_URL" || { echo 'VITE_SITE_BASE_URL build arg is required' >&2; exit 1; }

WORKDIR /usr/src/app

# Install exact lockfile dependencies (devDependencies included - Vite is one)
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci

COPY . .

# Set after `npm ci` so devDependencies are still installed for the build
ENV NODE_ENV=production

RUN npm run build

# Second stage: serve the static bundle with an unprivileged nginx (port 8080)
FROM nginxinc/nginx-unprivileged:1.30.6-alpine

# Default API origin allowed by the CSP connect-src - derived from the build
# arg, overridable at runtime with `-e NGINX_CSP_API_ORIGIN=...`
ARG VITE_API_BASE_URL
ENV NGINX_CSP_API_ORIGIN=${VITE_API_BASE_URL}
# Extra connect-src origins (space-separated, e.g. the S3/MinIO origin that
# presigned uploads go to). Must be defined - even empty - or envsubst leaves
# the placeholder in the header.
ENV NGINX_CSP_CONNECT_EXTRA=""

# The image entrypoint renders /etc/nginx/templates/*.template with envsubst
# into /etc/nginx/conf.d/ on startup
COPY nginx/default.conf.template /etc/nginx/templates/default.conf.template
COPY nginx/security-headers.inc.template /etc/nginx/templates/security-headers.inc.template

COPY --from=build /usr/src/app/dist /usr/share/nginx/html

EXPOSE 8080

# `docker compose up -d --wait` and `depends_on: condition: service_healthy`
# treat the container as ready only once this passes. busybox wget ships in
# the alpine base (no curl). /healthz is a plain 200 from nginx; on an older
# nginx config the SPA fallback still answers it with index.html
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1:8080/healthz || exit 1
