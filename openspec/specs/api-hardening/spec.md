# api-hardening Specification

## Purpose
Owns the cross-cutting protections of the API and of the SPA's web server: rate-limit and slow-down budgets and their 429 responses, CORS and the Origin/Referer CSRF check, JSON-only request bodies, security headers and content security policies, session cookie attributes, reverse-proxy trust, boot-time configuration guards, the seed guard, API documentation exposure, the uniform JSON 404, the validation-error and error-response shapes, and the frontend nginx headers. Flow-specific outcomes of a limiter (for example how the login form reacts to a 429) belong to the owning capability; the budgets live here.

## Requirements

### Requirement: Global rate limit

The system SHALL limit every client IP to 100 requests per 15 minutes across the API, answering requests over the limit with 429, a JSON `message` and standard `RateLimit` headers, and logging a rate-limit warning with the client IP. The limit SHALL be disabled when `DEPLOY_ENVIRONMENT=localhost` and SHALL never apply to `/health`, `/webhooks` or the API docs.

#### Scenario: Budget exhausted

- **WHEN** one IP sends its 101st request within 15 minutes in a deployed environment
- **THEN** the API responds 429 with a JSON `message`

#### Scenario: Health probes never throttled

- **WHEN** an orchestrator polls `/health` far beyond the global budget
- **THEN** every probe is answered without throttling or delay

### Requirement: Global slow-down

The system SHALL delay a client IP's requests after its 30th within a 5-minute window by 100 ms per extra request, capped at 2 seconds, with the same environment and route exemptions as the global rate limit. Requests over the global rate limit SHALL be rejected immediately rather than delayed first.

#### Scenario: Slow-down before rejection

- **WHEN** one IP sends its 35th request within 5 minutes in a deployed environment
- **THEN** the response is delayed by about 500 ms but still served

### Requirement: Shared credential endpoint budget

The system SHALL apply a shared per-IP budget of 10 requests per 15 minutes to login, registration, invite check, invite accept, password-reset token check and password-reset submit, answering 429 with a JSON `message` and logging a rate-limit warning. It SHALL apply in every environment, local development included.

#### Scenario: Shared auth budget

- **WHEN** one IP sends an 11th request within 15 minutes to any of these endpoints
- **THEN** the API responds 429

### Requirement: Per-account login budget

The system SHALL allow at most 5 failed login attempts per 15 minutes per normalized email together with the client IP (successful logins do not count), answering 429 with a JSON `message` beyond it. IPv6 clients SHALL be keyed by their /56 subnet in this and every other IP-keyed limiter. Limiter state is per process.

#### Scenario: Account brute force from one source

- **WHEN** one IP fails to log in to the same account 5 times within 15 minutes
- **THEN** the next login attempt for that account from that IP responds 429

#### Scenario: Victim not locked out from elsewhere

- **WHEN** an attacker has exhausted the per-account budget of a victim's email from their own IP
- **THEN** the victim can still attempt to log in from a different IP

### Requirement: Password-reset email budget

The system SHALL give the password-reset email request its own per-IP budget of 5 requests per hour, independent of the shared credential budget, answering 429 with a JSON `message` beyond it, in every environment.

#### Scenario: Reset email throttled independently

- **WHEN** one IP requests a 6th password-reset email within an hour
- **THEN** the API responds 429 even if its login budget is untouched

### Requirement: Webhook budget

The system SHALL give `/webhooks` its own per-IP budget of 300 requests per minute, active in every environment, answering 429 with a JSON `message` when exceeded; webhooks SHALL be exempt from the global limiter, the slow-down, the Origin check and the JSON content-type check.

#### Scenario: Webhook flood

- **WHEN** one IP sends more than 300 webhook requests within a minute
- **THEN** the excess requests respond 429

### Requirement: CORS allowlist

The system SHALL allow credentialed cross-origin requests only from the origin of `FRONT_WEB_APP_ORIGIN_URL` (scheme, host and port; path and trailing slash ignored), plus the local dev-server origins `http://localhost:5173`, `http://localhost:3000` and `http://localhost:8080` only when `DEPLOY_ENVIRONMENT=localhost`.

