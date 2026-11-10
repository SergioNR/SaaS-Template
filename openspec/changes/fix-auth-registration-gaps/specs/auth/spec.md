# Spec Delta

## ADDED Requirements

### Requirement: Emailed links point at the SPA token pages

The system SHALL build the links it emails from the origin of `FRONT_WEB_APP_ORIGIN_URL` (scheme, host and port only): password-reset emails SHALL link to `/auth/restore-password?passwordResetToken=<token>` and invite emails to `/auth/accept-invite?inviteToken=<token>`, with the token URL-encoded, and pass these URLs to the email templates.

#### Scenario: Reset link

- **WHEN** a reset email is sent with `FRONT_WEB_APP_ORIGIN_URL=https://app.example.com/`
- **THEN** the template receives `https://app.example.com/auth/restore-password?passwordResetToken=<token>`

#### Scenario: Invite link

- **WHEN** an invite email is sent
- **THEN** the template receives a link to `/auth/accept-invite?inviteToken=<token>` on the front-end origin

## MODIFIED Requirements

### Requirement: Self-service registration creates a company and its owner

The system SHALL accept `POST /api/v1/auth/register` with `username` (email), `password` and a required `companyName` (2-100 characters after trimming). For an unregistered email it SHALL create in one write a named company, its trial subscription (see `billing`) and the user with platform role `user` holding the `company_owner` company role. Registration SHALL NOT log the user in and SHALL NOT require email verification.

#### Scenario: New email registers

- **WHEN** a valid registration arrives for an email with no account
- **THEN** the API responds 201 with `{}` and, once the detached work completes, the user exists as `company_owner` of a newly created company with a trial subscription

#### Scenario: Company name omitted

- **WHEN** a registration omits `companyName` or sends it empty
- **THEN** the API responds 422 and nothing is created

#### Scenario: Blocked email domain

- **WHEN** the email domain is `tempmail.com` or `throwaway.com` (after normalization, any letter case)
- **THEN** the API responds 422

#### Scenario: Invalid company name

- **WHEN** `companyName` is shorter than 2 or longer than 100 characters after trimming, or is not a string
- **THEN** the API responds 422

### Requirement: Authenticated auth routes require a session

The system SHALL answer 401 with `{}` to every authenticated route under `/api/v1/auth` (`POST /logout`, `GET /session`, `PATCH /update-user-password`) when the request carries no valid session. Requests to paths under `/api/v1/auth` that match no route SHALL receive 404 with the route-not-found `message`, with or without a session.

#### Scenario: Unknown auth path while authenticated

- **WHEN** an authenticated client requests a path under `/api/v1/auth` that matches no route
- **THEN** the API responds 404 with a `message`

#### Scenario: Unknown auth path while unauthenticated

- **WHEN** an unauthenticated client requests a path under `/api/v1/auth` that matches no route
- **THEN** the API responds 404 with the route-not-found `message`

#### Scenario: Private route without a session

- **WHEN** an unauthenticated client calls `GET /api/v1/auth/session`
- **THEN** the API responds 401 with `{}`
