# auth Specification

## Purpose
Owns the credential and session lifecycle under `/api/v1/auth`: self-service registration with company onboarding, login and session establishment, the session check, logout, password reset (request, token check, completion), team-invite consumption (check and accept), the session cookie and session revocation, and the outcomes of the rate limits that guard these flows (the budgets themselves belong to `api-hardening`). It also owns the SPA behaviour tied to these flows: the login, registration, password-recovery, password-restore and invite-acceptance pages, and the post-login `next` redirect. The app-wide handling of `401` responses and the area session checks belong to `app-shell`. Profile reads, authenticated password changes and account deletion belong to `account`; creating and managing invites belongs to `team-management`.

## Requirements

### Requirement: Email normalization

The system SHALL normalize every email it receives in these flows before using it (lower-cased, with provider aliases such as Gmail dots, `googlemail.com` and `+` sub-addresses collapsed), and SHALL compare stored emails case-insensitively.

#### Scenario: Email aliases resolve to one account

- **WHEN** a user registered as `john.doe@gmail.com` logs in as `JohnDoe+work@googlemail.com`
- **THEN** both addresses normalize to the same account email

### Requirement: Password strength policy

Every password being set (registration, password reset, invite acceptance) SHALL be a string of 8 to 64 characters, at most 72 bytes in UTF-8, containing at least one lower-case letter, one upper-case letter and one digit; otherwise the API SHALL respond 422 and perform no write.

#### Scenario: Weak password rejected

- **WHEN** a registration, password-reset completion or invite acceptance carries a password without an upper-case letter
- **THEN** the API responds 422 and performs no write

#### Scenario: Multi-byte password over the byte ceiling

- **WHEN** a password of at most 64 characters encodes to more than 72 UTF-8 bytes
- **THEN** the API responds 422

### Requirement: Validation errors redact credentials

The system SHALL reject requests failing validation with 422 and `{ "errors": [...] }`, and SHALL replace the submitted value of every credential field (passwords, emails, usernames, tokens) in those errors with `[REDACTED]`.

#### Scenario: Sensitive values are redacted

- **WHEN** validation fails on a password, email or token field
- **THEN** the corresponding error entry carries `value: "[REDACTED]"` instead of the submitted value

### Requirement: Self-service registration creates a company and its owner

The system SHALL accept `POST /api/v1/auth/register` with `username` (email), `password` and a required `companyName` (2-100 characters after trimming). For an unregistered email it SHALL create in one write a named company, its trial subscription (see `billing`) and an unverified user with platform role `user` holding `company_owner`. Registration SHALL NOT log the user in; the account can log in only after verifying its email.

#### Scenario: New email registers

- **WHEN** a valid registration arrives for an email with no account
- **THEN** the API responds 201 with `{}` and, once the detached work completes, the user exists unverified as `company_owner` of a newly created company with a trial subscription

#### Scenario: Company name omitted

- **WHEN** a registration omits `companyName` or sends it empty
- **THEN** the API responds 422 and nothing is created

#### Scenario: Blocked email domain

- **WHEN** the email domain is `tempmail.com` or `throwaway.com` (after normalization, any letter case)
- **THEN** the API responds 422

#### Scenario: Invalid company name

- **WHEN** `companyName` is shorter than 2 or longer than 100 characters after trimming, or is not a string
- **THEN** the API responds 422

### Requirement: Registration is enumeration-safe

The system SHALL respond to registration with the same status, body and timing whether or not the email is already registered: the response SHALL be sent before any account-dependent work (lookup, password hashing, creation, email) runs. For an already-registered email it SHALL create nothing and SHALL send an existing-account notice to the stored address. Failures of the detached work SHALL only be logged.

#### Scenario: Already-registered email

- **WHEN** a valid registration arrives for an email that already has an account
- **THEN** the API responds 201 with `{}`, no user or company is created, and the stored address receives an existing-account notice

#### Scenario: Concurrent duplicate registrations

- **WHEN** two registrations for the same new email race past the existence check
- **THEN** exactly one account is created and both requests receive 201 with `{}`

