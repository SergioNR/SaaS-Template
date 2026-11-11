# Spec Delta

## MODIFIED Requirements

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
