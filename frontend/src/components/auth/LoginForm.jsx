import { useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import {
  Anchor,
  Button,
  Container,
  Group,
  Paper,
  PasswordInput,
  Text,
  TextInput,
  Title,
  Alert,
} from '@mantine/core';
import { IconAlertCircle, IconCheck } from '@tabler/icons-react';
import classes from './AuthenticationTitle.module.css';
import apiClient from '../../config/API/axiosConfig.js';
import { Link } from 'react-router';
import Seo from '../Seo.jsx';
import { NEXT_PARAM, safeNextPath } from '../../utils/safeNext.js';
import { invalidateSessionCaches } from '../../utils/sessionCaches.js';

export function LoginForm() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [loginResponse, setLoginResponse] = useState(null);
  //* State drives the button spinner; the ref blocks a second submit that
  //* lands before the re-render (double Enter / double click)
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);

  const handleLogin = async (e) => {
    e.preventDefault();

    if (submittingRef.current) {
      return;
    }

    submittingRef.current = true;
    setSubmitting(true);
    // Reset messages
    setLoginResponse(null);

    const data = {
      username: e.target.username.value,
      password: e.target.password.value,
    };

    try {
      const loginResponse = await apiClient.post('/api/v1/auth/login', data);

      //* A new session must never see the previous one's cached data
      invalidateSessionCaches();

      //* `next` (set by the 401 redirect) wins when it is a safe same-origin
      //* path; the area wrappers still bounce a wrong-role target
      const next = safeNextPath(searchParams.get(NEXT_PARAM));
      const home = loginResponse.data.user.role === 'superadmin' ? '/admin' : '/dashboard';

      return navigate(next ?? home, { replace: true });
    } catch (error) {
      submittingRef.current = false;
      setSubmitting(false);

      const status = error.response?.status;

      //* 422 = malformed email - from the user's point of view the same as
      //* wrong credentials; 429 = login rate limit
      if (status === 401 || status === 422) {
        setLoginResponse({
          type: 'error',
          message: t('auth.login.errors.invalidCredentials'),
        });
      } else if (status === 429) {
        setLoginResponse({
          type: 'error',
          message: t('auth.errors.tooManyAttempts'),
        });
      } else {
        setLoginResponse({
          type: 'error',
          message: t('auth.login.errors.internal'),
        });
      }
    }
  };

  return (
    <Container size={420} my={40}>
      <Seo title={t('seo.pages.login')} />
      <Title ta="center" className={classes.title}>
        {t('auth.login.title')}
      </Title>
      <Text c="dimmed" size="sm" ta="center" mt={5}>
        {t('auth.login.noAccount')}{' '}
        <Anchor component={Link} to="/auth/register" size="sm">
          {t('auth.login.createAccount')}
        </Anchor>
      </Text>

      {loginResponse && (
        <Alert
          icon={loginResponse.type === 'error' ? <IconAlertCircle size={16} /> : <IconCheck size={16} />}
          color={loginResponse.type === 'error' ? 'red' : 'green'}
          mt={20}
        >
          {loginResponse.message}
        </Alert>
      )}

      <Paper withBorder shadow="md" p={30} mt={30} radius="md">
        <form onSubmit={handleLogin}>
          <TextInput
            name="username"
            type="email"
            autoComplete="username"
            label={t('auth.fields.email')}
            placeholder={t('auth.fields.emailPlaceholder')}
            required
          />
          <PasswordInput
            name="password"
            label={t('auth.fields.password')}
            placeholder={t('auth.fields.passwordPlaceholder')}
            autoComplete="current-password"
            required
            mt="md"
          />
          <Group justify="space-between" mt="lg">
            <Anchor component={Link} to="/auth/recover-password" size="sm">
              {t('auth.login.forgotPassword')}
            </Anchor>
          </Group>
          <Button type="submit" fullWidth mt="xl" loading={submitting}>
            {t('auth.login.submit')}
          </Button>
        </form>
      </Paper>
    </Container>
  );
}

export default LoginForm;
