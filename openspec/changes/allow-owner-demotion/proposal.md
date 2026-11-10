# Proposal

## Why

Managing a member requires the caller to **strictly outrank** every role the member holds (`outranksAllRoles`, `backend/server/utils/companyRoleHierarchy.js:41-49`). `company_owner` is the top rank (3), so nobody can ever demote or remove an owner through the team API - not even another owner. Once a company has two owners (an owner may promote an admin to owner), the second owner is permanent: a departed co-founder or a mistakenly promoted employee can only be removed by a platform superadmin or by deleting their own account.

The code already carries last-owner protection for this case, but it is unreachable through the team API: `removeTeamMember` maps `last_owner` to 409 (`backend/server/controllers/teamController.js:342`), `updateTeamMemberRole` does the same (`teamController.js:420`), and `updateCompanyMemberRoleInDb` counts owners under the company lock (`backend/server/models/userModel.js:729-735`) - all behind a rank check that already rejected the request with 403.

## What Changes

- A `company_owner` may change the role of, or remove, **another** `company_owner`, as long as at least one owner remains (the caller always remains, so the guard is a backstop for races).
- Every other rule stays: nobody manages themselves; admins still cannot manage admins or owners; members manage nobody; granting stays "at or below own rank".
- The team listing marks other owners `manageable: true` for an owner caller; the SPA needs no rank logic change (it already derives locks from `manageable`).
- Concurrent mutual demotion of the last two owners resolves safely: the company lock serializes them, and the second request sees its caller is no longer an owner (403).
- No new routes, env vars or migrations.

## Capabilities

### New Capabilities

<!-- none -->

### Modified Capabilities

- `team-management`: granting and managing rules, manageable hints, role-change rejections and member-removal rejections allow owner-on-owner management with the last-owner guard.

## Impact

- `backend/server/utils/companyRoleHierarchy.js` - replace (or complement) `outranksAllRoles` with `canManageMember(callerRoles, targetRoles)`: strictly outranks, **or** both hold `company_owner`.
- `backend/server/controllers/teamController.js` (listing `manageable`, `removeTeamMember`, `updateTeamMemberRole`) and `backend/server/models/userModel.js` (`deleteUserWithCompanyDataInDb` caller check ~l.524, `updateCompanyMemberRoleInDb` ~l.723) - use the new predicate.
- Tests: `tests/companyRoleHierarchy.spec.js`, `tests/teamController.spec.js`, `tests/userModel.spec.js` / `userDeletionModel.spec.js`.
- Frontend: `frontend/src/pages/user/teamLocks.js` comment (l.27-28) and the `team.locked.notOutranked` tooltip copy if it says "outrank"; optional confirmation copy when demoting or removing an owner (`Team.jsx`).
- `backend/AGENTS.md` / `frontend/AGENTS.md` if they restate the strict-outrank rule.

## Out of scope

- Admin-area deletion rules (superadmins already bypass company ranks; the admin last-owner guard is unchanged).
- Ownership transfer flows, owner-only confirmations by email, or a "primary owner" concept.
- Letting admins manage peers.
