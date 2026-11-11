import { NavLink } from 'react-router';
import { useTranslation } from 'react-i18next';
import { Button } from '@mantine/core';

export const LogInButton = () => {
  const { t } = useTranslation();

  return (
    <Button component={NavLink} to="/auth/login" variant="default" size="sm">
      {t('nav.login')}
    </Button>
  );
};

export default LogInButton;
