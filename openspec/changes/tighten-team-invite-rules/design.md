# Design

## Context

Invites expire 7 days after issue (or last resend) and are purged nightly at 03:15. Between expiry and purge the row exists. The listing, the pending-duplicate check and acceptance all treat expired rows as gone; resend and revoke do not.

## Decisions

### Resend of an expired invite
Options:
1. **404, like a purged invite (recommended).** One rule everywhere: an expired invite does not exist for the inviting side. The caller creates a new invite, which replaces the expired row and is attributed to the caller (who is, by construction, allowed to grant the role) - a cleaner audit trail than resurrecting a row attributed to someone who may have since been demoted.
2. Treat a resend of an expired invite as a new invite (delete + create under the caller). Friendlier for a stale tab, but resend would then sometimes change the inviter and the invite id, which breaks the "resend keeps id and inviter" contract the SPA relies on for row identity.
3. Keep allowing it (status quo). Contradicts the listing rule; rejected.

### Revoke of an expired invite
Options: 404 (recommended, consistent with option 1) or idempotent 200. Revoking an expired invite is harmless, but answering 200 for something the caller cannot see in the listing is the same inconsistency in the other direction. The nightly purge removes the row anyway.

### Creation check order
403 (authority) first because it needs no lookups beyond the caller's own roles; then 404 (role row missing - a seed/config problem, not caller-controlled); then 409 (pending duplicate). `canGrantRole` works on role names, so the 403 can be decided before reading the role row.

## Risks / Trade-offs

- [A user with an old tab clicks resend on an invite that expired minutes ago] → gets 404 with the generic message and the next listing refresh drops the row; acceptable.

## Open questions for the implementer

- Should the 404 for an expired invite carry a distinct `code` (e.g. `INVITE_EXPIRED`) so the SPA can say "expired - send a new invite"? Recommended: no for revoke; optional for resend if the SPA wants a better message (then add it to the spec delta before archiving).

## Implementation decisions (resolved open questions)

- No distinct `code` on the expired-invite 404 (neither resend nor revoke): the 404 body is the generic "Invite does not exist". The SPA maps any 404 from resend/revoke to an "invite no longer pending - send a new one" notice and reloads the listing.
