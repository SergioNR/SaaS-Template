# team-management Specification

## Purpose
Owns company-scoped membership under `/api/v1/team`: the company role hierarchy and its permission model, the member and invite listing with the per-row `manageable` hints and the caller's permissions, member role changes, member removal, and the invite lifecycle on the inviting side (create, resend, revoke, expiry). It also owns the SPA team page and how it surfaces permission locks. Consuming an invite (check and accept) belongs to `auth`; a user deleting their own account belongs to `account`.

## Requirements

### Requirement: Company roles form a strict hierarchy

The system SHALL define exactly three company roles, ranked `company_owner` (3) above `company_admin` (2) above `company_member` (1). Each user belongs to at most one company and holds a single company role in it. Superadmins belong to no company and hold no company role.

#### Scenario: Registrant becomes owner

- **WHEN** a user self-registers
- **THEN** they hold `company_owner` in their new company

#### Scenario: Invited member

- **WHEN** a user accepts an invite for `company_admin`
- **THEN** they hold exactly `company_admin` in the inviting company

### Requirement: Company permissions come only from company roles

The system SHALL grant company permissions solely through the caller's company role: `company_owner` holds `team.view`, `team.invite`, `team.remove`, `team.manage_roles` and `billing.manage`; `company_admin` holds `team.view`, `team.invite`, `team.remove` and `team.manage_roles`; `company_member` holds `team.view`. The platform `superadmin` role SHALL grant no company permission. (File permissions belong to the file-storage capability.)

#### Scenario: Admin lacks billing

- **WHEN** a `company_admin` checks their permissions
- **THEN** `billing.manage` is not among them

#### Scenario: Member cannot invite

- **WHEN** a `company_member` calls `POST /api/v1/team/invites`
- **THEN** the API responds 403 with a `message`

### Requirement: Granting and managing rules

The system SHALL let a caller grant a role (invite to it, assign it, resend or revoke an invite for it) only when the role ranks at or below the caller's own. It SHALL let a caller manage an existing member (change their role, remove them) only when the caller strictly outranks every role the member holds and the member is not the caller. Consequently no one can demote or remove a `company_owner` through the team API, and peers cannot manage each other.

#### Scenario: Admin invites an admin

- **WHEN** a `company_admin` invites someone as `company_admin`
- **THEN** the invite is created

#### Scenario: Admin cannot touch another admin

- **WHEN** a `company_admin` tries to remove or re-role another `company_admin`
- **THEN** the API responds 403 with a `message`

#### Scenario: Owner cannot demote another owner

- **WHEN** an owner tries to change another owner's role
- **THEN** the API responds 403 with a `message`

### Requirement: Team route gates

Every `/api/v1/team` route SHALL require an authenticated session (401 `{}`), a platform role of `user` or `superadmin` (403 `{}` otherwise), company membership (403 with `code: "COMPANY_MEMBERSHIP_REQUIRED"` for users without a company) and the route's company permission (403 with a `message`). Malformed `inviteId`/`userId` path parameters (not UUIDs) SHALL respond 422; unknown paths SHALL respond 404 with a `message`.

#### Scenario: Superadmin without company

- **WHEN** a superadmin calls `GET /api/v1/team`
- **THEN** the API responds 403 with `code: "COMPANY_MEMBERSHIP_REQUIRED"`

#### Scenario: Bad member id

- **WHEN** `DELETE /api/v1/team/members/not-a-uuid` is called
- **THEN** the API responds 422

### Requirement: Team listing

The system SHALL expose `GET /api/v1/team` (requires `team.view`) responding 200 with `callerId`, `members` (each `id`, `email`, platform `role`, `created_at`, `companyRoles`, `manageable`, newest first), `invites` (each `id`, `email`, `role`, `token_expires`, `created_at`, `manageable`, newest first), `callerPermissions` and `assignableRoles`. Only the caller's company SHALL be listed and token digests SHALL never appear.

#### Scenario: Member views the team

- **WHEN** a `company_member` calls `GET /api/v1/team`
- **THEN** the API responds 200 with their company's members and pending invites and `callerPermissions` equal to `["team.view"]`

### Requirement: Listing exposes only pending invites

The system SHALL list only invites whose expiry is in the future; expired invites SHALL not appear in the listing, SHALL not block a new invite for the same email and SHALL be purged by a scheduled cleanup.

#### Scenario: Invite expired

- **WHEN** an invite passes its expiry
- **THEN** it disappears from `GET /api/v1/team` and a new invite for that email can be created

### Requirement: Manageable hints and assignable roles

The listing SHALL mark a member `manageable: true` only when the caller strictly outranks every role the member holds and the member is not the caller, mark an invite `manageable: true` when the caller can grant its role, and return as `assignableRoles` the sorted roles at or below the caller's rank. These are hints only; every write endpoint SHALL re-check the rules.

#### Scenario: Owner's view

- **WHEN** an owner lists a team with an admin, a member and another owner
- **THEN** the admin and member are `manageable: true`, the other owner and the caller are `manageable: false`, and `assignableRoles` is all three roles

#### Scenario: Admin's view

