import { useTranslation } from 'react-i18next';
import { useState } from 'react';
import { useNavigate, useOutletContext } from 'react-router';
import apiClient from '../../config/API/axiosConfig.js';
import { Card, Button, PasswordInput, Text, Alert, Box } from '@mantine/core';
import { IconAlertCircle } from '@tabler/icons-react';
import { notifySuccess } from '../../utils/notifications.js';
import { currentPath, loginRedirectPath } from '../../utils/safeNext.js';
import { invalidateSessionCaches } from '../../utils/sessionCaches.js';

const PasswordUpdateForm = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  //* UserWrapper's outlet context - the email fills the hidden username
  //* field so password managers update the right saved credential
  const email = useOutletContext()?.user?.email ?? '';
  const [errorMessage, setErrorMessage] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (loading) {
      return;
    }

    setLoading(true);
    setErrorMessage(null);

    //* Captured before the await - React reuses the event object afterwards
    const form = e.currentTarget;
    const passwordUpdateData = {
      currentPassword: form.elements.currentPassword.value,
      newPassword: form.elements.newPassword.value,
    };

    try {
      await apiClient.patch('/api/v1/auth/update-user-password', passwordUpdateData);
      form.reset();
      notifySuccess(t('auth.passwordUpdate.success'));
    } catch (error) {
      const { status, data } = error.response ?? {};

      //* This endpoint sits under /api/v1/auth/, which the global 401
      //* interceptor skips - an expired session is handled here
      if (status === 401) {
        invalidateSessionCaches();
        navigate(loginRedirectPath(currentPath()), { replace: true });
        return;
      }

      const errorCode = status === 400 ? data?.code : null;

      if (errorCode === 'AUTH_CURRENT_PASSWORD_INCORRECT') {
        setErrorMessage(t('auth.passwordUpdate.errors.currentPassword'));
      } else if (errorCode === 'AUTH_PASSWORD_UNCHANGED') {
        setErrorMessage(t('auth.passwordUpdate.errors.samePassword'));
      } else if (status === 400 || status === 422) {
        setErrorMessage(t('auth.passwordUpdate.errors.invalid'));
      } else {
        // Network errors, server errors
        setErrorMessage(t('auth.passwordUpdate.errors.unexpected'));
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card shadow="sm" padding="lg" radius="md" withBorder mt="lg">
      <Text size="lg" fw={600} mb="md">
        {t('auth.passwordUpdate.title')}
      </Text>

      {errorMessage && (
        <Box mb="md">
          <Alert icon={<IconAlertCircle size="1rem" />} title={t('common.error')} color="red">
            <Text>{errorMessage}</Text>
          </Alert>
        </Box>
      )}

      <form onSubmit={handleSubmit}>
        {/* Never shown or read by the submit handler - only for password managers */}
        <input type="email" name="username" autoComplete="username" value={email} readOnly hidden />

        <PasswordInput
          label={t('auth.passwordUpdate.currentPassword')}
          name="currentPassword"
          autoComplete="current-password"
          placeholder={t('auth.passwordUpdate.currentPasswordPlaceholder')}
          required
          mb="md"
        />

        <PasswordInput
          label={t('auth.passwordUpdate.newPassword')}
          name="newPassword"
          autoComplete="new-password"
          placeholder={t('auth.passwordUpdate.newPasswordPlaceholder')}
          required
          mb="md"
        />

        <Button type="submit" loading={loading} fullWidth>
          {t('auth.passwordUpdate.submit')}
        </Button>
      </form>
    </Card>
  );
};

export default PasswordUpdateForm;
