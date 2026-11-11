# account Specification

## Purpose
Owns what an authenticated user can do with their own account under `/api/v1/user`: reading their profile, changing their password (`PATCH /api/v1/user/password`), and deleting their account with its company-level consequences (last-owner and last-superadmin guards, company teardown when the last member leaves). It also owns the SPA profile page that drives these actions. Login, logout, password reset and session mechanics belong to `auth`; Stripe teardown details belong to `billing`; removal of other members belongs to `team-management`.

## Requirements

### Requirement: Account routes require an authenticated user

The system SHALL answer 401 with `{}` to every `/api/v1/user` route when the request has no valid session, and SHALL admit both platform roles (`user` and `superadmin`). Paths under `/api/v1/user` that match no route SHALL respond 404 with a JSON `message`.

#### Scenario: No session

- **WHEN** an unauthenticated client calls `GET /api/v1/user`
- **THEN** the API responds 401 with `{}`

#### Scenario: Unknown account path

- **WHEN** an authenticated client calls `GET /api/v1/user/unknown`
- **THEN** the API responds 404 with a `message`

### Requirement: Read own profile

The system SHALL expose `GET /api/v1/user`, responding 200 with `{ "user": { ... } }` holding the caller's account fields (`id`, `email`, platform `role`, `company_id`, `created_at`, `last_updated_at`, `last_login_at`) and never the password hash. If the account no longer exists it SHALL respond 404 with `{}`.

#### Scenario: Profile returned

- **WHEN** an authenticated user requests their profile
- **THEN** the API responds 200 with their account fields and no password field

### Requirement: Change own password

The system SHALL expose `PATCH /api/v1/user/password` with `currentPassword` and `newPassword`. When the current password matches and differs from the new one, it SHALL store the new password and respond 200 with `{ "userId": "<uuid>" }`.

#### Scenario: Password changed

- **WHEN** a user submits the correct current password and a different, policy-compliant new password
- **THEN** the API responds 200 with their `userId` and the new password works for the next login

### Requirement: Password change input validation

The system SHALL require `currentPassword` to be a non-empty string of at most 128 characters and `newPassword` to satisfy the password strength policy defined in `auth`; otherwise it SHALL respond 422 with an `errors` array whose credential values are redacted.

#### Scenario: Weak new password

- **WHEN** `newPassword` has no digit
- **THEN** the API responds 422 and the password is unchanged

### Requirement: Password change rejections carry stable codes

The system SHALL respond 400 with `code: "AUTH_CURRENT_PASSWORD_INCORRECT"` when `currentPassword` does not match the stored password, and 400 with `code: "AUTH_PASSWORD_UNCHANGED"` when the new password equals the current one. The current-password check SHALL run first.

#### Scenario: Wrong current password

- **WHEN** `currentPassword` is incorrect
- **THEN** the API responds 400 with `code: "AUTH_CURRENT_PASSWORD_INCORRECT"` and nothing changes

#### Scenario: Same password

- **WHEN** `currentPassword` is correct and `newPassword` is identical to it
- **THEN** the API responds 400 with `code: "AUTH_PASSWORD_UNCHANGED"`

### Requirement: Password change revokes other sessions and reset links

The system SHALL, in the same transaction as the password write, delete every outstanding password-reset token of the user and revoke every session of the user except the one making the request. A failure of any step SHALL leave the password unchanged and surface as a server error.

#### Scenario: Other devices are logged out

- **WHEN** a user logged in on two devices changes their password from one of them
- **THEN** the requesting session stays valid and the other device's next request is unauthenticated

#### Scenario: Pending reset link dies

- **WHEN** a user with an unused password-reset link changes their password
- **THEN** that reset link no longer validates

### Requirement: Delete own account

The system SHALL expose `DELETE /api/v1/user`. On success it SHALL delete the user (with their company role and reset-token rows), revoke all of their sessions, delete every team invite they issued, destroy the current session, clear the `app.sid` cookie and respond 200 with `{}`. Deletion and its guards SHALL run in one transaction serialized with the company's other membership changes.

#### Scenario: Member leaves a company with other members

- **WHEN** a `company_member` of a company with other members deletes their account
- **THEN** the API responds 200 with `{}`, the cookie is cleared and the company and its remaining members are untouched

