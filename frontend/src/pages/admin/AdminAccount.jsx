import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Box, Card, Skeleton, Text, Title } from '@mantine/core';
import apiClient from '../../config/API/axiosConfig.js';
import Seo from '../../components/Seo.jsx';
import DetailRow from '../../components/DetailRow.jsx';
import PasswordUpdateForm from '../../components/auth/PasswordUpdateForm.jsx';
import { AccountActionsForm } from '../user/AccountActionsForm.jsx';

//* Superadmin self-service (/admin/account): superadmins never enter the user
//* area, so they change their password and delete their account here. The
//* session payload carries only id/role - the email comes from GET
//* /api/v1/user (admitted for both platform roles), fetched once per mount
export const AdminAccount = () => {
  const { t } = useTranslation();
  const [email, setEmail] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();

    apiClient
      .get('/api/v1/user', { signal: controller.signal })
      .then((response) => setEmail(response.data?.user?.email ?? null))
      .catch(() => {
        //* Secondary data - the forms still work without it
        if (!controller.signal.aborted) {
          setEmail(null);
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      });

    return () => controller.abort();
  }, []);

  return (
    <Box maw={600} mx="auto" mt="xl">
      <Seo title={t('seo.pages.adminAccount')} />
      <Title order={2}>{t('admin.account.title')}</Title>

      <Card shadow="sm" padding="lg" radius="md" withBorder mt="lg">
        <DetailRow label={t('admin.account.email')}>
          {loading ? (
            <Skeleton height={16} width={200} />
          ) : (
            <Text size="sm" fw={500}>
              {email ?? t('admin.account.emailUnavailable')}
            </Text>
          )}
        </DetailRow>
      </Card>

      <PasswordUpdateForm email={email ?? ''} />
      <AccountActionsForm variant="superadmin" />
    </Box>
  );
};

export default AdminAccount;