#### Scenario: Front-end origin allowed

- **WHEN** the SPA's origin sends a credentialed request
- **THEN** the response allows that origin with credentials

#### Scenario: Dev servers not trusted in deployment

- **WHEN** a request from `http://localhost:5173` reaches a deployed environment
- **THEN** the response does not allow that origin

### Requirement: Origin check on state-changing requests

The system SHALL require every request with a method other than GET, HEAD or OPTIONS to carry an `Origin` — or, when absent, a `Referer` — whose origin is in the CORS allowlist or equals the API's own origin, answering 403 with a JSON `message` otherwise. An `Origin` of the literal `null` SHALL count as no origin.

#### Scenario: Cross-site POST

- **WHEN** a POST arrives with an `Origin` that is not the front-end origin
- **THEN** the API responds 403 and no handler runs

#### Scenario: Referer fallback

- **WHEN** a PATCH arrives without `Origin` but with a `Referer` under the front-end origin
- **THEN** the request is processed

#### Scenario: No origin information

- **WHEN** a DELETE arrives with neither `Origin` nor `Referer`
- **THEN** the API responds 403

#### Scenario: Safe methods unaffected

- **WHEN** a GET arrives from any origin
- **THEN** the Origin check does not block it

### Requirement: API bodies must be JSON

The system SHALL reject any `/api` request that carries a body (non-zero `Content-Length` or chunked transfer) with a content type other than `application/json`, answering 415 with a JSON `message`, and SHALL never parse URL-encoded or multipart bodies. Malformed JSON SHALL answer 400 and a body over the JSON parser limit (100 KB) SHALL answer 413, both with the standard error shape.

#### Scenario: Form post rejected

- **WHEN** a POST to `/api/v1/auth/login` is sent as `application/x-www-form-urlencoded`
- **THEN** the API responds 415

#### Scenario: Body-less request allowed

- **WHEN** a POST without a body and without a content type is sent to an `/api` route
- **THEN** the content-type check lets it through

#### Scenario: Broken JSON

- **WHEN** an `/api` request carries `application/json` with an unparsable body
- **THEN** the API responds 400

### Requirement: API security headers

The system SHALL send hardening headers on every API response — including `Strict-Transport-Security`, `X-Content-Type-Options: nosniff`, `X-Frame-Options` and `Referrer-Policy: no-referrer` — and SHALL omit `X-Powered-By`. The content security policy SHALL be exactly `default-src 'none'; frame-ancestors 'none'` on every response except the docs UI.

#### Scenario: API response policy

- **WHEN** any API endpoint responds
- **THEN** the `Content-Security-Policy` header is `default-src 'none'; frame-ancestors 'none'`

### Requirement: Docs content security policy

The Swagger UI route alone SHALL replace the API policy with one that allows only same-origin scripts (no inline or third-party scripts), same-origin and inline styles, same-origin and `data:` images, connections to its own origin plus the optional `API_PUBLIC_ORIGIN_URL`, no objects, a same-origin base URI and no framing.

#### Scenario: Docs policy

- **WHEN** Swagger UI is served on local development
- **THEN** its response carries the docs policy, and no other route does

### Requirement: Session cookie attributes per environment

The system SHALL issue the session cookie `app.sid` as `HttpOnly` with a 24-hour max age matching the stored session lifetime, only once a session holds data. Outside `DEPLOY_ENVIRONMENT=localhost` it SHALL be `Secure` with `SameSite=None`; on localhost non-secure with `SameSite=Lax`. Clearing SHALL use the same attributes. Outside localhost a missing `SESSION_SECRET` SHALL stop the boot; localhost uses a fixed development secret.

#### Scenario: Deployed cookie

- **WHEN** a user logs in on a deployed environment
- **THEN** the `Set-Cookie` for `app.sid` carries `HttpOnly`, `Secure` and `SameSite=None` with a 24-hour lifetime

#### Scenario: Anonymous visitor

- **WHEN** an anonymous request reaches the API
- **THEN** no session cookie is set

### Requirement: Explicit reverse-proxy trust