- **WHEN** an admin lists the team
- **THEN** `assignableRoles` is `["company_admin", "company_member"]`

### Requirement: Change a member's role

The system SHALL expose `PATCH /api/v1/team/members/:userId` (requires `team.manage_roles`) with `roleName`. When allowed it SHALL replace the member's single company role and respond 200 with `{ "member": { "id", "email", "role", "created_at", "companyRoles" } }`.

#### Scenario: Owner promotes a member to admin

- **WHEN** an owner sets a member's `roleName` to `company_admin`
- **THEN** the API responds 200 and the member's `companyRoles` is `["company_admin"]`

#### Scenario: Owner promotes an admin to owner

- **WHEN** an owner sets an admin's role to `company_owner`
- **THEN** the API responds 200 and the company now has two owners

### Requirement: Role change rejections

The system SHALL reject a role change with: 422 when `roleName` is not one of the three company roles; 409 with a `message` when the target is the caller; 404 with a `message` when the target is not in the caller's company or the role row is missing; 403 with a `message` when the caller cannot grant the new role or does not outrank the target; 409 with a `message` when it would leave the company without an owner.

#### Scenario: Bogus role

- **WHEN** `roleName` is `superadmin`
- **THEN** the API responds 422

#### Scenario: Own role

- **WHEN** a caller tries to change their own role
- **THEN** the API responds 409

#### Scenario: Member of another company

- **WHEN** the `userId` belongs to a different company
- **THEN** the API responds 404

### Requirement: Role checks are race-safe

The system SHALL re-read the caller's and target's roles inside a transaction serialized with all other membership changes of the company, and SHALL answer 404 when the target left meanwhile and 403 when the caller lost the rank meanwhile, instead of applying a stale decision.

#### Scenario: Caller demoted concurrently

- **WHEN** an admin's role change races with the owner demoting that admin
- **THEN** whichever commits second sees the committed roles, and an admin who is no longer allowed receives 403

### Requirement: Demotion voids invites above the new rank

When a member's role changes, the system SHALL delete, in the same transaction, the pending invites that member issued for roles the new role can no longer grant.

#### Scenario: Admin demoted to member

- **WHEN** an owner demotes an admin who had issued `company_admin` and `company_member` invites
- **THEN** the admin-role invites are deleted and the member-role invites remain

### Requirement: Remove a member

The system SHALL expose `DELETE /api/v1/team/members/:userId` (requires `team.remove`). Removal SHALL delete the member's user account entirely (their sessions are revoked and the invites they issued are deleted) and respond 200 with `{ "userId": "<uuid>" }`. The caller always remains, so removal never deletes the company.

#### Scenario: Admin removes a member

- **WHEN** an admin removes a `company_member` of their company
- **THEN** the API responds 200 with the `userId` and the removed user can no longer log in

### Requirement: Member removal rejections and races

The system SHALL reject a removal with 409 and a `message` when the target is the caller, 404 when the target is not in the caller's company, 403 when the caller does not strictly outrank the target, and 409 when it would remove the last owner. The checks SHALL be repeated under the company lock together with the delete, so a concurrent removal of the same member resolves to 404 rather than an error.

#### Scenario: Remove yourself

- **WHEN** a caller targets their own user id
- **THEN** the API responds 409 and points to account deletion instead

#### Scenario: Double removal

- **WHEN** two admins remove the same member concurrently
- **THEN** one responds 200 and the other 404

### Requirement: Create an invite

The system SHALL expose `POST /api/v1/team/invites` (requires `team.invite`) with `email` (normalized, 3-254 characters) and `roleName` (one of the three company roles, else 422). It SHALL store the invite with a 7-day expiry and the caller as inviter, replacing any expired invite for the same company and email, and respond 201 with `{ "invite": { "id", "email", "role", "token_expires", "created_at" } }`.

#### Scenario: Invite created

- **WHEN** an owner invites a new address as `company_member`
- **THEN** the API responds 201 with the invite and it appears in the team listing

### Requirement: Invite creation rejections

The system SHALL check invite creation in this order: 403 with a `message` when the caller cannot grant the role, then 404 when the role row is missing, then 409 with a `message` when an unexpired invite already exists for that company and email (also when a concurrent create wins), so a caller without authority over the role never learns whether such an invite exists.

#### Scenario: Duplicate pending invite

- **WHEN** an invite is created for an email that already has a pending invite in the company
- **THEN** the API responds 409

#### Scenario: Admin invites an owner

- **WHEN** a `company_admin` invites someone as `company_owner`
- **THEN** the API responds 403

#### Scenario: Unauthorised duplicate

- **WHEN** a `company_admin` invites as `company_owner` an email that already has a pending owner invite
- **THEN** the API responds 403, not 409

### Requirement: Invite delivery does not reveal accounts

The system SHALL respond to invite creation and resend identically whether or not the invited email already has an account, storing the row in both cases. Delivery SHALL run detached after the response: an email with the invite token, company name and inviter email is sent unless a verified account exists for the address; delivery failures are only logged.

#### Scenario: Already-registered address

- **WHEN** an owner invites an email that already has a verified account
- **THEN** the API responds 201, the invite is listed as pending, and no email is sent

