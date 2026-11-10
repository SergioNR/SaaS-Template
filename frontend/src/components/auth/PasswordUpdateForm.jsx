import { useTranslation } from 'react-i18next';
import { useState } from 'react';
import apiClient from '../../config/API/axiosConfig.js';
import { Card, Button, TextInput, Text, Alert, Box } from '@mantine/core';
import { IconAlertCircle } from '@tabler/icons-react';
import { notifySuccess } from '../../utils/notifications.js';

const PasswordUpdateForm = () => {
  const { t } = useTranslation();
  const [errorMessage, setErrorMessage] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setErrorMessage(null);

    //* Captured before the await - React reuses the event object afterwards
    const form = e.currentTarget;
    const passwordUpdateData = {
      currentPassword: form.currentPassword.value,
      newPassword: form.newPassword.value,
    };

    try {
      await apiClient.patch('/api/v1/auth/update-user-password', passwordUpdateData);
      form.reset();
      notifySuccess(t('auth.passwordUpdate.success'));
    } catch (error) {
      const { status, data } = error.response ?? {};
      const errorCode = status === 400 ? data?.code : null;

      if (errorCode === 'AUTH_CURRENT_PASSWORD_INCORRECT') {
        setErrorMessage(t('auth.passwordUpdate.errors.currentPassword'));
      } else if (errorCode === 'AUTH_PASSWORD_UNCHANGED') {
        setErrorMessage(t('auth.passwordUpdate.errors.samePassword'));
      } else if (status === 400 || status === 422) {
        setErrorMessage(t('auth.passwordUpdate.errors.invalid'));
      } else {
        // Handle other errors (network errors, server errors, expired session, etc)
        setErrorMessage(t('auth.passwordUpdate.errors.unexpected'));
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card shadow="sm" padding="lg" radius="md" withBorder mt="lg">
      <Text size="lg" fw={600} mb="md">{t('auth.passwordUpdate.title')}</Text>

      {errorMessage && (
        <Box mb="md">
          <Alert icon={<IconAlertCircle size="1rem" />} title={t('common.error')} color="red">
            <Text>{errorMessage}</Text>
          </Alert>
        </Box>
      )}

      <form onSubmit={handleSubmit}>
        <TextInput
          label={t('auth.passwordUpdate.username')}
          name="username"
          type="text"
          autoComplete='username'
          placeholder={t('auth.passwordUpdate.usernamePlaceholder')}
          mb="md"
          style={{ display: 'none' }}
        />

        <TextInput
          label={t('auth.passwordUpdate.currentPassword')}
          name="currentPassword"
          type="password"
          autoComplete='current-password'
          placeholder={t('auth.passwordUpdate.currentPasswordPlaceholder')}
          required
          mb="md"
        />

        <TextInput
          label={t('auth.passwordUpdate.newPassword')}
          name="newPassword"
          type="password"
          autoComplete='new-password'
          placeholder={t('auth.passwordUpdate.newPasswordPlaceholder')}
          required
          mb="md"
        />

        <Button
          type="submit"
          loading={loading}
          fullWidth
        >
          {t('auth.passwordUpdate.submit')}
        </Button>
      </form>
    </Card>
  );
};

export default PasswordUpdateForm;
