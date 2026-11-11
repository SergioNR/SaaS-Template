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
tick tasks as they land, and finish the PR with `/opsx:archive <change>` so the
spec update merges together with the code.

## Open work

Every change from the 2026-11-10 baseline is applied and archived except the
two below. Both are blocked on things outside the repository, not on code.

| Change | Waiting on |
| --- | --- |
| `enable-ci-and-first-verification` | A repo admin (re-enable the workflow, Actions variables, `next` environment, branch protection), Docker and a copy of real data, Brevo dashboard access, and the manual checks the applied changes could not run (task groups 6-7) |
| `upgrade-held-dependencies` | Dates and upstream releases - the unblock date of each group is in its proposal; swagger-jsdoc is already replaced |

New work starts with `/opsx:propose`. Changes that touch the same requirement
say so in their proposal - whichever archives second rebases its delta onto the
updated spec.

## History

`changes/archive/` holds the applied changes with their decisions
(`design.md`) and any task that needed infrastructure the implementer did not
have (marked "not run"; collected in `enable-ci-and-first-verification`).
Applied on 2026-11-10/11, in dependency order: validator field locations →
diagnosability (request-id access lines, error codes in alerts, process
lifecycle) → cron alert state across replicas → auth (registration gaps →
legacy password route retired → email verification) → team rules → billing
(`is_paid` → billing load errors) → frontend fixes and consent / superadmin
self-service → shared rate limits, Telegram business events, admin list
filters → migration squash.

Forks: the per-fork placeholder work is the root README "Forking checklist", not an open change.