#### Scenario: Unverified holder of the address

- **WHEN** an owner invites an email held only by an unverified account
- **THEN** the invite email is sent, so the mailbox owner can accept it

### Requirement: Invite tokens are secret

The system SHALL generate each invite token as a random 256-bit value (43 base64url characters), persist only its SHA-256 digest, and deliver the raw token only inside the invite email; no API response SHALL contain a token or its digest.

#### Scenario: Listing hides tokens

- **WHEN** the team listing or an invite create/resend response is returned
- **THEN** it contains no token and no token digest

### Requirement: Resend an invite

The system SHALL expose `POST /api/v1/team/invites/:inviteId/resend` (requires `team.invite`) for pending invites only. It SHALL atomically rotate the token (the previous link stops working) only while the invite is still unexpired, reset the expiry to 7 days from now, keep the invite id and original inviter, re-run detached delivery, and respond 200 with the invite.

#### Scenario: Resend

- **WHEN** an owner resends a pending invite
- **THEN** the API responds 200 with a later `token_expires` and the old emailed link no longer validates

#### Scenario: Expired invite not revived

- **WHEN** an owner resends an invite whose expiry has passed but which has not been purged yet
- **THEN** the API responds 404, the expiry is unchanged and no email is sent

### Requirement: Resend rejections

The system SHALL reject a resend with 404 when the invite does not belong to the caller's company, has expired, or disappears or expires during the rotation; 403 when the caller cannot grant its role; 409 with `code: "INVITER_INVALID"` when the original inviter left the company or can no longer grant the role; and 409 with a `message` when the rotation conflicts and should be retried.

#### Scenario: Original inviter gone

- **WHEN** the admin who issued an invite was removed and an owner resends it
- **THEN** the API responds 409 with `code: "INVITER_INVALID"`

#### Scenario: Expires during rotation

- **WHEN** an invite passes its expiry between the lookup and the token rotation
- **THEN** the API responds 404 and the invite is not rotated

### Requirement: Revoke an invite

The system SHALL expose `DELETE /api/v1/team/invites/:inviteId` (requires `team.invite`), deleting a pending invite and responding 200 with `{}`; it SHALL respond 404 when the invite is not in the caller's company or has expired, and 403 when the caller cannot grant its role.

#### Scenario: Admin revokes an owner invite

- **WHEN** a `company_admin` revokes an invite for `company_owner`
- **THEN** the API responds 403 and the invite remains

#### Scenario: Expired invite

- **WHEN** an owner revokes an invite whose expiry has passed but which has not been purged yet
- **THEN** the API responds 404 and the row is left for the nightly purge

### Requirement: Invites die with their inviter

The system SHALL delete every invite a user issued when that user is deleted, and SHALL refuse acceptance of any invite whose inviter is no longer a member able to grant the invited role (see `auth`).

#### Scenario: Inviter removed

- **WHEN** a member who issued pending invites is removed from the company
- **THEN** those invites disappear from the listing

### Requirement: Team page shows members, invites and locks

The SPA's team page SHALL list members (email, role badges, join date) and pending invites (email, role, expiry), offer a retry on load failure, and show a dedicated message without retry on 403 `COMPANY_MEMBERSHIP_REQUIRED`. It SHALL keep the previous table while refreshing after a mutation and block duplicate actions on a row while one is in flight.

#### Scenario: Load fails

- **WHEN** `GET /api/v1/team` fails with a server error
- **THEN** the page shows an error with a retry action

### Requirement: Team page permission locks

The SPA SHALL derive controls only from `callerPermissions`, `callerId`, `assignableRoles` and the `manageable` flags, never from its own rank logic. A disabled control SHALL show a tooltip explaining the missing permission, self-row, rank or unassignable role. The invite button SHALL stay disabled without a tooltip until permissions are known.

#### Scenario: Member's view

- **WHEN** a `company_member` opens the team page
- **THEN** the invite button, role selectors and remove buttons are disabled with permission tooltips

#### Scenario: Owner row seen by an admin

- **WHEN** an admin views an owner's row
- **THEN** its role selector and remove button are locked with a rank explanation

### Requirement: Team page mutation feedback

The SPA SHALL show success notices and reload after invite, resend, revoke, role change and removal. On failure it SHALL show a conflict message for 409 (distinguishing resend `INVITER_INVALID` from a retryable conflict), a permission message for 403 and a generic message otherwise. The invite form SHALL require a role before submitting.

#### Scenario: Resend with dead inviter

- **WHEN** a resend responds 409 with `code: "INVITER_INVALID"`
- **THEN** the page tells the user to revoke the invite and send a new one

### Requirement: Session-scoped permission cache

The SPA SHALL fetch the caller's company permissions at most once per session (from `GET /api/v1/team`), share them with other pages such as billing, refresh them from every team-page load, discard them on login, logout, account deletion and session expiry, and treat a failed fetch as unknown so controls are not locked by mistake.

#### Scenario: Permissions unavailable

- **WHEN** the permission fetch fails
- **THEN** pages leave their actions enabled and rely on the API's 403
