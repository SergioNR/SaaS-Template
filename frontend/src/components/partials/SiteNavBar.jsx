import { useEffect, useState } from 'react';
import { Link, NavLink } from 'react-router';
import { useTranslation } from 'react-i18next';
import { Anchor, Burger, Group, Image, Text } from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import LogInButton from '../navBarElements/LogInButton.jsx';
import RegisterButton from '../navBarElements/RegisterButton.jsx';
import styles from './SiteNavBar.module.css';

const NAV_LINKS = [
  { to: '/', key: 'nav.home' },
  { to: '/pricing', key: 'nav.pricing' },
  { to: '/preguntas-frecuentes', key: 'nav.faq' },
];

const MOBILE_NAV_ID = 'site-mobile-nav';
//* Matches the 48em (sm) breakpoint in SiteNavBar.module.css
const DESKTOP_QUERY = '(min-width: 48em)';

export const SiteNavBar = () => {
  const { t } = useTranslation();
  const [mobileMenuOpened, setMobileMenuOpened] = useState(false);
  const isDesktop = useMediaQuery(DESKTOP_QUERY);

  //* Widening the window past the breakpoint closes the mobile menu, so it
  //* is not still open (duplicated nav) when the window narrows again
  useEffect(() => {
    if (isDesktop) {
      setMobileMenuOpened(false);
    }
  }, [isDesktop]);

  return (
    <header className={styles.header}>
      <Anchor component={Link} to="/" underline="never" className={styles.brand}>
        <Group gap="xs" wrap="nowrap">
          <Image src="/logo.svg" alt={t('common.logoAlt')} h={32} w={32} />
          <Text fw={700} size="lg" component="span">
            {t('common.siteName')}
          </Text>
        </Group>
      </Anchor>

      <nav className={styles.navLinks} aria-label={t('nav.main')}>
        {NAV_LINKS.map(({ to, key }) => (
          <Anchor key={key} component={NavLink} to={to} className={styles.link} underline="never">
            {t(key)}
          </Anchor>
        ))}
      </nav>

      <div className={styles.buttonContainer}>
        <LogInButton />
        <RegisterButton />
      </div>

      <Burger
        opened={mobileMenuOpened}
        onClick={() => setMobileMenuOpened((opened) => !opened)}
        className={styles.mobileMenuButton}
        hiddenFrom="sm"
        size="sm"
        aria-label={t('nav.menu')}
        aria-controls={MOBILE_NAV_ID}
        aria-expanded={mobileMenuOpened}
      />

      <nav
        id={MOBILE_NAV_ID}
        aria-label={t('nav.main')}
        className={`${styles.mobileNav} ${mobileMenuOpened ? styles.mobileNavOpen : ''}`}
      >
        {NAV_LINKS.map(({ to, key }) => (
          <Anchor
            key={key}
            component={NavLink}
            to={to}
            className={styles.link}
            underline="never"
            onClick={() => setMobileMenuOpened(false)}
          >
            {t(key)}
          </Anchor>
        ))}
        <div className={styles.mobileButtonContainer}>
          <LogInButton />
          <RegisterButton />
        </div>
      </nav>
    </header>
  );
};

export default SiteNavBar;
