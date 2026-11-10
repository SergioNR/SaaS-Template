import { useTranslation } from 'react-i18next';
import classes from './SkipLink.module.css';

export const MAIN_CONTENT_ID = 'main-content';

//* First focusable element of every layout: lets keyboard users jump past the
//* navigation straight to <main id="main-content">. Visible only on focus
export function SkipLink() {
  const { t } = useTranslation();

  return (
    <a href={`#${MAIN_CONTENT_ID}`} className={classes.skipLink}>
      {t('nav.skipToContent')}
    </a>
  );
}

export default SkipLink;
