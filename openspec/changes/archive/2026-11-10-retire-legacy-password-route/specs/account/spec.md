# Spec Delta

## REMOVED Requirements

### Requirement: Deprecated password-change alias

**Reason**: The SPA, the only first-party client, now calls `PATCH /api/v1/user/password`; the alias under `/api/v1/auth` duplicated the route and needed its own 401 handling in the client.

**Migration**: Call `PATCH /api/v1/user/password` with the same body (`currentPassword`, `newPassword`); responses, codes and side effects are identical.
