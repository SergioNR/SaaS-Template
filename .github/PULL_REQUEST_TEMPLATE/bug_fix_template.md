## Description
<!-- Please include a summary of the change and which issue is fixed. -->
<!-- Please also include relevant motivation and context. -->

## Types of Changes
<!-- What types of changes does your code introduce? Put an `x` in all the boxes that apply: -->
- [X] Bug fix (non-breaking change which fixes an issue)
- [ ] New feature (non-breaking change which adds functionality)
- [ ] Breaking change (fix or feature that would cause existing functionality to change)

## Related issue
<!-- Please link any related issues here. -->

## Explanation of changes/Implementation
<!-- Describe any significant changes to the codebase. Include any relevant code snippets or screenshots. -->

## Screenshots (if applicable)
<!-- Add any screenshots that might help explain the issue or the fix. -->

## Pull Request Checklist
<!-- Go over all the following points, and put an `x` in all the boxes that apply. -->
- [ ] My code follows the code style of this project.
- [ ] My change requires a change to the documentation.
- [ ] I have updated the documentation accordingly.
- [ ] I have added tests to cover my changes.
- [ ] All new and existing tests passed.
- [ ] Documentation update (if applicable)

## Repo rules
<!-- See AGENTS.md - the CI PR gate must pass before merging -->
- [ ] Commits follow Conventional Commits with a scope (`feat(frontend): ...`, `fix(auth): ...`, `feat(db)!: ...` for breaking changes)
- [ ] `prisma/schema.prisma` changes ship with a migration (`npx prisma migrate dev --name <change>`) and a `prisma/seed.js` update when models changed
- [ ] New environment variables are in the package's `.env.example` **and** README table
- [ ] `npm test` and `npx eslint .` pass in `backend/`; `npx eslint .`, `npm test` and `npm run build` pass in `frontend/` (the CI PR gate runs all of them)
- [ ] Anything touching the API is documented in the same PR: an `@openapi` block for new/changed routes, with their parameters, request bodies **and** response fields in the spec
- [ ] New non-trivial logic has a spec in `backend/tests/`
- [ ] No `.env` files, secrets or `backend/server/config/generated/` committed

## Additional Notes
<!-- Add any other context about the problem here. -->
