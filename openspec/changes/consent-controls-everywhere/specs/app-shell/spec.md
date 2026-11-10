# Spec Delta

## MODIFIED Requirements

### Requirement: Private areas share a navigation shell

The user and admin areas SHALL render a header (brand link home, area title) and a sidebar listing the area's links in a labelled section, highlighting the current page, with logout and, when analytics is configured, the cookie-preferences control at the bottom. The user sidebar SHALL list dashboard, profile, plans/billing and team; the admin one overview, users and companies. On small screens the sidebar SHALL collapse behind a burger exposing its open state; choosing a link SHALL close it.

#### Scenario: Mobile navigation

- **WHEN** a user on a narrow screen opens the burger and taps the team link
- **THEN** the team page renders and the sidebar closes

#### Scenario: Active link

- **WHEN** the admin is on `/admin/users/42`
- **THEN** the users link is highlighted and the overview link is not

#### Scenario: Cookie preferences in the sidebar

- **WHEN** a signed-in user opens the sidebar on a build with analytics configured
- **THEN** a cookie-preferences control renders next to logout