### Requirement: Login establishes a server-side session

The system SHALL authenticate `POST /api/v1/auth/login` with `username` (email) and `password`. On success it SHALL establish a server-side session linked to the user, set the session cookie, record last-login time and analytics as fire-and-forget side effects, and respond 200 with `{ "user": { "id", "role" } }` (`role` is the platform role). Unknown emails and wrong passwords SHALL both respond 401 with `{}`.

#### Scenario: Valid credentials

- **WHEN** the email belongs to an account and the password matches
- **THEN** the API responds 200 with the user's `id` and platform `role` and the session cookie is set

#### Scenario: Wrong password or unknown email

- **WHEN** the password does not match, or no account has that email
- **THEN** the API responds 401 with `{}` and no session is established

#### Scenario: Session linkage fails

- **WHEN** the authenticated session cannot be linked to the user in the session store
- **THEN** the session is destroyed and the request fails as a server error, never as 200 or 401

### Requirement: Login input validation is uniform

The system SHALL reject malformed login input (non-string or invalid email, email over 254 characters, empty or non-string password, password over 128 characters) with 422, using the same generic invalid-credentials message for every field, before any account lookup.

#### Scenario: Oversized password

- **WHEN** a login password is longer than 128 characters
- **THEN** the API responds 422 and no password hashing runs

### Requirement: Login resists user enumeration by timing

The system SHALL perform a password-hash comparison against a constant dummy hash when the login email has no account, so a failed login for an unknown email costs the same as one for a wrong password.

#### Scenario: Unknown email

- **WHEN** a login is attempted for an email with no account
- **THEN** a full bcrypt comparison still runs before the 401 is returned

### Requirement: Login is throttled per IP and per account

The system SHALL reject login attempts with 429 and a JSON `message` once the per-IP authentication budget is exhausted, and SHALL additionally reject them with 429 once the failed-attempt budget for the pair (normalized email, client IP, with IPv6 addresses grouped by subnet) is exhausted. Only failed attempts SHALL count against the per-account budget; requests rejected by validation never reach it. Budgets are defined by `api-hardening`.

#### Scenario: Repeated wrong passwords for one account

- **WHEN** a client keeps sending wrong passwords for the same email from the same IP beyond the per-account budget
- **THEN** further login attempts for that email from that IP respond 429, even with the correct password, until the window resets

#### Scenario: Other sources are unaffected

- **WHEN** one IP has exhausted the per-account budget for an email
- **THEN** a login for the same email from a different IP is still evaluated normally

#### Scenario: Successful logins do not consume the per-account budget

- **WHEN** a user logs in successfully
- **THEN** the attempt is not counted against the per-account failed-attempt budget

### Requirement: Session cookie

The system SHALL keep sessions server-side and identify them with an `httpOnly` cookie named `app.sid`, issued only once a session holds data (no cookie for anonymous visitors). Outside local development the cookie SHALL be `Secure` with `SameSite=None`; on localhost it SHALL be non-secure with `SameSite=Lax`. The cookie and its stored session row SHALL both carry a 24-hour lifetime, and every response that clears the cookie SHALL use the same attributes it was set with.

#### Scenario: Deployed environment

- **WHEN** a login succeeds in a non-localhost deployment
- **THEN** the response sets `app.sid` as `HttpOnly; Secure; SameSite=None` with a 24-hour lifetime

#### Scenario: Anonymous request

- **WHEN** an unauthenticated visitor calls a public endpoint
- **THEN** no session cookie is issued

### Requirement: Session check

The system SHALL expose `GET /api/v1/auth/session`, which responds 200 with `{ "user": { "id": "<uuid>", "role": "<platform role>" } }` for an authenticated session and 401 with `{}` otherwise. A session whose user no longer exists SHALL be treated as unauthenticated.

#### Scenario: Authenticated session

- **WHEN** a request with a valid session cookie calls the session check
- **THEN** the API responds 200 with the user's `id` and `role`

#### Scenario: No or expired session

- **WHEN** the request carries no cookie, an expired cookie or a revoked session
- **THEN** the API responds 401 with `{}`

