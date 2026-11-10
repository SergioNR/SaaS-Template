# Spec Delta

## MODIFIED Requirements

### Requirement: The route tree separates public, auth, user and admin areas

The web app SHALL serve four areas: the public site at `/` (see `public-site`); the auth area under `/auth` (login at `/auth` and `/auth/login`, registration, password recovery and restore, invite acceptance); the user area as one guarded layout covering `/dashboard` and `/user/profile`, `/user/billing`, `/user/team`, `/user` redirecting to `/dashboard` replacing history; and the admin area under `/admin` (overview, users, companies, account). Any other path SHALL render the not-found page.

#### Scenario: Bare user path

- **WHEN** a visitor opens `/user`
- **THEN** the app redirects to `/dashboard` without leaving `/user` in the history

#### Scenario: Login reachable at the auth root

- **WHEN** a visitor opens `/auth` or `/auth/login`
- **THEN** the login page renders inside the auth layout

#### Scenario: Admin account page

- **WHEN** a superadmin opens `/admin/account`
- **THEN** the admin account page renders inside the admin layout

#### Scenario: Unknown path

- **WHEN** a visitor opens a path that matches no defined route
- **THEN** the not-found page renders

### Requirement: Private areas share a navigation shell

The user and admin areas SHALL render a header (brand link, area title) and a sidebar with the area's links under a labelled section, highlighting the current page, and logout plus, when analytics is configured, the cookie-preferences control at the bottom. The user sidebar SHALL list dashboard, profile, plans/billing and team; the admin one overview, users, companies and account. On small screens the sidebar SHALL collapse behind a burger exposing its open state; choosing a link SHALL close it.

#### Scenario: Mobile navigation

- **WHEN** a user on a narrow screen opens the burger and taps the team link
- **THEN** the team page renders and the sidebar closes

#### Scenario: Active link

- **WHEN** the admin is on `/admin/users/42`
- **THEN** the users link is highlighted and the overview link is not

#### Scenario: Cookie preferences in the sidebar

- **WHEN** a signed-in user opens the sidebar on a build with analytics configured
- **THEN** a cookie-preferences control renders next to logout

#### Scenario: Admin account link

- **WHEN** a superadmin opens the admin sidebar
- **THEN** it lists an account link leading to `/admin/account`
