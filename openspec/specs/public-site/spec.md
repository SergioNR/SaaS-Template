# public-site Specification

## Purpose
Owns the template's public marketing site and its discoverability and privacy surface: the public pages and their navigation, per-page SEO metadata and indexing rules for every page in the app, the build-time `robots.txt` and `sitemap.xml`, plan prices rendered from configuration, the opt-in analytics consent banner, when and how the analytics client loads, URL sanitizing of analytics events, and scrubbing one-time tokens from the address bar. Routing, guards and layouts shared with other areas are owned by `app-shell`; checkout and subscriptions by `billing`; token validation by `auth` and `team-management`.

## Requirements

### Requirement: The public site serves home, pricing, FAQ and terms pages

The web app SHALL serve, inside a layout with the site navigation bar and footer, a homepage at `/` (hero with a registration call to action, how-it-works, a dashboard preview placeholder, features and the FAQ section), a pricing page at `/pricing`, an FAQ page at `/preguntas-frecuentes` (the same FAQ section as on the homepage) and a terms page at `/terminos-condiciones`. The public pages SHALL be reachable without a session.

#### Scenario: Anonymous visitor opens the homepage

- **WHEN** a visitor without a session opens `/`
- **THEN** the homepage renders with the navigation bar, the hero call to action to register, and the footer

#### Scenario: FAQ page

- **WHEN** a visitor opens `/preguntas-frecuentes`
- **THEN** the same FAQ content shown on the homepage renders as its own page

### Requirement: Public navigation exposes the site sections and entry points

The site navigation bar SHALL link the brand to `/` and list home, pricing and FAQ, plus login and register actions. Below the small breakpoint those links SHALL move into a menu toggled by a burger exposing its open state and controlled menu; choosing a link or widening the window past the breakpoint SHALL close it. The auth area SHALL show a reduced bar with only the brand link back to `/`.

#### Scenario: Mobile menu

- **WHEN** a visitor on a narrow screen opens the burger and taps the pricing link
- **THEN** the pricing page renders and the menu closes

#### Scenario: Auth area header

- **WHEN** a visitor opens `/auth/register`
- **THEN** the header shows only the brand link back to the homepage

### Requirement: The site footer links the public pages

The public site, the auth area and the not-found page SHALL render a footer with the brand and tagline, links to pricing, FAQ and terms, a contact email link, and the copyright with the current year.

#### Scenario: Footer on an auth page

- **WHEN** a visitor opens `/auth/login`
- **THEN** the footer with pricing, FAQ, terms and contact links renders below the form

### Requirement: Plan prices render from plan configuration

The app SHALL render every plan price from the plan configuration (amount and currency), never from hardcoded copy, formatted for the Spanish locale with no decimals for whole amounts and exactly two decimals for fractional amounts. The pricing page SHALL render one card per configured plan with its name, monthly price, a VAT-included note, a subtitle, a feature list and a registration call to action. The billing page SHALL use the same formatting (see `billing`).

#### Scenario: Whole amount

- **WHEN** the configured plan costs 29 EUR
- **THEN** the pricing card shows the price as 29 € per month, with no decimals

#### Scenario: Fractional amount

- **WHEN** a plan is configured at 29.5 EUR
- **THEN** the price renders as 29,50 €

#### Scenario: Plan amount changes

- **WHEN** the configured amount changes and the app is rebuilt
- **THEN** the pricing page and the billing page both show the new amount with no copy change

### Requirement: Every page renders its own SEO metadata

