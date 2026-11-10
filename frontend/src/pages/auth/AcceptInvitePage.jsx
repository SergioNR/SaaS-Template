import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useSearchParams } from 'react-router';
import {
  Alert,
  Badge,
  Box,
  Button,
  Center,
  Container,
  Group,
  Paper,
  PasswordInput,
  Stack,
  Text,
  Title,
} from '@mantine/core';
import { IconAlertCircle, IconArrowLeft } from '@tabler/icons-react';
import apiClient from '../../config/API/axiosConfig.js';
import PageLoader from '../../components/PageLoader.jsx';
import Seo from '../../components/Seo.jsx';
import { notifyError, notifySuccess } from '../../utils/notifications.js';

//* Maps a 400 from the invite check/accept endpoints to an invalid-state key
const invalidReasonFor400 = (code) => {
  if (code === 'INVITE_EXPIRED') {
    return 'expired';
  }

  if (code === 'INVITER_INVALID') {
    return 'inviterInvalid';
  }

  return 'notFound';
};

export function AcceptInvitePage() {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const inviteToken = searchParams.get('inviteToken');

  const [loading, setLoading] = useState(Boolean(inviteToken));
  const [inviteData, setInviteData] = useState(null);
  const [invalidReason, setInvalidReason] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const checkInviteValidity = async () => {
      if (!inviteToken) {
        setInvalidReason('notFound');
        setLoading(false);
        return;
      }

      try {
        // `params` URL-encodes the opaque token
        const response = await apiClient.get('/api/v1/auth/invite', {
          params: { inviteToken },
        });

        if (!cancelled) {
          setInviteData(response.data);
        }
      } catch (err) {
        if (!cancelled) {
          setInvalidReason(
            err?.response?.status === 400
              ? invalidReasonFor400(err?.response?.data?.code)
              : 'notFound'
          );
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    checkInviteValidity();

    return () => {
      cancelled = true;
    };
  }, [inviteToken]);

  const acceptInvite = async (event) => {
    event.preventDefault();

    setSubmitting(true);

    try {
      await apiClient.post('/api/v1/auth/invite-accept', {
        inviteToken,
        password: event.target.password.value,
      });

      notifySuccess(t('auth.acceptInvite.success'));
      navigate('/auth/login');
    } catch (err) {
      const status = err?.response?.status;
      const code = err?.response?.data?.code;

      if (status === 409) {
        notifyError(t('auth.acceptInvite.errors.registered'));
      } else if (status === 400) {
        //* The invite went stale while the form was open - swap to the
        //* matching invalid state instead of a toast
        setInviteData(null);
        setInvalidReason(invalidReasonFor400(code));
      } else if (status === 404) {
        //* Consumed or revoked in the meantime
        setInviteData(null);
        setInvalidReason('notFound');
      } else if (status === 422) {
        notifyError(t('auth.acceptInvite.errors.invalidPassword'));
      } else {
        notifyError(t('auth.acceptInvite.errors.generic'));
      }

      setSubmitting(false);
    }
  };

  return (
    <Container size={460} my={30}>
      <Seo title={t('seo.pages.acceptInvite')} />
      <Title ta="center">{t('auth.acceptInvite.title')}</Title>

      {loading && <PageLoader />}

      {!loading && invalidReason && (
        <Paper shadow="xs" p={20} mt="xl" radius="md">
          {/* invalidReason: 'expired' / 'inviterInvalid' (400 by code) or
              'notFound' (missing/unknown/consumed token) */}
          <Alert
            icon={<IconAlertCircle size="1rem" />}
            title={t(`auth.acceptInvite.invalid.${invalidReason}.title`)}
            color="red"
          >
            {t(`auth.acceptInvite.invalid.${invalidReason}.body`)}
          </Alert>

          <Center mt="xl">
            <Button
              variant="outline"
              component={Link}
              to="/auth/login"
              leftSection={<IconArrowLeft size="1rem" />}
            >
              {t('auth.acceptInvite.backToLogin')}
            </Button>
          </Center>
        </Paper>
      )}

      {!loading && inviteData && (
        <Paper withBorder shadow="md" p={30} radius="md" mt="xl">
          <Stack gap="sm" mb="md">
            <Group justify="space-between">
              <Text c="dimmed" size="sm">
                {t('auth.acceptInvite.email')}
              </Text>
              <Text size="sm" fw={500}>
                {inviteData.email}
              </Text>
            </Group>
            {inviteData.companyName && (
              <Group justify="space-between">
                <Text c="dimmed" size="sm">
                  {t('auth.acceptInvite.company')}
                </Text>
                <Text size="sm" fw={500}>
                  {inviteData.companyName}
                </Text>
              </Group>
            )}
            <Group justify="space-between">
              <Text c="dimmed" size="sm">
                {t('auth.acceptInvite.role')}
              </Text>
              <Badge color="indigo" variant="light">
                {t(`team.roles.${inviteData.roleName}`, inviteData.roleName)}
              </Badge>
            </Group>
          </Stack>

          <form onSubmit={acceptInvite}>
            <PasswordInput
              name="password"
              label={t('auth.acceptInvite.password')}
              placeholder={t('auth.acceptInvite.passwordPlaceholder')}
              autoComplete="new-password"
              required
              mt="md"
            />

            <Box>
              <Text c="dimmed" size="xs" mt="sm">
                {t('auth.acceptInvite.passwordHint')}
              </Text>
            </Box>

            <Group justify="flex-end" mt="lg">
              <Button type="submit" loading={submitting}>
                {t('auth.acceptInvite.submit')}
              </Button>
            </Group>
          </form>
        </Paper>
      )}
    </Container>
  );
}

export default AcceptInvitePage;