The system SHALL read which reverse-proxy hops to trust from `TRUST_PROXY` — a hop count, `false`, or a comma-separated list of addresses, subnets or presets — so client IP and protocol (and therefore rate-limit keys) come only from trusted hops. `TRUST_PROXY=true` SHALL stop the boot. A missing or empty value SHALL stop the boot outside local development and trust no proxy on `DEPLOY_ENVIRONMENT=localhost`.

#### Scenario: Missing trust configuration

- **WHEN** a deployed environment boots without `TRUST_PROXY`
- **THEN** the server refuses to start

#### Scenario: Trust-everything rejected

- **WHEN** `TRUST_PROXY=true`
- **THEN** the server refuses to start

#### Scenario: Spoofed forwarding header

- **WHEN** `TRUST_PROXY=1` and a client sends its own `X-Forwarded-For` chain through the proxy
- **THEN** the client IP is taken from the hop added by the trusted proxy, not from the forged entries

### Requirement: No localhost mode in production

The system SHALL refuse to start when `NODE_ENV=production` is combined with `DEPLOY_ENVIRONMENT=localhost`, before any request is served, because that mode disables the session secret requirement, the global limiters, secure cookies and error hiding.

#### Scenario: Production in localhost mode

- **WHEN** the process starts with `NODE_ENV=production` and `DEPLOY_ENVIRONMENT=localhost`
- **THEN** it throws before serving any request

### Requirement: Required configuration fails fast

Outside local development the system SHALL refuse to start when the database connection string, `SESSION_SECRET`, `FRONT_WEB_APP_ORIGIN_URL` (missing or not a valid URL), `TRUST_PROXY`, the Stripe API key or webhook secret, or the Brevo API key, sender or template ids are missing. On `DEPLOY_ENVIRONMENT=localhost` the same gaps SHALL only log a warning. An invalid or missing `PORT` SHALL log a warning and default to 3000.

#### Scenario: Missing secret in a deployed environment

- **WHEN** a deployed environment boots without `SESSION_SECRET`
- **THEN** the server refuses to start

#### Scenario: Local development with gaps

- **WHEN** `DEPLOY_ENVIRONMENT=localhost` and some required variables are unset
- **THEN** the server starts and logs a warning for each

### Requirement: Every plan resolves to a price at boot

Outside local development the system SHALL refuse to start when any advertised plan and billing cycle (`basic` or `pro`, `monthly` or `yearly`) resolves to no Stripe price id — neither its own `STRIPE_PRICE_ID_<PLAN>_<CYCLE>` nor the `STRIPE_PRICE_ID` fallback. On localhost it SHALL only warn.

#### Scenario: Unpriced plan

- **WHEN** neither `STRIPE_PRICE_ID_PRO_YEARLY` nor `STRIPE_PRICE_ID` is set outside local development
- **THEN** the server refuses to start

#### Scenario: Single fallback price

- **WHEN** only `STRIPE_PRICE_ID` is set
- **THEN** the server starts and every plan and cycle uses that price

### Requirement: Seed guard

The database seed, which creates well-known accounts with a public password (a superadmin included), SHALL run only when `DEPLOY_ENVIRONMENT=localhost` or `ALLOW_SEED=1`; otherwise it SHALL write nothing and exit with a non-zero code.

#### Scenario: Seed on a deployed database

- **WHEN** the seed runs without `DEPLOY_ENVIRONMENT=localhost` and without `ALLOW_SEED=1`
- **THEN** it refuses, writes nothing and exits non-zero

### Requirement: API documentation only on local development

The system SHALL serve the interactive API documentation at `/api/docs` and the raw OpenAPI document at `/api/docs.json` only when `DEPLOY_ENVIRONMENT=localhost`; elsewhere those paths SHALL answer the JSON 404 route-not-found body. Unknown paths under `/api/docs/` SHALL answer the JSON 404 without affecting other `/api` routes.

#### Scenario: Docs hidden in deployment

- **WHEN** a client requests `/api/docs.json` on a deployed environment
- **THEN** the API responds 404 with the route-not-found `message`

#### Scenario: Docs on local development

- **WHEN** a developer opens `/api/docs` with `DEPLOY_ENVIRONMENT=localhost`
- **THEN** Swagger UI is served

