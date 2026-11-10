# Tasks

## 1. Pending-only resend and revoke

- [x] 1.1 `backend/server/models/teamInvitesModel.js`: lookup by id for resend/revoke filters on `pendingInviteWhere()`; `rotateTeamInviteTokenInDb` adds `token_expires: { gt: new Date() }` to its `where`; verify model spec asserts both `where` clauses and that P2025 still resolves to null
- [x] 1.2 `tests/teamController.spec.js`: resend of an expired invite → 404 and no rotation, no delivery; revoke of an expired invite → 404 and no delete; invite expiring between lookup and rotation (rotation returns null) → 404

## 2. Creation order

- [x] 2.1 Reorder `createTeamInvite` in `backend/server/controllers/teamController.js` to 403 → 404 → 409; verify specs: admin inviting as owner with a pending owner invite for the same email → 403 (not 409) and the pending lookup is never called; owner duplicate → 409; concurrent P2002 → 409 unchanged

## 3. Frontend check

- [x] 3.1 (it showed the generic error and kept the stale row - added a 404 branch with `team.errors.inviteGone` + listing reload) Confirm the team page maps a 404 from resend/revoke to a sensible notice and reloads the listing (`frontend/src/pages/user/Team.jsx`); if it shows a misleading message, add a 404 branch; verify `npm test` in `frontend/`

## 4. Docs and validation

- [x] 4.1 Update `backend/AGENTS.md` if it mentions resending expired invites
- [x] 4.2 Run `npm test` and `npx eslint .` in `backend/`; both clean
- [x] 4.3 `npx -y @fission-ai/openspec@1.16.0 validate tighten-team-invite-rules --strict` passes