### Requirement: Authenticated auth routes require a session

The system SHALL answer 401 with `{}` to every authenticated route under `/api/v1/auth` (`POST /logout`, `GET /session`) when the request carries no valid session. Requests to paths under `/api/v1/auth` that match no route SHALL receive 404 with the route-not-found `message`, with or without a session.

#### Scenario: Unknown auth path while authenticated

- **WHEN** an authenticated client requests a path under `/api/v1/auth` that matches no route
- **THEN** the API responds 404 with a `message`

#### Scenario: Unknown auth path while unauthenticated

- **WHEN** an unauthenticated client requests a path under `/api/v1/auth` that matches no route
- **THEN** the API responds 404 with the route-not-found `message`

#### Scenario: Private route without a session

- **WHEN** an unauthenticated client calls `GET /api/v1/auth/session`
- **THEN** the API responds 401 with `{}`

#### Scenario: Removed alias

- **WHEN** an authenticated client calls `PATCH /api/v1/auth/update-user-password`
- **THEN** the API responds 404 and no password changes

### Requirement: Logout destroys the session

The system SHALL expose `POST /api/v1/auth/logout` for authenticated sessions; it SHALL log the user out, delete the session from the store, clear the `app.sid` cookie and respond 200 with `{}`. A failure to destroy the session SHALL surface as a server error.

#### Scenario: Successful logout

- **WHEN** an authenticated user calls logout
- **THEN** the API responds 200 with `{}`, the session row is gone and the response clears `app.sid`

#### Scenario: Logout without a session

- **WHEN** logout is called without a valid session
- **THEN** the API responds 401 with `{}`

### Requirement: Credential changes revoke sessions

The system SHALL store the owning user on every session so sessions can be revoked per user. A password reset SHALL revoke every session of the user; an authenticated password change SHALL revoke every other session of the user while keeping the current one (see `account`); deleting a user SHALL revoke all of their sessions. Each revocation SHALL commit atomically with the change that triggers it.

#### Scenario: Reset logs out every device

- **WHEN** a user completes a password reset while logged in on two devices
- **THEN** both sessions are revoked and the next request from either device is unauthenticated

#### Scenario: Revocation cannot be half-applied

- **WHEN** revoking sessions fails during a password reset
- **THEN** the password is not changed either and the request fails as a server error

### Requirement: Password reset request is enumeration-safe

The system SHALL accept `POST /api/v1/auth/password-reset` with `email` and SHALL always respond 200 with a fixed `message` stating that a link will be sent if the email exists, before any account lookup runs. When an account exists it SHALL, detached from the request, issue a new reset token, invalidate every earlier reset token of that user, and email the token to the stored address. Failures of the detached work SHALL only be logged.

#### Scenario: Registered email

- **WHEN** a reset is requested for an email that has an account
- **THEN** the API responds 200 with the fixed message and the user receives an email with a fresh reset token

#### Scenario: Unknown email

- **WHEN** a reset is requested for an email with no account
- **THEN** the API responds the identical 200 and no token or email is produced

#### Scenario: Only the latest link works

- **WHEN** a user requests two resets in a row
- **THEN** the token from the first email no longer validates

#### Scenario: Malformed email

- **WHEN** `email` is missing, not a string or not a valid email
- **THEN** the API responds 422

### Requirement: Reset tokens are secret, short-lived and single use

The system SHALL generate reset tokens as random 256-bit values encoded as 43 base64url characters, SHALL persist only their SHA-256 digest, and SHALL never return a token in an API response. A token SHALL expire one hour after issuance and SHALL be consumable only once. Expired tokens SHALL be purged by a scheduled cleanup.

#### Scenario: Malformed token

- **WHEN** a token that is not 43 base64url characters is submitted to any reset endpoint
- **THEN** the API responds 422

#### Scenario: Token used twice

- **WHEN** a reset is completed and the same token is submitted again
- **THEN** the second attempt is rejected as invalid

### Requirement: Reset token check

