import PropTypes from 'prop-types';
import { useTranslation } from 'react-i18next';
import { normalizeSiteOrigin } from '../config/siteOrigin.js';

export const DEFAULT_OG_IMAGE_PATH = '/og-image.png';

//* `robots` defaults from `path`: public pages pass a canonical `path` and are
//* indexable; internal pages (auth, user, admin, 404) pass `title` only and
//* get noindex. Pass `robots` explicitly to override either way
export const Seo = ({ title, description, path, type = 'website', robots, image = DEFAULT_OG_IMAGE_PATH }) => {
  const { t } = useTranslation();

  //* Same normalisation as the build-time sitemap, so canonicals match it
  const baseUrl = normalizeSiteOrigin(import.meta.env.VITE_SITE_BASE_URL);
  const siteName = t('common.siteName');
  const fullTitle = title ? `${title} · ${siteName}` : t('seo.defaultTitle');
  const resolvedDescription = description ?? t('seo.defaultDescription');
  const url = baseUrl && path ? `${baseUrl}${path}` : null;
  const resolvedRobots = robots ?? (path ? 'index, follow' : 'noindex, nofollow');
  //* Social crawlers need an absolute image URL
  const imageUrl = image && baseUrl && image.startsWith('/') ? `${baseUrl}${image}` : image;

  return (
    <>
      <title>{fullTitle}</title>
      <meta name="description" content={resolvedDescription} />
      <meta name="robots" content={resolvedRobots} />
      {url && <link rel="canonical" href={url} />}
      {url && <meta property="og:url" content={url} />}
      <meta property="og:title" content={fullTitle} />
      <meta property="og:description" content={resolvedDescription} />
      <meta property="og:type" content={type} />
      <meta property="og:site_name" content={siteName} />
      <meta property="og:locale" content="es_ES" />
      {imageUrl && <meta property="og:image" content={imageUrl} />}
      {imageUrl && <meta property="og:image:alt" content={siteName} />}
      <meta name="twitter:card" content={imageUrl ? 'summary_large_image' : 'summary'} />
      <meta name="twitter:title" content={fullTitle} />
      <meta name="twitter:description" content={resolvedDescription} />
      {imageUrl && <meta name="twitter:image" content={imageUrl} />}
    </>
  );
};

Seo.propTypes = {
  title: PropTypes.string,
  description: PropTypes.string,
  path: PropTypes.string,
  type: PropTypes.string,
  robots: PropTypes.string,
  image: PropTypes.string,
};

export default Seo;
