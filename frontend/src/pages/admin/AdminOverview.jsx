import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import {
  Alert,
  Anchor,
  Card,
  Group,
  SimpleGrid,
  Skeleton,
  Stack,
  Text,
  ThemeIcon,
  Title,
} from '@mantine/core';
import {
  IconBuilding,
  IconCreditCard,
  IconDeviceDesktop,
  IconUserPlus,
  IconUsers,
} from '@tabler/icons-react';
import apiClient from '../../config/API/axiosConfig.js';
import Seo from '../../components/Seo.jsx';
import { formatDateTime } from '../../utils/formatDate.js';
import StatCard from '../../components/StatCard.jsx';

const AdminOverview = () => {
  const { t } = useTranslation();
  const [stats, setStats] = useState(null);
  const [recentUsers, setRecentUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [statsResponse, usersResponse] = await Promise.all([
          apiClient.get('/api/v1/admin/stats'),
          apiClient.get('/api/v1/admin/users', { params: { limit: 5 } }),
        ]);

        setStats(statsResponse.data.stats);
        setRecentUsers(usersResponse.data.users);
      } catch {
        setError(true);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  return (
    <Stack gap="lg">
      <Seo title={t('seo.pages.adminOverview')} />

      <Title order={2}>{t('admin.overview.title')}</Title>

      {error && (
        <Alert color="red" variant="light">
          {t('admin.loadError')}
        </Alert>
      )}

      <SimpleGrid cols={{ base: 1, xs: 2, md: 4 }}>
        <StatCard label={t('admin.overview.stats.users')} icon={<IconUsers size={20} stroke={1.5} />}>
          {loading || !stats ? (
            <Skeleton height={40} width="60%" />
          ) : (
            <Stack gap={2}>
              <Text fw={700} style={{ fontSize: '1.5rem' }}>{stats.totalUsers}</Text>
              <Text c="dimmed" size="xs">
                {t('admin.overview.stats.usersDetail', {
                  newUsers: stats.newUsersLastWeek,
                  superadmins: stats.totalSuperadmins,
                })}
              </Text>
            </Stack>
          )}
        </StatCard>

        <StatCard label={t('admin.overview.stats.companies')} icon={<IconBuilding size={20} stroke={1.5} />}>
          {loading || !stats ? (
            <Skeleton height={40} width="40%" />
          ) : (
            <Text fw={700} style={{ fontSize: '1.5rem' }}>{stats.totalCompanies}</Text>
          )}
        </StatCard>

        <StatCard label={t('admin.overview.stats.activeSubscriptions')} icon={<IconCreditCard size={20} stroke={1.5} />}>
          {loading || !stats ? (
            <Skeleton height={40} width="50%" />
          ) : (
            <Stack gap={2}>
              <Text fw={700} style={{ fontSize: '1.5rem' }}>{stats.activeSubscriptions}</Text>
              <Text c="dimmed" size="xs">
                {t('admin.overview.stats.subscriptionsDetail', { total: stats.totalSubscriptions })}
              </Text>
            </Stack>
          )}
        </StatCard>

        <StatCard label={t('admin.overview.stats.activeSessions')} icon={<IconDeviceDesktop size={20} stroke={1.5} />}>
          {loading || !stats ? (
            <Skeleton height={40} width="40%" />
          ) : (
            <Text fw={700} style={{ fontSize: '1.5rem' }}>{stats.activeSessions}</Text>
          )}
        </StatCard>
      </SimpleGrid>

      <Card withBorder radius="md" p="lg">
        <Group justify="space-between" mb="md">
          <Group gap="sm">
            <ThemeIcon variant="light" size="sm" radius="sm">
              <IconUserPlus size={16} stroke={1.5} />
            </ThemeIcon>
            <Title order={4}>{t('admin.overview.recentUsers.title')}</Title>
          </Group>
          <Anchor component={Link} to="/admin/users" size="sm">
            {t('admin.overview.recentUsers.viewAll')}
          </Anchor>
        </Group>

        {loading ? (
          <Stack gap="sm">
            <Skeleton height={24} />
            <Skeleton height={24} />
            <Skeleton height={24} />
          </Stack>
        ) : recentUsers.length === 0 ? (
          <Text c="dimmed" size="sm">{t('admin.overview.recentUsers.empty')}</Text>
        ) : (
          <Stack gap="xs">
            {recentUsers.map((user) => (
              <Group key={user.id} justify="space-between" wrap="nowrap">
                <Anchor component={Link} to={`/admin/users/${user.id}`} size="sm" truncate>
                  {user.email}
                </Anchor>
                <Text c="dimmed" size="xs">
                  {t('admin.overview.recentUsers.registeredAt', { date: formatDateTime(user.created_at) })}
                </Text>
              </Group>
            ))}
          </Stack>
        )}
      </Card>
    </Stack>
  );
};

export default AdminOverview;
