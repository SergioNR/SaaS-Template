import { useTranslation } from 'react-i18next';
import apiClient from '../../config/API/axiosConfig.js';
import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router';
import {
  Anchor,
  Box,
  Button,
  Center,
  Container,
  Group,
  Paper,
  PasswordInput,
  Title,
  Alert,
} from '@mantine/core';
import { IconAlertCircle, IconCheck, IconArrowLeft } from '@tabler/icons-react';
import classes from '../../components/auth/ForgotPassword.module.css';
import { Link } from 'react-router';
import PageLoader from '../../components/PageLoader.jsx';
import Seo from '../../components/Seo.jsx';

const RestorePasswordPage = () => {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const [passwordUpdateResponse, setPasswordUpdateResponse] = useState(null);
  const [passwordResetTokenValidity, setPasswordResetTokenValidity] = useState(null);
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [passwordMismatch, setPasswordMismatch] = useState(false);
  const [submitError, setSubmitError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  // Get a specific query parameter
  const passwordResetToken = searchParams.get('passwordResetToken');

  const [loading, setLoading] = useState(Boolean(passwordResetToken));

  useEffect(() => {
    const checkPasswordResetTokenValidity = async () => {
      try {
        // `params` URL-encodes the opaque token
        const response = await apiClient.get('/api/v1/auth/password-reset', {
          params: { passwordResetToken },
        });
        setPasswordResetTokenValidity(response.data);
      } catch {
        console.error('Error checking password reset token validity:');
      } finally {
        setLoading(false);
      }
    };

    if (passwordResetToken) {
      checkPasswordResetTokenValidity();
    }
  }, [passwordResetToken]);

  const updateRecoveredPassword = async (e) => {
    e.preventDefault();

    // Check if passwords match
    if (newPassword !== confirmNewPassword) {
      setPasswordMismatch(true);
      return;
    }

    setPasswordMismatch(false);
    setSubmitError(null);
    setSubmitting(true);

    try {
      const formData = {
        passwordResetToken: passwordResetToken,
        newPassword: newPassword,
        confirmNewPassword: confirmNewPassword,
      };

      const response = await apiClient.patch(`/api/v1/auth/password-reset`, formData);

      setPasswordUpdateResponse(response.data);
    } catch (err) {
      const status = err?.response?.status;

      if (status === 400) {
        setSubmitError(t('auth.restore.errors.expired'));
      } else if (status === 404) {
        setSubmitError(t('auth.restore.errors.invalidLink'));
      } else if (status === 422) {
        setSubmitError(t('auth.restore.errors.invalid'));
      } else {
        setSubmitError(t('auth.restore.errors.generic'));
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Container size={460} my={30}>
      <Seo title={t('seo.pages.restore')} />
      <Title className={classes.title} ta="center">
        {t('auth.restore.title')}
      </Title>

      {loading && <PageLoader />}

      {!loading && (passwordUpdateResponse ? (
        <Paper shadow="xs" p={20} mt="xl" radius="md">
          <Alert icon={<IconCheck size="1rem" />} color="green" title={t('common.success')}>
            {t('auth.restore.success')}
          </Alert>

          <Center mt="xl">
            <Button
              component={Link}
              to="/auth/login"
              variant="outline"
              leftSection={<IconArrowLeft size="1rem" />}
            >
              {t('auth.restore.backToLogin')}
            </Button>
          </Center>
        </Paper>
      ) : (
        passwordResetTokenValidity ? (
          <Paper withBorder shadow="md" p={30} radius="md" mt="xl">
            <form onSubmit={updateRecoveredPassword}>
              <PasswordInput
                label={t('auth.restore.newPassword')}
                placeholder={t('auth.restore.newPasswordPlaceholder')}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                autoComplete="new-password"
                required
                mt="md"
              />

              <PasswordInput
                label={t('auth.restore.confirmNewPassword')}
                placeholder={t('auth.restore.confirmNewPasswordPlaceholder')}
                value={confirmNewPassword}
                onChange={(e) => setConfirmNewPassword(e.target.value)}
                autoComplete="new-password"
                required
                mt="md"
              />

              {passwordMismatch && (
                <Alert
                  icon={<IconAlertCircle size="1rem" />}
                  title={t('common.error')}
                  color="red"
                  mt="md"
                >
                  {t('auth.restore.passwordMismatch')}
                </Alert>
              )}

              {submitError && (
                <Alert
                  icon={<IconAlertCircle size="1rem" />}
                  title={t('common.error')}
                  color="red"
                  mt="md"
                >
                  {submitError}
                </Alert>
              )}

              <Group justify="space-between" mt="lg" className={classes.controls}>
                <Anchor c="dimmed" component={Link} to="/auth/login" size="sm" className={classes.control}>
                  <Center inline>
                    <IconArrowLeft size={12} stroke={1.5} />
                    <Box ml={5}>{t('auth.backToLoginSmall')}</Box>
                  </Center>
                </Anchor>
                <Button
                  type="submit"
                  className={classes.control}
                  loading={submitting}
                >
                  {t('auth.restore.submit')}
                </Button>
              </Group>
            </form>
          </Paper>
        ) : (
          <Paper shadow="xs" p={20} mt="xl" radius="md">
            <Alert
              icon={<IconAlertCircle size="1rem" />}
              title={t('auth.restore.invalidLinkTitle')}
              color="red"
            >
              {t('auth.restore.invalidLinkBody')}
            </Alert>

            <Center mt="xl">
              <Button
                component={Link}
                to="/auth/recover-password"
                variant="outline"
                leftSection={<IconArrowLeft size="1rem" />}
              >
                {t('auth.restore.requestNewLink')}
              </Button>
            </Center>
          </Paper>
        )
      ))}
    </Container>
  );
};

export default RestorePasswordPage;
