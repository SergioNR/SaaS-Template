import { Alert, Button, Group, Text } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import { useSubscription } from '../../contexts/useSubscription.js';
import { useNavigate } from 'react-router';

export const NoActiveSubscriptionBanner = () => {
  const { t } = useTranslation();
  const { hasActiveSubscription, loading, error } = useSubscription();
  const navigate = useNavigate();

  if (loading || error || hasActiveSubscription) {
    return null;
  }

  return (
    <Alert color="gray" variant="light" title={t('user.noSubscriptionBanner.title')} mb="lg">
      <Group justify="space-between" align="center" wrap="nowrap">
        <Text>{t('user.noSubscriptionBanner.body')}</Text>
        <Button size="xs" variant="filled" onClick={() => navigate('/user/billing')}>
          {t('user.noSubscriptionBanner.cta')}
        </Button>
      </Group>
    </Alert>
  );
};

export default NoActiveSubscriptionBanner;