The system SHALL expose `GET /api/v1/auth/password-reset?passwordResetToken=<token>` responding 200 with `{}` for a known unexpired token, 404 with `{}` for an unknown token, and 400 with a `message` for an expired token.

#### Scenario: Valid token

- **WHEN** the token exists and has not expired
- **THEN** the API responds 200 with `{}`

#### Scenario: Expired token

- **WHEN** the token exists but is past its expiry
- **THEN** the API responds 400 with a `message`

#### Scenario: Unknown token

- **WHEN** no reset token matches the submitted value
- **THEN** the API responds 404 with `{}`

### Requirement: Password reset completion

The system SHALL accept `PATCH /api/v1/auth/password-reset` with `passwordResetToken`, `newPassword` and `confirmNewPassword` (must satisfy the password policy and match, else 422). In one transaction it SHALL consume the token only if it exists and is unexpired, set the password, delete all of the user's reset tokens and revoke all of their sessions, then respond 200 with `{}`. An unknown, expired or already-consumed token SHALL respond 400 with a `message`.

#### Scenario: Successful reset

- **WHEN** a valid unexpired token and a matching strong password are submitted
- **THEN** the API responds 200 with `{}`, the new password works for login and all of the user's sessions are revoked

#### Scenario: Concurrent use of one link

- **WHEN** two completions with the same token race
- **THEN** exactly one succeeds and the other responds 400

#### Scenario: Confirmation mismatch

- **WHEN** `confirmNewPassword` differs from `newPassword`
- **THEN** the API responds 422 and the password is unchanged

### Requirement: Invite check

The system SHALL expose `GET /api/v1/auth/invite?inviteToken=<token>` (43 base64url characters, else 422). It SHALL respond 404 with a `message` for an unknown token; 400 with `code: "INVITE_EXPIRED"` for an expired invite; 400 with `code: "INVITER_INVALID"` when the inviter is no longer a member of the invite's company or can no longer grant the invited role; otherwise 200 with `{ "email", "companyName", "roleName" }`.

#### Scenario: Valid invite

- **WHEN** the token matches an unexpired invite whose inviter can still grant the role
- **THEN** the API responds 200 with the invited email, the company name and the role name

#### Scenario: Expired invite

- **WHEN** the token matches an invite past its expiry
- **THEN** the API responds 400 with `code: "INVITE_EXPIRED"`

#### Scenario: Inviter can no longer vouch

- **WHEN** the inviter has left the company or been demoted below the invited role
- **THEN** the API responds 400 with `code: "INVITER_INVALID"`

### Requirement: Invite acceptance creates the member account

The system SHALL accept `POST /api/v1/auth/invite-accept` with `inviteToken` and `password` (password policy applies). In one transaction serialized with the company's membership changes it SHALL re-check the inviter, consume the invite only if it is still unchanged and unexpired, and create a user with platform role `user`, the invite's email, company and company role, then respond 201 with `{}`. Acceptance SHALL NOT log the user in and SHALL NOT create a company or a trial.

#### Scenario: Successful acceptance

- **WHEN** a valid invite token and a strong password are submitted for an unregistered email
- **THEN** the API responds 201 with `{}` and the new user belongs to the inviting company with the invited role

### Requirement: Invite acceptance rejections

The system SHALL reject an invite acceptance with: 404 and a `message` for an unknown token; 400 `INVITE_EXPIRED` for an expired invite or one consumed, revoked or rotated during acceptance; 400 `INVITER_INVALID` when the inviter can no longer vouch, deleting the invite; 409 with a `message` when the invited email belongs to a verified account, keeping the invite until it expires.

#### Scenario: Invitee registered in the meantime

- **WHEN** the invited email already belongs to a verified account (including one verified concurrently)
- **THEN** the API responds 409, no user is created and the invite row remains until it expires

#### Scenario: Inviter demoted before acceptance

- **WHEN** the inviter was demoted below the invited role before the acceptance transaction
- **THEN** the API responds 400 with `code: "INVITER_INVALID"` and the invite is deleted

#### Scenario: Link accepted twice

