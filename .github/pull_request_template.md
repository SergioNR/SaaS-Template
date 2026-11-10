## Description
<!-- What changes and why. Link the issue if there is one. -->

## Type of change
<!-- Pick a typed template for the full checklist when it fits: -->
<!-- Bug fix:     ?template=bug_fix_template.md -->
<!-- New feature: ?template=new_feature_template.md -->
<!-- Refactor:    ?template=refactor_template.md -->
<!-- (append `&template=<name>` to the "New pull request" URL) -->
- [ ] Bug fix
- [ ] New feature
- [ ] Refactor / chore
- [ ] Breaking change

## Checklist
- [ ] Commits follow Conventional Commits with a scope (`feat(frontend): ...`, `fix(auth): ...`, `feat(db)!: ...` for breaking changes)
- [ ] Behaviour changes carry an OpenSpec change (`openspec/changes/<name>/`) with its spec delta and ticked tasks; `openspec validate --specs --changes --strict` passes
- [ ] `prisma/schema.prisma` changes ship with a migration (`npx prisma migrate dev --name <change>`) and a `prisma/seed.js` update when models changed
- [ ] New environment variables are in the package's `.env.example` **and** README table
- [ ] `npm test` and `npx eslint .` pass in `backend/`; `npx eslint .`, `npm test` and `npm run build` pass in `frontend/` (the CI PR gate runs all of them)
- [ ] Anything touching the API is documented in the same PR: an `@openapi` block for new/changed routes, with their parameters, request bodies **and** response fields in the spec
- [ ] New non-trivial logic has a spec in `backend/tests/`
- [ ] No `.env` files, secrets or `backend/server/config/generated/` committed

## Notes for the reviewer
<!-- Anything that needs a closer look: migrations, security-sensitive paths, follow-ups. -->
