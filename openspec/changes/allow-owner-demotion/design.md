# Design

## Context

Ranks: owner 3, admin 2, member 1. `canGrantRole` = role at or below the caller's; `outranksAllRoles` = every target role strictly below the caller's highest rank. Role changes and removals check both in the controller (early answer) and again in the model under `lockCompanyForUpdateInDb`, where the owner count is also checked (`countCompanyOwnersInTx`). Removal deletes the target's user account entirely (sessions, issued invites).

## Decisions

### Predicate: strict outrank, or owner-on-owner
`canManageMember(caller, target) = outranksAllRoles(caller, target) || (caller includes company_owner && target includes company_owner)`. Owners are the accountable tier; peer protection exists so admins cannot fight each other, which does not apply to the people who can already delete the company by leaving last. Admin-on-admin stays forbidden.

### Scope: demotion and removal, or demotion only?
Options:
1. **Both (recommended).** Consistent with how owners manage everyone else; one predicate everywhere; the listing hint stays a single boolean.
2. Demotion only; removal of an owner still forbidden. Safer against a rogue owner deleting a co-owner's account outright (removal deletes the user, not just the membership), but a rogue owner can demote then remove in two calls anyway, so the protection is cosmetic and costs a second predicate and a split `manageable` hint.

### Last-owner guard stays
The caller is always an owner who remains, so through the team API the guard only fires in races (e.g. the caller was demoted concurrently - which the under-lock caller re-check already turns into 403). Keep it: it is cheap and protects any future caller path.

### Mutual demotion race
Owners A and B demote each other at the same time. The company lock serializes them; the first commits; the second re-reads its caller's roles under the lock, finds the caller is now `company_admin`, and answers 403. The company keeps exactly one owner.

## Risks / Trade-offs

- [A malicious or compromised owner removes co-owners] → inherent to the owner role (they could already remove every admin and member); the audit trail records `team.member.removed` / `team.member.role_updated` with the actor.

## Open questions for the implementer

- Add a stronger SPA confirmation (typed confirmation) when the target is an owner? Recommended: a distinct confirmation message is enough.
- Should the API refuse demoting an owner whose account has the Stripe customer email? Recommended: no - billing contact is the company's, not the user's.
