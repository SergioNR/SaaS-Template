# Proposal

## Why

Two inconsistencies in the inviting side of team management:

1. **Expired invites can be revived or revoked.** Expired invites are hidden from the listing and never block a new invite (`pendingInviteWhere` in `backend/server/models/teamInvitesModel.js`), but `getTeamInviteByIdInDb` (`teamInvitesModel.js:120-137`) has no expiry filter and `rotateTeamInviteTokenInDb` (`teamInvitesModel.js:79-104`) updates by id only. Anyone holding a stale invite id (an old SPA tab, a script) can resend an expired invite - silently resurrecting it with a fresh 7-day window and the **original** inviter - or revoke it, until the nightly purge. The spec even says such invites "MAY be resent", which contradicts "Listing exposes only pending invites".
2. **Invite creation answers before authorization.** `createTeamInvite` (`backend/server/controllers/teamController.js:112-145`) checks for a pending invite (409) and then the role row (404) before the caller's rank (403). A `company_admin` trying to invite as `company_owner` gets 409 when an owner invite for that email is pending and 403 otherwise, so the outcome reveals state the caller is not authorised to act on. (Severity is low - pending invites are visible in `GET /api/v1/team` to every `team.view` holder - but the response for an unauthorised request should depend only on the caller's authority.)

## What Changes

- Resend and revoke act only on **pending** (unexpired) invites; an expired-but-unpurged invite answers **404** exactly like a purged one. The token rotation itself also requires the invite to still be unexpired, so an invite expiring between lookup and rotation answers 404.
- To re-invite after expiry, the caller creates a new invite (already allowed: expired rows are replaced on create), which records the caller as the inviter.
- Invite creation checks in this order: caller can grant the role (403) → role row exists (404) → no pending invite (409). The concurrent-create 409 race is unchanged.
- No new routes, env vars or migrations.

## Capabilities

### New Capabilities

<!-- none -->

### Modified Capabilities

- `team-management`: invite creation rejection order; resend and revoke limited to pending invites.

## Impact

- `backend/server/models/teamInvitesModel.js` - `getTeamInviteByIdInDb` gains `...pendingInviteWhere()` (or a `getPendingTeamInviteByIdInDb` variant); `rotateTeamInviteTokenInDb` `where` gains `token_expires: { gt: now }` (P2025 → null → 404); `deleteTeamInviteInDb` stays by id (used after the pending lookup).
- `backend/server/controllers/teamController.js` - reorder `createTeamInvite`; no change to resend/revoke status mapping beyond the model filter.
- Tests: `tests/teamController.spec.js`, `tests/secureTokenModels.spec.js` (or the invite model spec).
- SPA: no change required - the listing never shows expired invites; a stale tab already handles 404 with the generic message (check).
- `backend/AGENTS.md` if it documents the resend-expired behaviour.

## Out of scope

- Changing the 7-day expiry or the nightly purge.
- Re-attributing a resent invite to the caller.
- Invite consumption (check/accept) - already rejects expired invites.
