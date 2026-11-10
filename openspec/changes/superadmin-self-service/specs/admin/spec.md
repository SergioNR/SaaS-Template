# Spec Delta

## ADDED Requirements

### Requirement: SPA admin account page

The admin area SHALL offer an account page at `/admin/account` showing the signed-in superadmin's email, the same password-change form as the user profile page and an account-deletion action. Deletion SHALL follow the profile page's confirmation and success flow, and SHALL map 409 `LAST_SUPERADMIN` to a specific message, keeping the superadmin signed in on the page.

#### Scenario: Superadmin changes their password

- **WHEN** a superadmin submits the password form on `/admin/account` with the correct current password
- **THEN** the form resets and a success notice is shown

#### Scenario: Last superadmin tries to delete themselves

- **WHEN** the deletion responds 409 with `code: "LAST_SUPERADMIN"`
- **THEN** the page shows the last-superadmin message and the superadmin stays signed in

#### Scenario: Superadmin deletes their account

- **WHEN** the deletion responds 200
- **THEN** session caches and the analytics identity are cleared and the browser lands on `/`

## MODIFIED Requirements

### Requirement: SPA admin area guard

The SPA SHALL guard every `/admin` page with a session check: a superadmin renders the admin area (overview, users, user detail, companies, company detail, account); any other role SHALL be redirected to `/dashboard`; a 401 SHALL redirect to login with the current path as `next`; any other check failure SHALL show a retryable error instead of redirecting.

#### Scenario: Superadmin enters the admin area

- **WHEN** a superadmin opens `/admin/users`
- **THEN** the admin users page renders

#### Scenario: Tenant user opens the admin area

- **WHEN** a user with platform role `user` opens any `/admin` page
- **THEN** the SPA redirects to `/dashboard`

#### Scenario: Tenant user opens the admin account page

- **WHEN** a user with platform role `user` opens `/admin/account`
- **THEN** the SPA redirects to `/dashboard`

#### Scenario: Expired session

- **WHEN** the session check answers 401
- **THEN** the SPA redirects to login with `next` set to the current admin path

#### Scenario: Server unavailable

- **WHEN** the session check fails with a network error or 5xx
- **THEN** the SPA shows a retryable error and stays on the page

### Requirement: SPA users list deletion feedback

The admin users list SHALL render the delete action on the signed-in superadmin's own row disabled with a tooltip pointing to the admin account page, SHALL warn in the confirmation dialog when the target is a superadmin, and SHALL map 409 `LAST_SUPERADMIN`, 409 `LAST_COMPANY_OWNER`, any other 409, and 404 to distinct user-facing messages.

#### Scenario: Own row locked

- **WHEN** a superadmin views the users list
- **THEN** the delete action on their own row is disabled with a tooltip pointing to the account page

#### Scenario: Last-owner refusal surfaced

- **WHEN** a deletion answers 409 with `code: LAST_COMPANY_OWNER`
- **THEN** the SPA shows the last-owner message instead of the generic conflict message

#### Scenario: Last-superadmin refusal surfaced

- **WHEN** a deletion answers 409 with `code: LAST_SUPERADMIN`
- **THEN** the SPA shows the last-superadmin message instead of the generic conflict message
