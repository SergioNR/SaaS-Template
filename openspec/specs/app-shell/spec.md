# app-shell Specification

## Purpose
Owns the SPA frame of the template: the route tree and its four areas (public, auth, user, admin), the session-check protocol that guards the private areas, role routing, lazy route loading and stale-build recovery, the global error boundary and not-found page, per-session cache invalidation, the navigation shells, the accessibility guarantees every layout provides, the feedback conventions (toasts versus inline alerts), and the observable UI states of the user dashboard and team page. API rules (credentials, sessions, permissions, billing, admin data) are owned by the `auth`, `team-management`, `billing` and `admin` capabilities and are only referenced here; public pages, SEO and analytics consent are owned by `public-site`.

## Requirements

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

### Requirement: Private areas render only after a session check

The user and admin areas SHALL probe the session (see `auth`) before rendering area content and SHALL start no session-dependent request, including the user area's billing fetch, until it succeeds. While pending a full-page loader SHALL show; a 401 SHALL navigate to login with `next` set to the current path, replacing history; any other failure SHALL render a session-error state whose retry re-runs the probe; on success the area layout and requested page SHALL render.

#### Scenario: Signed-out visitor opens a private page

- **WHEN** the session probe for `/user/team` answers 401
- **THEN** the browser lands on `/auth/login?next=%2Fuser%2Fteam` and no part of the user area renders

#### Scenario: Transient probe failure

- **WHEN** the session probe fails with a network or 5xx error
- **THEN** a session-error alert with a retry button renders instead of redirecting to login
- **AND** pressing retry shows the loader and re-runs the probe

#### Scenario: Probe succeeds

- **WHEN** the session probe returns the signed-in user
- **THEN** the area layout and the requested page render

### Requirement: The session check runs once per area mount

Each private area layout SHALL run its session check once when it mounts (plus explicit retries) and SHALL stay mounted while the user navigates within the area, so moving between pages of the same area never re-runs the check or replaces the layout with the loader. In the user area the signed-in user's profile SHALL be fetched once per area mount and shared with every page; a failure of that fetch SHALL NOT block the area — pages fall back to placeholders.

#### Scenario: Navigating inside the user area

- **WHEN** a signed-in user moves from `/dashboard` to `/user/profile` and then to `/user/team`
- **THEN** the sidebar layout stays on screen, no loader flashes, and the session probe is not repeated

#### Scenario: Profile fetch fails

- **WHEN** the session probe succeeds but the profile fetch fails
- **THEN** the area renders and profile-derived values show placeholder fallbacks instead of an error page

### Requirement: Areas route users by role

The app SHALL route by session role: after login a `superadmin` lands on `/admin` and a `user` on `/dashboard`, unless a safe `next` target is present (see the `auth` capability for `next` validation); a `superadmin` opening the user area SHALL be redirected to `/admin`; a non-superadmin opening the admin area SHALL be redirected to `/dashboard`. Both role redirects SHALL replace history.

#### Scenario: Superadmin opens the user area

- **WHEN** a superadmin opens `/dashboard`
- **THEN** the app redirects to `/admin`

#### Scenario: Regular user opens the admin area

- **WHEN** a user with role `user` opens `/admin/users`
- **THEN** the app redirects to `/dashboard`

#### Scenario: Login without next

- **WHEN** a superadmin logs in from `/auth/login` with no `next` parameter
- **THEN** they land on `/admin`

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

### Requirement: Routes outside the entry pages load lazily with a shared loader

The homepage and the login page SHALL ship in the initial bundle; every other route (public, auth, user and admin pages and the private area layouts) SHALL load on demand, showing the shared full-page loader while its code downloads.

#### Scenario: Opening the pricing page

- **WHEN** a visitor navigates to `/pricing` for the first time in the tab
- **THEN** the loader shows until the page code arrives, then the page renders

### Requirement: A stale build reloads once instead of failing

When loading a route's code fails because the build it references no longer exists (a tab left open across a deploy), the app SHALL perform one full page reload to pick up the current build. If a reload for this reason already happened within the last 10 seconds, or the browser blocks session storage, the app SHALL NOT reload again and SHALL show the error fallback with a reload action instead.

#### Scenario: Tab open across a deploy

- **WHEN** a user in an old tab navigates to a route whose code chunk was removed by a deploy
- **THEN** the page reloads once and the route renders from the new build

#### Scenario: Chunk genuinely unreachable

- **WHEN** the route code still fails to load right after that reload
- **THEN** no further automatic reload happens and an update-specific error page with a reload button renders

### Requirement: Render errors are contained by a global error boundary

The app SHALL catch any render error below the router and show a generic error page with a reload button in place of the routed content; it SHALL report the error to analytics only when analytics is configured and the visitor consented (see `public-site`); and it SHALL clear the error state when the pathname changes, so navigating away recovers without a reload.

#### Scenario: A page throws while rendering

- **WHEN** a page component throws during render
- **THEN** the error page with a reload button renders and the rest of the tab stays usable

#### Scenario: Recovery by navigation

- **WHEN** the error page is showing and the user navigates to another path
- **THEN** the new route renders normally

### Requirement: The not-found page is a standalone noindex page

The not-found page SHALL render without the site navigation bar, with its own skip link, main landmark, heading, explanatory text, a link back to the homepage and the site footer, and SHALL be marked `noindex, nofollow`.

#### Scenario: Visitor follows a dead link

- **WHEN** a visitor opens an unknown path
- **THEN** the not-found page renders with a link back to `/` and a `noindex, nofollow` robots meta

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