Every routed page SHALL set a title of the form "<page title> · <site name>", distinct from every other page, a meta description (the page's own for public pages, a default otherwise), a robots meta, Open Graph title, description, type, site name, `es_ES` locale and image with alt text, and Twitter title, description and image with a large-image card. The default image SHALL be `og-image.png`, absolute on the site origin. The static HTML shell SHALL carry only a fallback title.

#### Scenario: Pricing page metadata

- **WHEN** the pricing page renders
- **THEN** the title is the pricing title followed by the site name, and the description, Open Graph and Twitter tags describe the pricing page with an absolute image URL

#### Scenario: Distinct titles

- **WHEN** a user moves from the profile page to the team page
- **THEN** the document title changes to the team page's own title

### Requirement: Only public pages are indexable and canonical

Public pages (home, pricing, FAQ, terms) SHALL emit `index, follow` robots, a canonical link and an `og:url` built from the configured site origin and the page path. All other pages (auth, user, admin, not-found) SHALL emit `noindex, nofollow` and no canonical link or `og:url`.

#### Scenario: Public page

- **WHEN** `/terminos-condiciones` renders with site origin `https://example.com`
- **THEN** the robots meta is `index, follow` and the canonical link is `https://example.com/terminos-condiciones`

#### Scenario: Internal page

- **WHEN** `/auth/login` or `/dashboard` renders
- **THEN** the robots meta is `noindex, nofollow` and no canonical link is present

### Requirement: Production builds emit robots.txt and sitemap.xml from the public routes

A production build SHALL fail when the site origin or the API base URL is not configured, and SHALL emit a `robots.txt` that allows crawling, disallows `/admin`, `/dashboard` and `/user`, leaves the auth pages crawlable (so their noindex is seen) and points to the sitemap; and a `sitemap.xml` that lists exactly the public routes (`/`, `/pricing`, `/preguntas-frecuentes`, `/terminos-condiciones`) as absolute URLs on the configured origin, with any trailing slash on the origin removed.

#### Scenario: Build with an origin

- **WHEN** the app is built with site origin `https://example.com/`
- **THEN** `robots.txt` ends with `Sitemap: https://example.com/sitemap.xml` and `sitemap.xml` lists `https://example.com/pricing` among the four public URLs

#### Scenario: Build without an origin

- **WHEN** a production build runs without the site origin configured
- **THEN** the build fails with an error instead of emitting pages without canonical URLs

### Requirement: Analytics requires explicit opt-in consent

When analytics is configured, the app SHALL show a consent banner (a labelled region with an explanation, a link to the terms page, and decline and accept actions) on every area to visitors who have not chosen yet, SHALL remember the choice per browser and hide the banner once made, and SHALL capture or persist nothing until the visitor accepts. Without browser storage the choice SHALL last for the page load only. Without analytics configured, no banner or consent control SHALL render.

#### Scenario: First visit

- **WHEN** a visitor with no stored choice opens any page on a build with analytics configured
- **THEN** the consent banner renders and no analytics events are sent

#### Scenario: Visitor declines

- **WHEN** the visitor declines
- **THEN** the banner closes, the choice is remembered, and analytics stays off on later visits without asking again

#### Scenario: Analytics not configured

- **WHEN** the build has no analytics key
- **THEN** neither the banner nor the footer consent control renders

### Requirement: Consent can be changed from the footer

When analytics is configured, the site footer SHALL offer a cookie-preferences control that stops any active capturing, forgets the stored choice and shows the consent banner again.

#### Scenario: Visitor withdraws consent

- **WHEN** a visitor who accepted analytics activates the footer preferences control
- **THEN** capturing stops immediately and the consent banner reappears

### Requirement: The analytics client loads only after consent and after first paint

The app SHALL NOT download the analytics client unless analytics is configured and the visitor has accepted. For a visitor who accepted earlier it SHALL load the client after first paint, when the browser is idle and at most 5 seconds later; for one who accepts during the visit, at that moment. If consent is withdrawn during the download, capturing SHALL NOT start. If the download fails, analytics SHALL stay off and loading SHALL be retried on the next acceptance.

#### Scenario: Visitor who never accepted

- **WHEN** a visitor who has not accepted analytics browses the site
- **THEN** the analytics library is never requested from the network

### Requirement: Identity and error reporting follow consent

User identification, identity reset on logout or account deletion, and error reports SHALL be no-ops without consent. A user signed in before consenting SHALL be identified once consent is given. After logout or account deletion a consenting visitor SHALL keep being captured anonymously.

#### Scenario: Consent given mid-session

- **WHEN** a signed-in user accepts the banner from inside the user area
- **THEN** the analytics client loads, starts capturing and identifies that user

#### Scenario: Logout with consent

- **WHEN** a consenting user logs out
- **THEN** the analytics identity is reset and capturing continues anonymously

### Requirement: Analytics events never carry query strings or fragments

Before any analytics event is sent, the app SHALL strip the query string and fragment from every URL-shaped property of the event (current URL, pathname, referrer, initial and session-entry URLs and referrers, previous pageview URL and pathname, href) and from link hrefs in autocaptured element chains, including the person properties set or set once with the event. Non-URL values SHALL pass through unchanged.

#### Scenario: Pageview on a token page

- **WHEN** a pageview is captured on `/auth/restore-password?passwordResetToken=abc`
- **THEN** the event's current URL property is sent as the origin plus `/auth/restore-password` only

#### Scenario: Clicked link with query

- **WHEN** an autocaptured click targets a link to `/user/billing?checkout=success#top`
- **THEN** the recorded href is `/user/billing`

### Requirement: Token pages scrub the token from the address bar

Pages that receive a one-time token in the URL (password restore and invite acceptance) SHALL read the token once on load, keep it in page state for their requests, and immediately replace the address bar URL with the bare path, removing the query string and fragment without adding a history entry. Token validation outcomes are owned by `auth` and `team-management`.

#### Scenario: Opening a password reset link

- **WHEN** a visitor opens `/auth/restore-password?passwordResetToken=abc`
- **THEN** the address bar shows `/auth/restore-password` and the page still validates and uses the token

#### Scenario: Back navigation after scrubbing

- **WHEN** the visitor presses back after the token was scrubbed
- **THEN** they leave the page instead of returning to a URL containing the token