#### Scenario: Invites issued by the deleted user die

- **WHEN** an admin with pending invites they issued deletes their account
- **THEN** those invites are deleted in the same transaction

### Requirement: Last company owner cannot leave a populated company

The system SHALL refuse to delete a user who is the only `company_owner` of a company that still has other members, responding 409 with `code: "USER_LAST_COMPANY_OWNER"` and deleting nothing.

#### Scenario: Sole owner with team

- **WHEN** the only owner of a company with two other members deletes their account
- **THEN** the API responds 409 with `code: "USER_LAST_COMPANY_OWNER"` and nothing is deleted

#### Scenario: One of two owners leaves

- **WHEN** one of two owners deletes their account
- **THEN** the deletion succeeds

### Requirement: Last member deletion removes the company

When the deleted user is the last member of their company, the system SHALL also delete, in the same transaction, the company's subscription row, all of its team invites, its file records and the company itself. After the commit it SHALL tear down the company's Stripe billing (see `billing`) and delete its stored file objects, best-effort, without changing the response.

#### Scenario: Sole member deletes their account

- **WHEN** the only member (and owner) of a company deletes their account
- **THEN** the API responds 200, the company, subscription, invites and file records are gone, and Stripe teardown and storage cleanup run afterwards

#### Scenario: Provider outage after commit

- **WHEN** Stripe or object storage fails during the post-commit cleanup
- **THEN** the failure is logged and the API still responds 200

### Requirement: Last superadmin cannot delete themselves

For a superadmin (who belongs to no company) the system SHALL refuse the deletion with 409 and `code: "LAST_SUPERADMIN"` when they are the only superadmin, and SHALL serialize concurrent superadmin deletions so two of the last two cannot both succeed. No company cleanup SHALL run for a superadmin deletion.

#### Scenario: Only superadmin

- **WHEN** the platform's only superadmin calls `DELETE /api/v1/user`
- **THEN** the API responds 409 with `code: "LAST_SUPERADMIN"` and the account remains

#### Scenario: Two superadmins delete themselves concurrently

- **WHEN** the last two superadmins delete their own accounts at the same time
- **THEN** exactly one deletion succeeds and the other responds 409 with `code: "LAST_SUPERADMIN"`

### Requirement: Deletion conflicts and races

The system SHALL respond 404 with `{}` when the account no longer exists at deletion time (for example, removed concurrently), and 409 with a `message` when related records prevent the delete; in both cases nothing SHALL be deleted.

#### Scenario: Concurrent removal

- **WHEN** a member is removed by an admin while their own deletion request waits for the company lock
- **THEN** the self-deletion responds 404

### Requirement: Profile page password form

The SPA's profile page SHALL offer a password-change form (with a hidden username field set to the user's email for password managers) that resets the form and shows a success notice on 200; shows specific messages for `AUTH_CURRENT_PASSWORD_INCORRECT` and `AUTH_PASSWORD_UNCHANGED`, an invalid-input message for other 400/422 responses and a generic message otherwise; and on 401 shows no error, leaving the SPA-wide 401 handling to reset session caches and navigate to login with a safe `next`.

#### Scenario: Wrong current password in the UI

- **WHEN** the API answers 400 with `code: "AUTH_CURRENT_PASSWORD_INCORRECT"`
- **THEN** the form shows the incorrect-current-password message

#### Scenario: Session expired while on the form

- **WHEN** the password change responds 401
- **THEN** the SPA navigates to `/auth/login?next=%2Fuser%2Fprofile`

### Requirement: Profile page account deletion

The SPA SHALL require confirmation in a dialog that cannot be dismissed while the request is in flight. On 200 it SHALL reset session caches, clear the analytics identity, show a notice and navigate to `/` replacing history. On 409 with `USER_LAST_COMPANY_OWNER` it SHALL show a specific message; on any other failure a generic error; in both cases the dialog closes and the user stays signed in.

#### Scenario: Last owner tries to leave

- **WHEN** the deletion responds 409 with `code: "USER_LAST_COMPANY_OWNER"`
- **THEN** the SPA shows the last-owner message and the user remains on the profile page

#### Scenario: Account deleted

- **WHEN** the deletion responds 200
- **THEN** the user lands on the public home page with client caches cleared
