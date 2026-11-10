# Spec Delta

## MODIFIED Requirements

### Requirement: Every page renders its own SEO metadata

Every routed page SHALL set a title of the form "<page title> · <site name>", distinct from every other page, a meta description (the page's own for public pages, else a default), a robots meta, Open Graph title, description, type, site name, `es_ES` locale and image with alt text, and Twitter title, description and image with a large-image card. The default image SHALL be `og-image.png`, absolute on the site origin minus any trailing slash. The HTML shell SHALL carry only a fallback title.

#### Scenario: Pricing page metadata

- **WHEN** the pricing page renders
- **THEN** the title is the pricing title followed by the site name, and the description, Open Graph and Twitter tags describe the pricing page with an absolute image URL

#### Scenario: Distinct titles

- **WHEN** a user moves from the profile page to the team page
- **THEN** the document title changes to the team page's own title

#### Scenario: Image URL with a trailing-slash origin

- **WHEN** the site origin is configured as `https://example.com/`
- **THEN** the Open Graph and Twitter image URLs are `https://example.com/og-image.png`

### Requirement: Only public pages are indexable and canonical

Public pages (home, pricing, FAQ, terms) SHALL emit `index, follow` robots, a canonical link and an `og:url` built from the configured site origin, with any trailing slash removed, and the page path, matching the URL listed for that page in `sitemap.xml`. All other pages (auth, user, admin, not-found) SHALL emit `noindex, nofollow` and no canonical link or `og:url`.

#### Scenario: Public page

- **WHEN** `/terminos-condiciones` renders with site origin `https://example.com`
- **THEN** the robots meta is `index, follow` and the canonical link is `https://example.com/terminos-condiciones`

#### Scenario: Origin configured with a trailing slash

- **WHEN** `/pricing` renders with site origin `https://example.com/`
- **THEN** the canonical link and `og:url` are `https://example.com/pricing`, the same URL the sitemap lists

#### Scenario: Internal page

- **WHEN** `/auth/login` or `/dashboard` renders
- **THEN** the robots meta is `noindex, nofollow` and no canonical link is present
