import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router';
import {
  Alert,
  Anchor,
  Badge,
  Box,
  Card,
  Divider,
  Group,
  SimpleGrid,
  Skeleton,
  Stack,
  Text,
  Title,
} from '@mantine/core';
import { IconArrowLeft, IconDeviceDesktop } from '@tabler/icons-react';
import apiClient from '../../config/API/axiosConfig.js';
import Seo from '../../components/Seo.jsx';
import DetailRow from '../../components/DetailRow.jsx';
import SubscriptionStatusBadge from '../../components/shared/SubscriptionStatusBadge.jsx';
import { formatDate, formatDateTime } from '../../utils/formatDate.js';

const AdminUserDetail = () => {
  const { userId } = useParams();
  const { t } = useTranslation();
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    //* Navigating between detail pages reuses this component - reset state and
    //* abort the previous request so a late response never renders for the new id
    const controller = new AbortController();

    setUser(null);
    setLoading(true);
    setNotFound(false);
    setError(false);

    const fetchUser = async () => {
      try {
        const response = await apiClient.get(`/api/v1/admin/users/${userId}`, {
          signal: controller.signal,
        });

        if (controller.signal.aborted) {
          return;
        }

        setUser(response.data.user);
      } catch (err) {
        if (controller.signal.aborted) {
          return;
        }

        if (err?.response?.status === 404) {
          setNotFound(true);
        } else {
          setError(true);
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    };

    fetchUser();

    return () => controller.abort();
  }, [userId]);

  if (loading) {
    return (
      <Stack gap="lg">
        <Seo title={t('seo.pages.admin')} />
        <Skeleton height={32} width="40%" />
        <SimpleGrid cols={{ base: 1, md: 2 }}>
          <Skeleton height={220} radius="md" />
          <Skeleton height={220} radius="md" />
        </SimpleGrid>
      </Stack>
    );
  }

  if (notFound || error) {
    return (
      <Stack gap="lg">
        <Seo title={t('seo.pages.admin')} />
        <Anchor component={Link} to="/admin/users" size="sm">
          <Group gap={4}>
            <IconArrowLeft size={14} stroke={1.5} />
            {t('admin.backToUsers')}
          </Group>
        </Anchor>
        <Alert color={notFound ? 'yellow' : 'red'} variant="light">
          {notFound ? t('admin.userDetail.notFound') : t('admin.loadError')}
        </Alert>
      </Stack>
    );
  }

  const subscription = user?.company?.subscription;

  return (
    <Stack gap="lg">
      <Seo title={t('seo.pages.admin')} />

      <Anchor component={Link} to="/admin/users" size="sm">
        <Group gap={4}>
          <IconArrowLeft size={14} stroke={1.5} />
          {t('admin.backToUsers')}
        </Group>
      </Anchor>

      <Group justify="space-between" align="flex-start" wrap="wrap">
        <Box>
          <Title order={2}>{user.email}</Title>
          <Text c="dimmed" mt={4} size="sm">{user.id}</Text>
        </Box>
        <Badge color={user.role === 'superadmin' ? 'violet' : 'gray'} variant="light" size="lg">
          {t(`admin.roles.${user.role}`)}
        </Badge>
      </Group>

      <SimpleGrid cols={{ base: 1, md: 2 }}>
        <Card withBorder radius="md" p="lg">
          <Title order={4}>{t('admin.userDetail.account')}</Title>
          <Divider my="md" />
          <DetailRow label={t('admin.fields.email')}>
            <Text size="sm" fw={500}>{user.email}</Text>
          </DetailRow>
          <DetailRow label={t('admin.fields.role')}>
            <Text size="sm" fw={500}>{t(`admin.roles.${user.role}`)}</Text>
          </DetailRow>
          <DetailRow label={t('admin.fields.createdAt')}>
            <Text size="sm" fw={500}>{formatDateTime(user.created_at)}</Text>
          </DetailRow>
          <DetailRow label={t('admin.fields.lastLogin')}>
            <Text size="sm" fw={500}>{formatDateTime(user.last_login_at)}</Text>
          </DetailRow>
        </Card>

        <Card withBorder radius="md" p="lg">
          <Title order={4}>{t('admin.userDetail.company')}</Title>
          <Divider my="md" />
          {user.company ? (
            <>
              <DetailRow label={t('admin.fields.companyName')}>
                <Anchor component={Link} to={`/admin/companies/${user.company.id}`} size="sm" fw={500}>
                  {user.company.name ?? t('admin.fields.unnamedCompany')}
                </Anchor>
              </DetailRow>
              <DetailRow label={t('admin.fields.stripe')}>
                <Badge color={user.company.stripeLinked ? 'teal' : 'gray'} variant="light">
                  {user.company.stripeLinked
                    ? t('admin.fields.stripeLinked')
                    : t('admin.fields.stripeNotLinked')}
                </Badge>
              </DetailRow>
            </>
          ) : (
            <Text c="dimmed" size="sm">{t('admin.userDetail.noCompany')}</Text>
          )}
        </Card>

        <Card withBorder radius="md" p="lg">
          <Title order={4}>{t('admin.fields.subscription')}</Title>
          <Divider my="md" />
          {subscription ? (
            <>
              <DetailRow label={t('admin.fields.status')}>
                <SubscriptionStatusBadge subscription={subscription} />
              </DetailRow>
              <DetailRow label={t('admin.fields.createdAt')}>
                <Text size="sm" fw={500}>{formatDate(subscription.created_at)}</Text>
              </DetailRow>
              <DetailRow label={t('admin.fields.updatedAt')}>
                <Text size="sm" fw={500}>{formatDate(subscription.updated_at)}</Text>
              </DetailRow>
              <DetailRow label={t('admin.fields.expiresAt')}>
                <Text size="sm" fw={500}>{formatDate(subscription.expires_at)}</Text>
              </DetailRow>
            </>
          ) : (
            <Text c="dimmed" size="sm">{t('admin.fields.noSubscription')}</Text>
          )}
        </Card>

        <Card withBorder radius="md" p="lg">
          <Group justify="space-between" mb="xs">
            <Title order={4}>{t('admin.fields.activeSessions')}</Title>
            <IconDeviceDesktop size={20} stroke={1.5} />
          </Group>
          <Divider my="md" />
          <Text fw={700} style={{ fontSize: '1.5rem' }}>{user.activeSessionCount}</Text>
        </Card>
      </SimpleGrid>
    </Stack>
  );
};

export default AdminUserDetail;
