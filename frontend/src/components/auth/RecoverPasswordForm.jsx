import { useTranslation } from 'react-i18next';
import { IconAlertCircle, IconArrowLeft, IconCheck } from '@tabler/icons-react';
import { Alert, Anchor, Box, Button, Center, Container, Group, Paper, Text, TextInput, Title } from '@mantine/core';
import classes from './ForgotPassword.module.css';
import { Link } from 'react-router';
import apiClient from '../../config/API/axiosConfig.js';
import { useRef, useState } from 'react';
import Seo from '../Seo.jsx';
import { logApiError } from '../../utils/logApiError.js';

export const RecoverPasswordForm = () => {
  const { t } = useTranslation();
  const [recoverPasswordResponse, setRecoverPasswordResponse] = useState(null);
  const [recoverPasswordError, setRecoverPasswordError] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);

  const recoverPasswordRequest = async (e) => {
    e.preventDefault();

    if (submittingRef.current) {
      return;
    }

    submittingRef.current = true;
    setSubmitting(true);

    const data = {
      email: e.currentTarget.elements.email.value,
    };

    try {
      const response = await apiClient.post('/api/v1/auth/password-reset', data);
      setRecoverPasswordResponse(response.data);
      setRecoverPasswordError(null);
    } catch (error) {
      logApiError('Password reset request failed', error);
      setRecoverPasswordResponse(null);
      setRecoverPasswordError(
        error.response?.status === 429 ? t('auth.errors.tooManyAttempts') : t('auth.recover.error'),
      );
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  };

  return (
    <Container size={460} my={30}>
      <Seo title={t('seo.pages.recover')} />

      <Title className={classes.title} ta="center">
        {t('auth.recover.title')}
      </Title>
      <Text c="dimmed" fz="sm" ta="center">
        {t('auth.recover.subtitle')}
      </Text>

      {recoverPasswordResponse && (
        <Alert icon={<IconCheck size={16} />} color="green" mt={20}>
          {t('auth.recover.success')}
        </Alert>
      )}

      {recoverPasswordError && (
        <Alert icon={<IconAlertCircle size={16} />} color="red" mt={20}>
          {recoverPasswordError}
        </Alert>
      )}

      <Paper withBorder shadow="md" p={30} radius="md" mt="xl">
        <form onSubmit={recoverPasswordRequest} method="post">
          <TextInput
            name="email"
            type="email"
            autoComplete="email"
            label={t('auth.fields.email')}
            placeholder={t('auth.fields.emailPlaceholder')}
            required
          />
          <Group justify="space-between" mt="lg" className={classes.controls}>
            <Anchor c="dimmed" component={Link} to="/auth/login" size="sm" className={classes.control}>
              <Center inline>
                <IconArrowLeft size={12} stroke={1.5} />
                <Box ml={5}>{t('auth.backToLoginSmall')}</Box>
              </Center>
            </Anchor>
            <Button type="submit" className={classes.control} loading={submitting}>
              {t('auth.recover.submit')}
            </Button>
          </Group>
        </form>
      </Paper>
    </Container>
  );
};

export default RecoverPasswordForm;
