# Spec Delta

## ADDED Requirements

### Requirement: Consent can be changed from the private areas

When analytics is configured, the user and admin areas SHALL offer the same cookie-preferences control as the site footer, reachable from their navigation sidebar, which stops any active capturing, forgets the stored choice and shows the consent banner again. Without analytics configured the control SHALL NOT render.

#### Scenario: Signed-in user withdraws consent

- **WHEN** a signed-in user who accepted analytics activates the cookie-preferences control in the user area sidebar
- **THEN** capturing stops immediately and the consent banner reappears without leaving the area

#### Scenario: Admin area without analytics

- **WHEN** a superadmin opens the admin area on a build without an analytics key
- **THEN** no cookie-preferences control renders in the sidebar

## MODIFIED Requirements

### Requirement: Identity and error reporting follow consent

User identification, identity reset on logout or account deletion, and error reports SHALL be no-ops without consent. A signed-in user in either the user or the admin area SHALL be identified by their user id; one signed in before consenting SHALL be identified once consent is given. After logout or account deletion a consenting visitor SHALL keep being captured anonymously.

#### Scenario: Consent given mid-session

- **WHEN** a signed-in user accepts the banner from inside the user area
- **THEN** the analytics client loads, starts capturing and identifies that user

#### Scenario: Superadmin identified

- **WHEN** a consenting superadmin's admin-area session check succeeds
- **THEN** the analytics identity is set to that superadmin's user id

#### Scenario: Logout with consent

- **WHEN** a consenting user logs out
- **THEN** the analytics identity is reset and capturing continues anonymously