- **WHEN** two acceptances of the same link race
- **THEN** at most one user is created and the other request responds 400 with `code: "INVITE_EXPIRED"` or 409

### Requirement: Rate-limit outcomes in the auth flows

The system SHALL reject requests to login, registration, reset-token check, reset completion, invite check and invite acceptance with 429 and a JSON `message` once the client's per-IP authentication budget is exhausted, and SHALL reject reset requests (`POST /api/v1/auth/password-reset`) with 429 once the separate per-IP reset-request budget is exhausted, so login failures never consume reset requests. Responses SHALL carry standard rate-limit headers. Budgets are defined by `api-hardening`.

#### Scenario: Authentication budget exhausted

- **WHEN** an IP exceeds its authentication budget and calls the registration endpoint
- **THEN** the API responds 429 with a `message` and does not process the registration

#### Scenario: Reset request budget is independent

- **WHEN** an IP has exhausted its authentication budget through failed logins
- **THEN** a password reset request from that IP is still accepted until its own budget is exhausted

### Requirement: Token pages keep tokens out of the address bar

The SPA's password-restore page (`/auth/restore-password?passwordResetToken=...`), invite-acceptance page (`/auth/accept-invite?inviteToken=...`) and email-verification page (`/auth/verify-email?emailVerificationToken=...`) SHALL read the token from the query string once, then remove the query string and fragment from the address bar without adding a history entry.

#### Scenario: Opening a reset link

- **WHEN** a user opens a reset link
- **THEN** the page keeps the token in memory and the address bar shows `/auth/restore-password` without the token

### Requirement: Password restore page states

The SPA's restore page SHALL check the token before showing the form: a missing token or a 400, 404 or 422 check result SHALL show an invalid-link state with a path to request a new link; a network or server error SHALL show a retryable error state; a valid token SHALL show the new-password form. The page SHALL block submission when the two passwords differ and SHALL show a success state with a link to login after a 200.

#### Scenario: Expired link

- **WHEN** the token check responds 400
- **THEN** the page shows the invalid-link state with a link to the password recovery page

#### Scenario: Server error during the check

- **WHEN** the token check fails with a network error or 5xx
- **THEN** the page shows an error with a retry action instead of declaring the link invalid

### Requirement: Invite acceptance page states

The SPA's invite page SHALL check the invite before showing the form, then show the invited email, company name (when present) and role. It SHALL map 400 `INVITE_EXPIRED` to an expired state, 400 `INVITER_INVALID` to an inviter-invalid state, and a missing token, 404 or any other check failure to a not-found state.

#### Scenario: Unknown invite link

- **WHEN** the invite check responds 404
- **THEN** the page shows the not-found state with a link to login

### Requirement: Invite acceptance submit outcomes in the SPA

After submitting the invite form the SPA SHALL show a success notice and navigate to login on 201, replace the form with the matching invalid state on 400 (by `code`) or 404, and show an error notice on 409 (already registered), 422 (invalid password) or any other failure.

#### Scenario: Stale invite on submit

- **WHEN** the acceptance responds 400 with `code: "INVITER_INVALID"`
- **THEN** the form is replaced by the inviter-invalid state

#### Scenario: Accepted

- **WHEN** the acceptance responds 201
- **THEN** a success notice is shown and the user is taken to the login page

### Requirement: Registration page

The SPA's registration page SHALL require email, company name and password, show a success message telling the user to confirm their email from their inbox after 201, navigate to the login page about three seconds later and block resubmission until then. It SHALL show an invalid-input message on 422, a too-many-attempts message on 429 and a generic error otherwise.

#### Scenario: Registration succeeds

- **WHEN** the registration request responds 201
- **THEN** the page shows a check-your-inbox success message and moves to the login page after a short delay

### Requirement: Password recovery page

The SPA's recovery page SHALL show the same success message for every 200 (never revealing whether the account exists), a too-many-attempts message on 429 and a generic error otherwise.

#### Scenario: Recovery accepted

- **WHEN** the reset request responds 200
- **THEN** the page shows the generic success message

#### Scenario: Recovery throttled

