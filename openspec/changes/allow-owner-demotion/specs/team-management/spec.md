# Spec Delta

## ADDED Requirements

### Requirement: Granting and member-management rules

The system SHALL let a caller grant a role (invite to it, assign it, resend or revoke an invite for it) only when the role ranks at or below the caller's own. It SHALL let a caller manage an existing member (change their role, remove them) only when the member is not the caller and either the caller strictly outranks every role the member holds or both hold `company_owner`. Admins and members still cannot manage peers.

#### Scenario: Admin invites an admin

- **WHEN** a `company_admin` invites someone as `company_admin`
- **THEN** the invite is created

#### Scenario: Admin cannot touch another admin

- **WHEN** a `company_admin` tries to remove or re-role another `company_admin`
- **THEN** the API responds 403 with a `message`

#### Scenario: Owner demotes another owner

- **WHEN** an owner of a company with two owners changes the other owner's role to `company_admin`
- **THEN** the API responds 200 and the company has one owner left

#### Scenario: Owner removes another owner

- **WHEN** an owner removes another owner of the same company
- **THEN** the API responds 200 and the removed owner's account is deleted

#### Scenario: Admin cannot touch an owner

- **WHEN** a `company_admin` tries to remove or re-role a `company_owner`
- **THEN** the API responds 403 with a `message`

## REMOVED Requirements

### Requirement: Granting and managing rules

**Reason**: It made every `company_owner` permanent, leaving the last-owner guards unreachable. Superseded by "Granting and member-management rules".

**Migration**: None for clients; owner callers now see other owners as `manageable: true`.

## MODIFIED Requirements

### Requirement: Manageable hints and assignable roles

The listing SHALL mark a member `manageable: true` only when the caller may manage them under the managing rule, mark an invite `manageable: true` when the caller can grant its role, and return as `assignableRoles` the sorted roles at or below the caller's rank. These are hints only; every write endpoint SHALL re-check the rules.

#### Scenario: Owner's view

- **WHEN** an owner lists a team with an admin, a member and another owner
- **THEN** the admin, the member and the other owner are `manageable: true`, the caller is `manageable: false`, and `assignableRoles` is all three roles

#### Scenario: Admin's view

- **WHEN** an admin lists the team
- **THEN** `assignableRoles` is `["company_admin", "company_member"]` and owners and other admins are `manageable: false`

### Requirement: Role change rejections

The system SHALL reject a role change with: 422 when `roleName` is not one of the three company roles; 409 with a `message` when the target is the caller; 404 with a `message` when the target is not in the caller's company or the role row is missing; 403 with a `message` when the caller cannot grant the new role or may not manage the target; 409 with a `message` when it would leave the company without an owner.

#### Scenario: Bogus role

- **WHEN** `roleName` is `superadmin`
- **THEN** the API responds 422

#### Scenario: Own role

- **WHEN** a caller tries to change their own role
- **THEN** the API responds 409

#### Scenario: Member of another company

- **WHEN** the `userId` belongs to a different company
- **THEN** the API responds 404

#### Scenario: Owners demote each other concurrently

- **WHEN** the only two owners each demote the other at the same time
- **THEN** exactly one change succeeds and the other responds 403, leaving one owner

### Requirement: Member removal rejections and races

The system SHALL reject a removal with 409 and a `message` when the target is the caller, 404 when the target is not in the caller's company, 403 when the caller may not manage the target, and 409 when it would remove the last owner. The checks SHALL be repeated under the company lock together with the delete, so a concurrent removal of the same member resolves to 404 rather than an error.

#### Scenario: Remove yourself

- **WHEN** a caller targets their own user id
- **THEN** the API responds 409 and points to account deletion instead

#### Scenario: Double removal

- **WHEN** two admins remove the same member concurrently
- **THEN** one responds 200 and the other 404

#### Scenario: Owners remove each other concurrently

- **WHEN** the only two owners each remove the other at the same time
- **THEN** exactly one removal succeeds and the other responds 403 or 404, and the company keeps an owner
