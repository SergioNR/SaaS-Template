# Tasks

## 1. Rule

- [x] 1.1 Add `canManageMember(heldRoleNames, targetRoleNames)` to `backend/server/utils/companyRoleHierarchy.js` (strict outrank, or both hold `company_owner`) with a `//*` rationale comment; keep or remove `outranksAllRoles` depending on remaining callers (kept as the strict building block, no other callers); verify `tests/companyRoleHierarchy.spec.js`: owner→owner true, admin→admin false, admin→owner false, member→anyone false, unknown roles false

## 2. Apply everywhere

- [x] 2.1 `backend/server/controllers/teamController.js`: listing `manageable`, `removeTeamMember` and `updateTeamMemberRole` use `canManageMember`; update the 403 messages that say "ranks below your own"; verify `tests/teamController.spec.js` (owner demotes another owner → 200; owner removes another owner → 200; admin on owner → 403)
- [x] 2.2 `backend/server/models/userModel.js`: the under-lock caller checks in `deleteUserWithCompanyDataInDb` and `updateCompanyMemberRoleInDb` use `canManageMember`; verify model specs: two owners, owner demotes the other → updated; under-lock caller already demoted → `forbidden`; single owner path → `last_owner` still reachable when the caller check is bypassed (`callerId` absent)
- [x] 2.3 Verify the "Demotion voids invites above the new rank" behaviour also applies when an owner is demoted to admin (their `company_owner` invites die); add a model spec case

## 3. Frontend follow-up

- [x] 3.1 `frontend/src/pages/user/teamLocks.js`: update the rationale comment; check `teamLocks.test.js` still passes with an owner row `manageable: true`; adjust the `team.locked.notOutranked` i18n copy if it claims owners are untouchable
- [x] 3.2 (owner removal uses a distinct modal text; demoting an owner now opens a confirmation modal before the role change) `Team.jsx`: show a distinct confirmation text when demoting/removing a member holding `company_owner`; verify `npm test` and `npm run lint` in `frontend/`

## 4. Docs and validation

- [x] 4.1 Update any AGENTS.md rule restating "strictly outrank" (backend and frontend) to the new predicate
- [x] 4.2 Run `npm test` and `npx eslint .` in `backend/`; both clean
- [x] 4.3 `npx -y @fission-ai/openspec@1.16.0 validate allow-owner-demotion --strict` passes
