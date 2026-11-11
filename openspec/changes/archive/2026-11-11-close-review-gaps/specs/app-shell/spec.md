# Spec Delta

## MODIFIED Requirements

### Requirement: The route tree separates public, auth, user and admin areas

The web app SHALL serve four areas: the public site at `/` (see `public-site`); the auth area under `/auth` (login at `/auth` and `/auth/login`, registration, password recovery and restore, invite acceptance, email verification); the user area as one guarded layout covering `/dashboard`, `/user/profile`, `/user/billing` and `/user/team` (`/user` redirects to `/dashboard`); and the admin area under `/admin` (overview, users, companies, account). Any other path SHALL render the not-found page.

#### Scenario: Bare user path

- **WHEN** a visitor opens `/user`
- **THEN** the app redirects to `/dashboard` without leaving `/user` in the history

#### Scenario: Login reachable at the auth root

- **WHEN** a visitor opens `/auth` or `/auth/login`
- **THEN** the login page renders inside the auth layout

#### Scenario: Email verification link

- **WHEN** a visitor opens `/auth/verify-email`
- **THEN** the email verification page renders inside the auth layout

#### Scenario: Admin account page

- **WHEN** a superadmin opens `/admin/account`
- **THEN** the admin account page renders inside the admin layout

#### Scenario: Unknown path

- **WHEN** a visitor opens a path that matches no defined route
- **THEN** the not-found page renders
