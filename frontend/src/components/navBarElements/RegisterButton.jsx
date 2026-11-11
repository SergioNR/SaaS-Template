import { NavLink } from 'react-router';
import { useTranslation } from 'react-i18next';
import { Button } from '@mantine/core';

export const RegisterButton = () => {
  const { t } = useTranslation();

  return (
    <Button component={NavLink} to="/auth/register" variant="filled" color="blue" size="sm">
      {t('nav.register')}
    </Button>
  );
};

export default RegisterButton;
