# Design

## Context

Two of the held items need a choice rather than a version bump: what replaces `swagger-jsdoc`, and how the frontend gets to ESLint 10 while `eslint-plugin-react` caps its peer range at `^9.7`.

## Decisions

### Replacing `swagger-jsdoc`

The backend builds its OpenAPI document from `@openapi` JSDoc blocks in the routers (`server/config/swagger.js`), served only on local development (`api-hardening`: "API documentation only on local development") and checked by `tests/openapiCoverage.spec.js`.

- **A. Maintained JSDoc→OpenAPI generator with the same comment format (recommended to evaluate first).** Smallest diff; keeps docs next to routes. Must be verified: maintenance activity, ESM support, no vulnerable transitive `glob`.
- B. Thin in-repo extractor: read the router files listed explicitly in `swagger.js`, parse `@openapi` blocks with a YAML parser (`js-yaml`, today only a dev-transitive dependency — it would become a direct one), merge into the base definition. ~50 lines, no glob dependency; we own the code.
- C. Static `openapi.yaml` (or JS object) next to the routers. Removes comment parsing but separates docs from routes — drift risk, mitigated only by the coverage spec.

Acceptance for any option: the generated document is deep-equal to today's (snapshot it before switching).

### Frontend ESLint 10

- **A. Wait for an `eslint-plugin-react` release that supports ESLint 10 (recommended while it is close).** No config churn.
- B. Replace with a maintained React lint plugin that supports flat config and ESLint 10. Its rule set differs (no `react/prop-types` equivalent may exist) — then drop `prop-types` and all `propTypes` declarations, and update `frontend/AGENTS.md`.
- C. Drop `eslint-plugin-react`, keep `react-hooks` + `react-refresh`. Loses JSX-specific rules; same `prop-types` consequence as B.

## Open questions

- Is there a deadline (security advisory, Node 26 support) that forces option B/C for ESLint before the plugin releases?
- Does Prisma 8 GA change the driver-adapter setup enough to warrant its own change (it touches `prismaClient.js`, seed and tests)?
