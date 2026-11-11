//* Normalises VITE_SITE_BASE_URL so `${origin}${path}` never yields `//`:
//* trims surrounding whitespace and strips every trailing slash. Shared by
//* vite.config.js (robots.txt/sitemap.xml) and Seo.jsx (canonical, og:url,
//* absolute image URLs) - must stay free of import.meta.env so the Vite
//* config can import it
export const normalizeSiteOrigin = (value) => {
  if (typeof value !== 'string') {
    return '';
  }

  return value.trim().replace(/\/+$/, '');
};

export default normalizeSiteOrigin;