### Requirement: Uniform JSON 404 for unknown routes

The system SHALL answer a request of any method for a path that matches no route with 404 and `{ "message": "The requested route is not available or does not exist" }`, never an HTML page — after the earlier protections (a state-changing request without an allowed origin gets 403 first). `GET /` SHALL answer 200 with a JSON `message`.

#### Scenario: Unknown path with an unusual method

- **WHEN** a PUT with an allowed `Origin` targets a path no router defines
- **THEN** the API responds 404 with the JSON route-not-found body

#### Scenario: Unknown API path

- **WHEN** a GET targets `/api/v1/does-not-exist`
- **THEN** the API responds 404 with the JSON route-not-found body

### Requirement: Validation error shape

The system SHALL reject requests whose params, query or body fail validation with 422 and `{ errors: [...] }` before any business logic runs, each entry carrying `type`, `msg`, `path`, `location` and `value`. The `value` of `password`, `newPassword`, `currentPassword`, `confirmNewPassword`, `passwordResetToken`, `inviteToken`, `email` and `username` SHALL be replaced by `[REDACTED]`.

#### Scenario: Redacted value

- **WHEN** a registration fails validation on its `password` field
- **THEN** the 422 entry for `password` carries `value: "[REDACTED]"`

### Requirement: String type and password byte length

Fields that must be strings SHALL reject arrays, objects and other non-string values with 422. Every field that sets a password SHALL also be limited to 72 UTF-8 bytes, answering 422 beyond it, so multi-byte passwords cannot exceed what the password hash covers.

#### Scenario: Array instead of string

- **WHEN** a login body sends `username` as an array
- **THEN** the API responds 422

#### Scenario: Multi-byte password over the byte limit

- **WHEN** a new password is within the character limit but exceeds 72 UTF-8 bytes
- **THEN** the API responds 422

### Requirement: Error responses never leak internals outside local development

The system SHALL answer unexpected errors with their HTTP status (framework 4xx such as 400 or 413 kept, anything else 500) and `{ name, message }`. Outside `DEPLOY_ENVIRONMENT=localhost`, `name` SHALL be the standard status text and `message` a generic sentence (one for 4xx, one for 5xx), never the error's own message or stack; on localhost the error's own name and message SHALL be returned.

#### Scenario: Internal error in a deployed environment

- **WHEN** a handler throws a database error on a deployed environment
- **THEN** the API responds 500 with `name: "Internal Server Error"` and a generic `message`

#### Scenario: Local debugging

- **WHEN** the same error happens with `DEPLOY_ENVIRONMENT=localhost`
- **THEN** the response carries the error's own name and message

### Requirement: Frontend content security policy

The SPA's web server SHALL send on every response, errors included, a policy of `default-src 'self'`; scripts from self plus the configured analytics origins; inline styles; images from self, `data:` and HTTPS; fonts from self and `data:`; connections to self plus the configured API, extra (storage) and analytics origins; `frame-ancestors 'none'`; `base-uri 'self'`; `form-action 'self'`.

#### Scenario: Headers on asset responses

- **WHEN** a hashed asset is served with its long-lived cache header
- **THEN** the same content security policy is present

### Requirement: Frontend security headers

The SPA's web server SHALL send on every response `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`, `Strict-Transport-Security` including subdomains, and a `Permissions-Policy` denying camera, microphone, geolocation, payment and USB, and SHALL not reveal its server version.

#### Scenario: Deep link

- **WHEN** a browser loads `/admin/users` directly
- **THEN** the SPA entry document is served with these headers

### Requirement: Frontend routing and caching

The SPA's web server SHALL answer unknown client routes with the SPA entry document, serve that document with `no-cache` and hashed assets as immutable for a year, answer `/healthz` with 200 `ok`, and answer any `/api/` path with 404 instead of the SPA document.

#### Scenario: Mistaken relative API call

- **WHEN** a browser requests `/api/v1/user` from the SPA's origin
- **THEN** the web server responds 404, not the SPA document

#### Scenario: Container health check

- **WHEN** `/healthz` is requested
- **THEN** the web server responds 200 with `ok`
