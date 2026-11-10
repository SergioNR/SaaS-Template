# Spec Delta

## MODIFIED Requirements

### Requirement: An expired session anywhere returns the user to login

When any non-authentication API request answers 401 while the visitor is outside the auth pages (`/auth` and every path under it), the app SHALL clear all per-session cached data and perform a full-page redirect to the login page with `next` set to the current path. Concurrent 401s SHALL trigger a single redirect. 401s from authentication endpoints SHALL be handled by the calling page instead, which on an expired session also clears session caches and returns the user to login with `next`.

#### Scenario: Session revoked mid-use

- **WHEN** a signed-in user on `/user/billing` triggers a request that answers 401
- **THEN** the browser fully reloads into `/auth/login?next=%2Fuser%2Fbilling`

#### Scenario: Several requests fail at once

- **WHEN** three requests answer 401 simultaneously
- **THEN** exactly one redirect to login happens

#### Scenario: Wrong credentials on the login page

- **WHEN** the login request answers 401
- **THEN** no redirect happens and the login form shows its inline error

#### Scenario: 401 while on the bare auth route

- **WHEN** a non-authentication request answers 401 while the visitor is on `/auth`
- **THEN** no redirect happens

### Requirement: Per-session cached data is invalidated on every session change

The app SHALL discard all client-side data cached for the current session (such as the caller's company permissions) on successful login, on logout, on account deletion and whenever a 401 ends the session — including a private area's session probe answering 401 — and SHALL discard any in-flight response for such a cache that started before the invalidation, so a later user on the same tab never sees the previous user's data or permission gating.

#### Scenario: Different user signs in on the same tab

- **WHEN** user A logs out and user B logs in without reloading the page
- **THEN** pages for user B fetch fresh permissions and never show user A's cached ones

#### Scenario: Stale response after logout

- **WHEN** a permissions request started before logout resolves after it
- **THEN** its result is dropped and not written into the new session's cache

#### Scenario: Session probe rejected

- **WHEN** the user or admin area's session probe answers 401
- **THEN** all per-session caches are cleared before the app navigates to login