### Requirement: Logout ends the session or stays put on failure

The logout action SHALL be disabled while its request is in flight; on success it SHALL clear per-session caches, clear the analytics identity and navigate to `/`; on failure it SHALL show an error toast and keep the user where they are so they can retry.

#### Scenario: Double click on logout

- **WHEN** the user clicks logout twice quickly
- **THEN** only one logout request is sent

#### Scenario: Logout request fails

- **WHEN** the logout request fails
- **THEN** an error toast appears and the user remains in the area with logout enabled again

### Requirement: Every layout provides a skip link and a main landmark

Every layout (public, auth, user, admin, not-found) SHALL render a skip link as its first focusable element, visible on focus, that moves focus to the page's main landmark, and SHALL render its content inside a single programmatically focusable main landmark.

#### Scenario: Keyboard user skips navigation

- **WHEN** a keyboard user presses Tab on a fresh page and activates the skip link
- **THEN** focus moves to the main content

### Requirement: Focus moves to the page heading on navigation

On every client-side pathname change after the first load, the app SHALL move focus to the new page's first level-1 or level-2 heading inside the main landmark, waiting up to about one second for lazily loaded content, and SHALL fall back to the main landmark when no heading appears. Every page SHALL start with such a heading.

#### Scenario: Navigation moves focus

- **WHEN** a user follows a sidebar link to the team page
- **THEN** focus lands on the team page heading

#### Scenario: First load keeps default focus

- **WHEN** a page is opened directly by URL
- **THEN** focus is not moved programmatically

### Requirement: Permission-locked controls are disabled with a focusable explanation

Controls the caller is not permitted to use SHALL render disabled, never hidden, and SHALL be wrapped in a focusable element that shows an explanatory tooltip on hover, focus and touch and exposes the reason to screen readers as a description. Unlocked controls SHALL render without the wrapper.

#### Scenario: Member without invite permission

- **WHEN** a member lacking the invite permission views the team page
- **THEN** the invite button is visible but disabled, and tabbing to it reveals a tooltip explaining why

### Requirement: One-off outcomes use toasts, form errors use inline alerts

The app SHALL report the outcome of one-off actions (saves, invites, role changes, removals, checkout and portal actions, logout and account deletion results) with transient toast notifications, and SHALL report errors tied to a form the user is correcting (login, registration, password recovery/restore/update) with an inline alert next to the form. User-facing messages SHALL be mapped from HTTP status and stable error `code` values, never from server-provided message text.

#### Scenario: Wrong current password

- **WHEN** a password update fails because the current password is incorrect
- **THEN** an inline alert appears in the password form and no toast is shown

#### Scenario: Invite sent

- **WHEN** an invite is created successfully
- **THEN** a success toast appears and the invite modal closes

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

### Requirement: The user dashboard summarises account and subscription state

The dashboard SHALL show the signed-in email (or a generic greeting) and today's date; cards for subscription status (paid, trial or inactive, per `billing`), days remaining, last login and member since; a plan card with period progress when active, else a call to view plans; billing and profile links; a renewal indicator; and an activity timeline; skeletons while loading. If the subscription fails, its cards SHALL show an unknown state, not inactive, and an error alert with retry.

#### Scenario: Loading

- **WHEN** the dashboard opens before the subscription and profile have loaded
- **THEN** skeleton placeholders render in the summary and plan cards

#### Scenario: Trial company

- **WHEN** the company is on a running trial
- **THEN** the subscription card shows the trial status and the days-remaining card shows the days until the trial end

#### Scenario: Subscription fails to load

- **WHEN** the subscription request fails with a network error or 5xx
- **THEN** the subscription-derived cards show an unknown state with no inactive badge and no call to view plans
- **AND** an error alert with a retry action renders

#### Scenario: Retry after a load failure

- **WHEN** the user presses retry and the subscription request now succeeds
- **THEN** the cards show skeletons while loading and then the real subscription status

#### Scenario: No company membership

- **WHEN** the subscription request answers 403 with code `COMPANY_MEMBERSHIP_REQUIRED`
- **THEN** the dashboard shows the membership message without a retry action

### Requirement: The dashboard prompts companies without a subscription

When the subscription has loaded and no subscription is active, the dashboard SHALL show a no-subscription banner at the top with a call to action to `/user/billing`, and an inline note linking to plan selection at the bottom. Both the banner and the inline note SHALL stay hidden while loading and when the subscription failed to load.

#### Scenario: No active subscription

- **WHEN** the company has no paid subscription and no running trial
- **THEN** the inactive status, the no-subscription banner and a link to choose a plan render

#### Scenario: Load failure shows no purchase prompt

- **WHEN** the subscription request fails
- **THEN** neither the no-subscription banner nor the choose-a-plan note renders

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

### Requirement: Team mutations reload silently and block duplicates

After a successful invite, resend, revoke, role change or removal, the team page SHALL reload in the background without skeletons, keeping the last good data if that reload fails, and SHALL never let an older response overwrite a newer one. Each row SHALL disable its controls while a mutation on it is in flight; the invite and removal dialogs SHALL show a busy confirm action and SHALL NOT close while their request is in flight.

#### Scenario: Role change in progress

- **WHEN** the caller changes a member's role
- **THEN** that row's controls are disabled until the request finishes, a toast reports the outcome, and the table refreshes without flashing skeletons

#### Scenario: Double click on resend

- **WHEN** the caller clicks resend twice on the same invite
- **THEN** only one resend request is sent
