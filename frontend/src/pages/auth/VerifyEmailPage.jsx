import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useSearchParams } from 'react-router';
import { Alert, Button, Center, Container, Paper, Title } from '@mantine/core';
import { IconAlertCircle, IconArrowLeft, IconCheck } from '@tabler/icons-react';
import apiClient from '../../config/API/axiosConfig.js';
import PageLoader from '../../components/PageLoader.jsx';
import Seo from '../../components/Seo.jsx';
import ResendVerificationForm from '../../components/auth/ResendVerificationForm.jsx';
import { scrubQueryFromAddressBar } from '../../utils/scrubUrlToken.js';
import { verifyFailureState } from './emailVerification.js';

//* State: 'verifying' | 'verified' | 'invalid' (unknown, expired or used -
//* offer a new email) | 'error' (network/server - retry)
export function VerifyEmailPage() {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  //* Read once: the token is then scrubbed from the address bar
  const [emailVerificationToken] = useState(() => searchParams.get('emailVerificationToken'));
  const [state, setState] = useState(emailVerificationToken ? 'verifying' : 'invalid');
  const [attempt, setAttempt] = useState(0);
  //* The token is single-use: StrictMode's effect re-run (and any re-render)
  //* must reuse the in-flight request of this attempt, never send a second
  //* POST that would answer 400 for the already consumed token
  const requestRef = useRef({ attempt: null, promise: null });

  useEffect(() => {
    scrubQueryFromAddressBar();
  }, []);

  useEffect(() => {
    if (!emailVerificationToken) {
      return undefined;
    }

    let cancelled = false;

    setState('verifying');

    if (requestRef.current.attempt !== attempt) {
      //* POST (never GET) - the link only opens this page; mail scanners that
      //* prefetch it cannot consume the token
      requestRef.current = {
        attempt,
        promise: apiClient.post('/api/v1/auth/email-verification', { emailVerificationToken }),
      };
    }

    requestRef.current.promise
      .then(() => {
        if (!cancelled) {
          setState('verified');
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setState(verifyFailureState(err));
        }
      });

    return () => {
      cancelled = true;
    };
  }, [emailVerificationToken, attempt]);

  const backToLogin = (
    <Center mt="xl">
      <Button component={Link} to="/auth/login" variant="outline" leftSection={<IconArrowLeft size="1rem" />}>
        {t('auth.verifyEmail.goToLogin')}
      </Button>
    </Center>
  );

  const renderBody = () => {
    if (state === 'verifying') {
      return <PageLoader />;
    }

    if (state === 'verified') {
      return (
        <Paper shadow="xs" p={20} mt="xl" radius="md">
          <Alert icon={<IconCheck size="1rem" />} color="green" title={t('auth.verifyEmail.successTitle')}>
            {t('auth.verifyEmail.successBody')}
          </Alert>
          {backToLogin}
        </Paper>
      );
    }

    if (state === 'error') {
      return (
        <Paper shadow="xs" p={20} mt="xl" radius="md">
          <Alert icon={<IconAlertCircle size="1rem" />} color="red" title={t('auth.verifyEmail.errorTitle')}>
            {t('auth.verifyEmail.errorBody')}
          </Alert>
          <Center mt="xl">
            <Button onClick={() => setAttempt((value) => value + 1)}>{t('common.retry')}</Button>
          </Center>
        </Paper>
      );
    }

    return (
      <Paper shadow="xs" p={20} mt="xl" radius="md">
        <Alert icon={<IconAlertCircle size="1rem" />} color="red" title={t('auth.verifyEmail.invalidTitle')} mb="lg">
          {t('auth.verifyEmail.invalidBody')}
        </Alert>
        <ResendVerificationForm />
        {backToLogin}
      </Paper>
    );
  };

  return (
    <Container size={460} my={30}>
      <Seo title={t('seo.pages.verifyEmail')} />
      <Title ta="center">{t('auth.verifyEmail.title')}</Title>
      {renderBody()}
    </Container>
  );
}

export default VerifyEmailPage;
