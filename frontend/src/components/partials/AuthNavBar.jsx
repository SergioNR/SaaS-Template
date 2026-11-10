import { Link } from 'react-router';
import { useTranslation } from 'react-i18next';
import { Anchor, Group, Image, Text } from '@mantine/core';
import classes from './AuthNavBar.module.css';

//* Auth area top bar: brand link back to the public site
export function AuthNavBar() {
  const { t } = useTranslation();

  return (
    <header className={classes.bar}>
      <Anchor component={Link} to="/" underline="never" className={classes.brand}>
        <Group gap="xs" wrap="nowrap">
          <Image src="/logo.svg" alt={t('common.logoAlt')} h={32} w={32} />
          <Text fw={700} size="lg" component="span">
            {t('common.siteName')}
          </Text>
        </Group>
      </Anchor>
    </header>
  );
}

export default AuthNavBar;