- **WHEN** the reset request responds 429
- **THEN** the recovery page shows a too-many-attempts message

### Requirement: Login page outcomes

The SPA's login page SHALL block duplicate submissions and show an invalid-credentials message on 401 or 422, a verify-your-email message with a resend action on 403 `EMAIL_NOT_VERIFIED`, a too-many-attempts message on 429 and a generic error otherwise. After a successful login it SHALL reset session-scoped client caches and navigate, replacing history, to a safe `next` target or else to `/admin` for superadmins and `/dashboard` for everyone else.

#### Scenario: Superadmin without next

- **WHEN** a superadmin logs in from `/auth/login` without `next`
- **THEN** the SPA navigates to `/admin`

#### Scenario: Throttled login

- **WHEN** the login request responds 429
- **THEN** the page shows a too-many-attempts message

#### Scenario: Unverified account

- **WHEN** the login responds 403 with `code: "EMAIL_NOT_VERIFIED"`
- **THEN** the page explains the email must be verified and offers to resend the verification email

### Requirement: Safe `next` redirect target

A `next` value SHALL be honoured only if it is a string of at most 2048 characters that starts with a single `/` (not `//` or `/\`), contains no control characters, resolves to the SPA's own origin and does not point to `/auth` or any path under `/auth/`; any other value SHALL be ignored.

#### Scenario: Safe next target

- **WHEN** a user logs in from `/auth/login?next=%2Fuser%2Fteam`
- **THEN** the SPA navigates to `/user/team`

#### Scenario: Open-redirect attempt

- **WHEN** `next` is `//evil.example`, `https://evil.example/x` or `/\evil.example`
- **THEN** the value is ignored and the SPA navigates to the role's home

#### Scenario: Auth page as target

- **WHEN** `next` points to `/auth/register`
- **THEN** the value is ignored and the SPA navigates to the role's home

### Requirement: Logout in the SPA

The SPA SHALL call the logout endpoint and, only after it succeeds, reset session-scoped client caches, clear the analytics identity and navigate to the public home page. If the logout request fails, the SPA SHALL keep the user where they are and show an error so they can retry.

#### Scenario: Logout succeeds

- **WHEN** the user clicks logout and the API responds 200
- **THEN** client caches and the analytics identity are cleared and the user lands on `/`

#### Scenario: Logout fails

- **WHEN** the logout request fails
- **THEN** the user stays on the current page and sees an error notice

### Requirement: Emailed links point at the SPA token pages

The system SHALL build the links it emails from the origin of `FRONT_WEB_APP_ORIGIN_URL` (scheme, host and port only): password-reset emails SHALL link to `/auth/restore-password?passwordResetToken=<token>` and invite emails to `/auth/accept-invite?inviteToken=<token>`, with the token URL-encoded, and pass these URLs to the email templates.

#### Scenario: Reset link

- **WHEN** a reset email is sent with `FRONT_WEB_APP_ORIGIN_URL=https://app.example.com/`
- **THEN** the template receives `https://app.example.com/auth/restore-password?passwordResetToken=<token>`

#### Scenario: Invite link

- **WHEN** an invite email is sent
- **THEN** the template receives a link to `/auth/accept-invite?inviteToken=<token>` on the front-end origin

### Requirement: Registration sends a verification email

The system SHALL create every self-registered account unverified and, in the detached registration work, issue an email-verification token and email a link to `/auth/verify-email?emailVerificationToken=<token>` on the front-end origin. Issuing a token SHALL invalidate the user's earlier verification tokens. Accounts created by invite acceptance or the seed SHALL be verified at creation.

#### Scenario: New registrant

- **WHEN** a valid registration arrives for an email with no account
- **THEN** the account is created unverified and a verification email is sent to it

#### Scenario: Invited member

- **WHEN** a user is created by accepting an invite
- **THEN** the account is verified without a verification email

### Requirement: Email verification tokens are secret and short-lived

The system SHALL generate verification tokens as random 256-bit values encoded as 43 base64url characters, persist only their SHA-256 digest, never return them in an API response, expire them 24 hours after issuance and allow each to be consumed once.

#### Scenario: Token reused

- **WHEN** a verification token that was already consumed is submitted again
- **THEN** it is rejected as invalid

### Requirement: Verify an email address

The system SHALL accept `POST /api/v1/auth/email-verification` with `emailVerificationToken` in the body (43 base64url characters, else 422). For a known, unexpired, unused token it SHALL mark the account verified, consume the token and respond 200 with `{}`; otherwise it SHALL respond 400 with `code: "EMAIL_VERIFICATION_INVALID"`. Verification SHALL NOT log the user in.

#### Scenario: Valid link

- **WHEN** a registrant submits the token from their verification email within 24 hours
- **THEN** the API responds 200 and the account can log in

#### Scenario: Expired link

- **WHEN** the token is past its expiry
- **THEN** the API responds 400 with `code: "EMAIL_VERIFICATION_INVALID"`

### Requirement: Resend the verification email

The system SHALL accept `POST /api/v1/auth/email-verification/resend` with `email` and always respond 200 with a fixed `message` before any account lookup. Detached from the request, it SHALL issue a new token and send the email only when an unverified account has that email; failures SHALL only be logged.

#### Scenario: Unverified account

- **WHEN** a resend is requested for an unverified account's email
- **THEN** the API responds 200 and a new verification email is sent, invalidating the previous link

#### Scenario: Unknown or verified email

- **WHEN** a resend is requested for an email with no account or a verified one
- **THEN** the API responds the identical 200 and no email is sent

### Requirement: Unverified accounts cannot log in

The system SHALL answer a login whose credentials are correct but whose account is unverified with 403 and `code: "EMAIL_NOT_VERIFIED"`, establishing no session. The password check SHALL run first, so wrong credentials still answer 401 whatever the verification state.

#### Scenario: Unverified login

- **WHEN** a user logs in with correct credentials before verifying
- **THEN** the API responds 403 with `code: "EMAIL_NOT_VERIFIED"` and no session cookie is set

#### Scenario: Wrong password on an unverified account

- **WHEN** a login for an unverified account carries a wrong password
- **THEN** the API responds 401 with `{}`

### Requirement: Mailbox proofs claim unverified accounts

Completing a password reset SHALL mark the account verified in the same transaction. Accepting an invite for an email held by an unverified account SHALL delete that account and its company data in the acceptance transaction and then create the member; an email held by a verified account SHALL keep the 409 outcome.

#### Scenario: Squatted address reset by its owner

- **WHEN** the owner of a mailbox completes a password reset for an account someone else registered with it
- **THEN** the password is replaced, every session is revoked and the account is verified

#### Scenario: Invite to a squatted address

- **WHEN** an invite is accepted for an email held by an unverified account
- **THEN** the unverified account and its company are removed and the invitee becomes a member of the inviting company

### Requirement: Email verification page

The SPA's page `/auth/verify-email` SHALL read the token from the query once, remove it from the address bar, submit it, and show a success state with a link to login on 200, an invalid-link state with a resend form on 400 or 422, and a retryable error on network or server errors.

#### Scenario: Link opened

- **WHEN** a registrant opens a valid verification link
- **THEN** the address bar shows `/auth/verify-email` without the token and the page shows the success state

#### Scenario: Stale link

- **WHEN** the verification responds 400
- **THEN** the page shows the invalid-link state with a form to request a new email

### Requirement: Credentials are accepted only in the request body

The system SHALL read `username`, `password`, `newPassword`, `confirmNewPassword`, `currentPassword`, `passwordResetToken` (on completion) and `email` (on reset request) only from the JSON body of the auth and account flows. Credentials supplied in the query string SHALL never authenticate or change anything: a request whose body lacks them SHALL answer 422.

#### Scenario: Login with query-string credentials

- **WHEN** `POST /api/v1/auth/login?username=<email>&password=<password>` arrives with no body
- **THEN** the API responds 422, no account lookup runs and no session is established

#### Scenario: Body credentials win

- **WHEN** a login carries valid credentials in the body and different ones in the query string
- **THEN** only the body credentials are evaluated
