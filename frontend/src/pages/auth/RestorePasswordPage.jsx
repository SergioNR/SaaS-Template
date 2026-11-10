import { useTranslation } from 'react-i18next';
import apiClient from '../../config/API/axiosConfig.js';
import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { Anchor, Box, Button, Center, Container, Group, Paper, PasswordInput, Title, Alert } from '@mantine/core';
import { IconAlertCircle, IconCheck, IconArrowLeft } from '@tabler/icons-react';
import classes from '../../components/auth/ForgotPassword.module.css';
import PageLoader from '../../components/PageLoader.jsx';
import Seo from '../../components/Seo.jsx';
import { scrubQueryFromAddressBar } from '../../utils/scrubUrlToken.js';

//* Token check outcome: 'checking' | 'valid' | 'invalid' (unknown, expired or
//* used - request a new link) | 'error' (network/server - retry the check)
const tokenStateFor = (err) => {
  const status = err?.response?.status;

  return status === 400 || status === 404 || status === 422 ? 'invalid' : 'error';
};

const RestorePasswordPage = () => {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  //* Read once: the token is then scrubbed from the address bar
  const [passwordResetToken] = useState(() => searchParams.get('passwordResetToken'));
  const [tokenState, setTokenState] = useState(passwordResetToken ? 'checking' : 'invalid');
  const [checkAttempt, setCheckAttempt] = useState(0);
  const [passwordUpdated, setPasswordUpdated] = useState(false);
  const [passwordMismatch, setPasswordMismatch] = useState(false);
  const [submitError, setSubmitError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    scrubQueryFromAddressBar();
  }, []);

  useEffect(() => {
    if (!passwordResetToken) {
      return undefined;
    }

    const controller = new AbortController();

    setTokenState('checking');

    // `params` URL-encodes the opaque token
    apiClient
      .get('/api/v1/auth/password-reset', {
        params: { passwordResetToken },
        signal: controller.signal,
      })
      .then(() => setTokenState('valid'))
      .catch((err) => {
        if (!controller.signal.aborted) {
          setTokenState(tokenStateFor(err));
        }
      });

    return () => controller.abort();
  }, [passwordResetToken, checkAttempt]);

  const updateRecoveredPassword = async (e) => {
    e.preventDefault();

    if (submitting) {
      return;
    }

    const form = e.currentTarget;
    const newPassword = form.newPassword.value;
    const confirmNewPassword = form.confirmNewPassword.value;

    if (newPassword !== confirmNewPassword) {
      setPasswordMismatch(true);
      return;
    }

    setPasswordMismatch(false);
    setSubmitError(null);
    setSubmitting(true);

    try {
      await apiClient.patch('/api/v1/auth/password-reset', {
        passwordResetToken,
        newPassword,
        confirmNewPassword,
      });

      setPasswordUpdated(true);
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

  const renderBody = () => {
    if (tokenState === 'checking') {
      return <PageLoader />;
    }

    if (passwordUpdated) {
      return (
        <Paper shadow="xs" p={20} mt="xl" radius="md">
          <Alert icon={<IconCheck size="1rem" />} color="green" title={t('common.success')}>
            {t('auth.restore.success')}
          </Alert>

          <Center mt="xl">
            <Button component={Link} to="/auth/login" variant="outline" leftSection={<IconArrowLeft size="1rem" />}>
              {t('auth.restore.backToLogin')}
            </Button>
          </Center>
        </Paper>
      );
    }

    if (tokenState === 'error') {
      return (
        <Paper shadow="xs" p={20} mt="xl" radius="md">
          <Alert icon={<IconAlertCircle size="1rem" />} title={t('auth.restore.checkErrorTitle')} color="red">
            {t('auth.restore.checkErrorBody')}
          </Alert>

          <Center mt="xl">
            <Button variant="outline" onClick={() => setCheckAttempt((n) => n + 1)}>
              {t('common.retry')}
            </Button>
          </Center>
        </Paper>
      );
    }

    if (tokenState === 'invalid') {
      return (
        <Paper shadow="xs" p={20} mt="xl" radius="md">
          <Alert icon={<IconAlertCircle size="1rem" />} title={t('auth.restore.invalidLinkTitle')} color="red">
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
      );
    }

    return (
      <Paper withBorder shadow="md" p={30} radius="md" mt="xl">
        <form onSubmit={updateRecoveredPassword}>
          <PasswordInput
            name="newPassword"
            label={t('auth.restore.newPassword')}
            placeholder={t('auth.restore.newPasswordPlaceholder')}
            autoComplete="new-password"
            required
            mt="md"
          />

          <PasswordInput
            name="confirmNewPassword"
            label={t('auth.restore.confirmNewPassword')}
            placeholder={t('auth.restore.confirmNewPasswordPlaceholder')}
            autoComplete="new-password"
            required
            mt="md"
          />

          {passwordMismatch && (
            <Alert icon={<IconAlertCircle size="1rem" />} title={t('common.error')} color="red" mt="md">
              {t('auth.restore.passwordMismatch')}
            </Alert>
          )}

          {submitError && (
            <Alert icon={<IconAlertCircle size="1rem" />} title={t('common.error')} color="red" mt="md">
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
            <Button type="submit" className={classes.control} loading={submitting}>
              {t('auth.restore.submit')}
            </Button>
          </Group>
        </form>
      </Paper>
    );
  };

  return (
    <Container size={460} my={30}>
      <Seo title={t('seo.pages.restore')} />
      <Title className={classes.title} ta="center">
        {t('auth.restore.title')}
      </Title>

      {renderBody()}
    </Container>
  );
};

export default RestorePasswordPage;
