# Spec Delta

## ADDED Requirements

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

## MODIFIED Requirements

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

### Requirement: Token pages keep tokens out of the address bar

The SPA's password-restore page (`/auth/restore-password?passwordResetToken=...`), invite-acceptance page (`/auth/accept-invite?inviteToken=...`) and email-verification page (`/auth/verify-email?emailVerificationToken=...`) SHALL read the token from the query string once, then remove the query string and fragment from the address bar without adding a history entry.

#### Scenario: Opening a reset link

- **WHEN** a user opens a reset link
- **THEN** the page keeps the token in memory and the address bar shows `/auth/restore-password` without the token

### Requirement: Registration page

The SPA's registration page SHALL require email, company name and password, show a success message telling the user to confirm their email from their inbox after 201, navigate to the login page about three seconds later and block resubmission until then. It SHALL show an invalid-input message on 422, a too-many-attempts message on 429 and a generic error otherwise.

#### Scenario: Registration succeeds

- **WHEN** the registration request responds 201
- **THEN** the page shows a check-your-inbox success message and moves to the login page after a short delay

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
