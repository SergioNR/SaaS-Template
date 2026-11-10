# OpenSpec

Behaviour specs for the template and the queue of open work. Rules for writing
artifacts live in `config.yaml`; workflow rules live in the root `AGENTS.md`.

- `specs/<capability>/spec.md` — system of record for what the template does
  today. Capabilities: `auth`, `account`, `team-management`, `billing`,
  `admin`, `files`, `api-hardening`, `observability`, `background-jobs`,
  `app-shell`, `public-site`.
- `changes/<name>/` — open work, each with `proposal.md` (why/what/impact),
  optional `design.md` (decision + open questions), `tasks.md` and spec
  deltas. Changes marked `skip_specs: true` in `.openspec.yaml` are
  no-behaviour work (ops, dependencies, migrations).
- `changes/archive/` — applied changes, kept as decision history.

## Picking up work

```bash
npx @fission-ai/openspec@1.16.0 list                   # open changes + task progress
npx @fission-ai/openspec@1.16.0 show <change>          # proposal, tasks and deltas
npx @fission-ai/openspec@1.16.0 validate --specs --changes --strict
```

Then `/opsx:apply <change>` (Claude Code) or `/opsx-apply <change>` (Kilo),
tick tasks as they land, ship the spec delta in the same PR as the code, and
`/opsx:archive <change>` after merge.

## Suggested order

Changes that touch the same requirement say so in their proposal — whichever
archives second rebases its delta onto the updated spec.

| Step | Change | Why here |
| --- | --- | --- |
| 1 | `enable-ci-and-first-verification` | Re-enables the PR gate and runs the never-executed images, compose stacks and migrations — everything else relies on CI |
| 2 | `restrict-validator-field-locations` | Live 500 / credentials-in-URL bug; base for `filterable-admin-lists` |
| 3 | `fix-access-log-request-id`, `include-error-code-in-alerts`, `harden-process-lifecycle` | Make production incidents diagnosable |
| 4 | `share-cron-alert-state-across-replicas` | Needs a migration — before `squash-migrations` |
| 5 | `fix-auth-registration-gaps` → `retire-legacy-password-route` → `add-email-verification` | Same `auth` requirements; this order is what the deltas assume |
| 6 | `tighten-team-invite-rules`, `allow-owner-demotion` | Team rules |
| 7 | `clarify-subscription-paid-state` → `show-billing-load-errors` | Breaking `is_paid` change first; the billing UI builds on it |
| 8 | `harden-remaining-forms`, `fix-session-cache-invalidation-gaps`, `fix-canonical-url-joining` | Small frontend fixes |
| 9 | `consent-controls-everywhere`, `superadmin-self-service` | Both edit the private navigation shell — merge the second onto the first |
| 10 | `distributed-rate-limits`, `add-telegram-business-events` | New capabilities for multi-replica / ops |
| 11 | `squash-migrations` | After every change that adds a migration has landed |
| 12 | `upgrade-held-dependencies` | When the held releases clear the 7-day cooldown / gain peer support |
| — | `filterable-admin-lists` (optional), `replace-template-placeholders` (per fork) | Whenever needed |
