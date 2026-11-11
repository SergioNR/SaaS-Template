# Spec Delta

## MODIFIED Requirements

### Requirement: Auth forms block double submission

The login, registration, password-recovery, password-restore, invite-acceptance and password-update forms and the account-deletion confirmation SHALL show a busy submit control while their request is in flight and SHALL NOT send a second request for it. All but the password-update form SHALL also reject a second submit fired before the busy state renders. A successful registration SHALL keep its form locked until the redirect to login three seconds later.

#### Scenario: Double Enter on login

- **WHEN** the user presses Enter twice in quick succession on the login form
- **THEN** exactly one login request is sent

#### Scenario: Double Enter on invite acceptance

- **WHEN** the user presses Enter twice in quick succession on the invite-acceptance form
- **THEN** exactly one acceptance request is sent and no error notice appears for a second attempt

#### Scenario: Double Enter on password restore

- **WHEN** the user presses Enter twice in quick succession on the password-restore form
- **THEN** exactly one reset request is sent

#### Scenario: Registration succeeded

- **WHEN** registration succeeds
- **THEN** a success message shows, the submit control stays disabled, and the app navigates to the login page after three seconds unless the user leaves first

### Requirement: The team page has explicit loading and error states

The team page SHALL show skeleton rows in the members and invites tables while loading; on a load failure it SHALL replace both tables with an error alert offering retry, or a membership message without retry when the caller has no company; with no rows, an empty-state line per table. While loading or failed, the invite button SHALL be disabled without a lock tooltip. Dismissing the invite dialog by any means SHALL clear its role choice and error. Invite rules belong to `team-management`.

#### Scenario: Load fails transiently

- **WHEN** loading the team fails with a server error
- **THEN** an error alert with a retry button replaces the tables, and retry reloads the team with skeletons

#### Scenario: No company membership

- **WHEN** loading the team answers 403 with code `COMPANY_MEMBERSHIP_REQUIRED`
- **THEN** a membership message renders with no retry button

#### Scenario: Invite dialog cancelled after a role error

- **WHEN** the caller submits the invite dialog without a role, presses cancel and reopens the dialog
- **THEN** the dialog shows no role error and no preselected role

#### Scenario: Invite rows carry no expiry badge

- **WHEN** the team page lists pending invites
- **THEN** each row shows email, role and expiry date without an expired badge
