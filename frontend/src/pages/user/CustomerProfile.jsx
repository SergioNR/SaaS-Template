import { useTranslation } from 'react-i18next';
import { Box, Title } from '@mantine/core';
import PasswordUpdateForm from '../../components/auth/PasswordUpdateForm';
import Seo from '../../components/Seo.jsx';
import { AccountActionsForm } from './AccountActionsForm';

const CustomerProfile = () => {
  const { t } = useTranslation();

  return (
    <Box maw={600} mx="auto" mt="xl">
      <Seo title={t('seo.pages.profile')} />
      <Title order={2}>{t('user.profile.title')}</Title>
      <PasswordUpdateForm />
      <AccountActionsForm />
    </Box>
  );
};

export default CustomerProfile;
