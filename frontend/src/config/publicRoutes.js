//* Indexable public routes - the source for the build-time sitemap.xml
//* (vite.config.js). Keep in sync with the IndexWrapper routes in main.jsx;
//* these are also the only pages whose <Seo> passes a `path`
export const PUBLIC_ROUTES = ['/', '/pricing', '/preguntas-frecuentes', '/terminos-condiciones'];

//* Private areas crawlers have no business fetching. Auth pages are not
//* listed: they stay crawlable so their `noindex` meta is seen
export const DISALLOWED_PREFIXES = ['/admin', '/dashboard', '/user'];

export const buildRobotsTxt = (siteBaseUrl) =>
  [
    'User-agent: *',
    'Allow: /',
    ...DISALLOWED_PREFIXES.map((prefix) => `Disallow: ${prefix}`),
    '',
    `Sitemap: ${siteBaseUrl}/sitemap.xml`,
    '',
  ].join('\n');

export const buildSitemapXml = (siteBaseUrl) =>
  [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...PUBLIC_ROUTES.map((route) => `  <url><loc>${siteBaseUrl}${route}</loc></url>`),
    '</urlset>',
    '',
  ].join('\n');
