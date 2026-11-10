import { useState } from 'react';
import { useNavigate } from 'react-router';
import { useTranslation } from 'react-i18next';
import { usePostHog } from 'posthog-js/react';
import apiClient from '../../config/API/axiosConfig.js';

import {
  Card,
  Button,
  Modal,
  Stack,
  Title,
  Text,
  Group,
} from '@mantine/core';
import { notifyError, notifySuccess } from '../../utils/notifications.js';
import { logApiError } from '../../utils/logApiError.js';

const analyticsEnabled = Boolean(import.meta.env.VITE_PUBLIC_POSTHOG_KEY);

export const AccountActionsForm = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const posthog = usePostHog();
  const [confirmOpened, setConfirmOpened] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const deleteUser = async () => {
    setDeleting(true);

    try {
      await apiClient.delete('/api/v1/user');

      if (analyticsEnabled) {
        posthog?.reset();
      }

      notifySuccess(t('user.accountActions.deletedToast'));
      navigate('/', { replace: true });
    } catch (err) {
      logApiError('Account deletion failed', err);

      //* The last company owner cannot leave while other members remain
      if (err?.response?.status === 409 && err?.response?.data?.code === 'USER_LAST_COMPANY_OWNER') {
        notifyError(t('user.accountActions.deleteLastOwner'));
      } else {
        notifyError(t('user.accountActions.deleteError'));
      }

      setDeleting(false);
      setConfirmOpened(false);
    }
  };

  return (
    <Card shadow="sm" padding="lg" radius="md" withBorder mt="lg">
      <Title order={3} mb="md">{t('user.accountActions.title')}</Title>
      <Text size="sm" c="dimmed" mb="md">
        {t('user.accountActions.description')}
      </Text>

      <Group justify="left" mt="md">
        <Button
          color="red"
          onClick={() => setConfirmOpened(true)}
        >
          {t('user.accountActions.delete')}
        </Button>
      </Group>

      <Modal
        opened={confirmOpened}
        onClose={() => setConfirmOpened(false)}
        title={t('user.accountActions.deleteConfirmModal.title')}
      >
        <Stack>
          <Text size="sm">
            {t('user.accountActions.deleteConfirmModal.description')}
          </Text>
          <Group justify="flex-end">
            <Button variant="default" onClick={() => setConfirmOpened(false)} disabled={deleting}>
              {t('user.accountActions.deleteConfirmModal.cancel')}
            </Button>
            <Button color="red" onClick={deleteUser} loading={deleting}>
              {t('user.accountActions.deleteConfirmModal.confirm')}
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Card>
  );
};

export default AccountActionsForm;
