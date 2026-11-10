import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { useTranslation, Trans } from 'react-i18next';
import PropTypes from 'prop-types';
import {
  Alert,
  Anchor,
  Badge,
  Box,
  Button,
  Card,
  Divider,
  Group,
  RingProgress,
  SimpleGrid,
  Skeleton,
  Stack,
  Text,
  ThemeIcon,
  Timeline,
  Title,
} from '@mantine/core';
import {
  IconActivity,
  IconArrowUpRight,
  IconCalendarClock,
  IconCalendarUp,
  IconCircleCheck,
  IconCircleX,
  IconClockHour3,
  IconCreditCard,
  IconExternalLink,
  IconHistory,
  IconKey,
  IconReceipt2,
} from '@tabler/icons-react';
import apiClient from '../../config/API/axiosConfig.js';
import { useSubscription } from '../../contexts/useSubscription.js';
import NoActiveSubscriptionBanner from '../../components/partials/NoActiveSubscriptionBanner.jsx';
import Seo from '../../components/Seo.jsx';
import { formatDate, formatDateTime } from '../../utils/formatDate.js';

const DAY_MS = 24 * 60 * 60 * 1000;

const formatRelativeDays = (value) => {
  if (!value) return '—';
  const rtf = new Intl.RelativeTimeFormat('es-ES', { numeric: 'auto' });
  return rtf.format(
    Math.round((new Date(value).getTime() - Date.now()) / DAY_MS),
    'day'
  );
};

const StatCard = ({ icon, label, children }) => (
  <Card withBorder p="lg" radius="md">
    <Group justify="space-between" mb="xs">
      <Text c="dimmed" size="sm" fw={500}>
        {label}
      </Text>
      <ThemeIcon variant="light" size="lg" radius="md">
        {icon}
      </ThemeIcon>
    </Group>
    {children}
  </Card>
);

StatCard.propTypes = {
  icon: PropTypes.node,
  label: PropTypes.string,
  children: PropTypes.node,
};

const QuickAction = ({ icon, title, description, action }) => (
  <Group justify="space-between" wrap="nowrap" py="xs">
    <Group gap="sm" wrap="nowrap">
      <ThemeIcon variant="light" size="lg" radius="md">
        {icon}
      </ThemeIcon>
      <Box>
        <Text fw={500} size="sm">
          {title}
        </Text>
        <Text c="dimmed" size="xs">
          {description}
        </Text>
      </Box>
    </Group>
    {action}
  </Group>
);

QuickAction.propTypes = {
  icon: PropTypes.node,
  title: PropTypes.string,
  description: PropTypes.string,
  action: PropTypes.node,
};

const UserDashboard = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const {
    subscription,
    hasActiveSubscription,
    hasPaidSubscription,
    isTrial,
    loading: subscriptionLoading,
  } = useSubscription();
  const [user, setUser] = useState(null);
  const [userLoading, setUserLoading] = useState(true);
  const [now, setNow] = useState(null);

  useEffect(() => {
    setNow(Date.now());
  }, []);

  useEffect(() => {
    const fetchUser = async () => {
      try {
        const response = await apiClient.get('/api/v1/user');
        setUser(response.data.user);
      } catch {
        setUser(null);
      } finally {
        setUserLoading(false);
      }
    };

    fetchUser();
  }, []);

  const daysRemaining = useMemo(() => {
    if (!subscription?.expires_at || now === null) return null;
    return Math.max(
      0,
      Math.ceil((new Date(subscription.expires_at).getTime() - now) / DAY_MS)
    );
  }, [subscription, now]);

  const periodProgress = useMemo(() => {
    const start = subscription?.created_at ? new Date(subscription.created_at).getTime() : null;
    const end = subscription?.expires_at ? new Date(subscription.expires_at).getTime() : null;
    if (now === null || !start || !end || end <= start) return null;
    return Math.min(100, Math.max(0, ((now - start) / (end - start)) * 100));
  }, [subscription, now]);

  const loading = userLoading || subscriptionLoading;

  return (
    <Stack gap="lg">
      <Seo title={t('seo.pages.dashboard')} />
      <NoActiveSubscriptionBanner />

      <Group justify="space-between" align="flex-start" wrap="wrap">
        <Box>
          <Title order={2}>{t('user.panelTitle')}</Title>
          <Text c="dimmed" mt={4}>
            {user?.email
              ? t('user.dashboard.sessionAs', { email: user.email })
              : t('user.dashboard.personalArea')}{' '}
            ·{' '}
            {new Date().toLocaleDateString('es-ES', {
              weekday: 'long',
              day: 'numeric',
              month: 'long',
              year: 'numeric',
            })}
          </Text>
        </Box>
        <Button
          variant="light"
          rightSection={<IconArrowUpRight size={16} />}
          onClick={() => navigate('/user/billing')}
          visibleFrom="xs"
        >
          {t('user.dashboard.manageSubscription')}
        </Button>
      </Group>

      <SimpleGrid cols={{ base: 1, xs: 2, md: 4 }}>
        <StatCard label={t('user.dashboard.stats.subscription')} icon={<IconCreditCard size={20} stroke={1.5} />}>
          {loading ? (
            <Skeleton height={28} width="60%" />
          ) : hasPaidSubscription ? (
            <Badge color="teal" variant="light" size="lg">
              {t('billing.statusActive')}
            </Badge>
          ) : isTrial ? (
            <Badge color="yellow" variant="light" size="lg">
              {t('billing.statusTrial')}
            </Badge>
          ) : (
            <Badge color="red" variant="light" size="lg">
              {t('billing.statusInactive')}
            </Badge>
          )}
        </StatCard>

        <StatCard label={t('user.dashboard.stats.daysRemaining')} icon={<IconCalendarClock size={20} stroke={1.5} />}>
          {loading ? (
            <Skeleton height={28} width="40%" />
          ) : hasActiveSubscription && daysRemaining !== null ? (
            <Group gap={6} align="baseline">
              <Text fw={700} style={{ fontSize: '1.5rem' }}>
                {daysRemaining}
              </Text>
              <Text c="dimmed" size="sm">
                {t('user.dashboard.stats.untilDate', { date: formatDate(subscription.expires_at) })}
              </Text>
            </Group>
          ) : (
            <Text c="dimmed" size="sm">
              {t('user.dashboard.stats.noActiveSubscription')}
            </Text>
          )}
        </StatCard>

        <StatCard label={t('user.dashboard.stats.lastLogin')} icon={<IconHistory size={20} stroke={1.5} />}>
          {loading ? (
            <Skeleton height={28} width="70%" />
          ) : (
            <Text fw={500} size="sm">
              {formatDateTime(user?.last_login_at)}
            </Text>
          )}
        </StatCard>

        <StatCard label={t('user.dashboard.stats.memberSince')} icon={<IconCalendarUp size={20} stroke={1.5} />}>
          {loading ? (
            <Skeleton height={28} width="70%" />
          ) : (
            <Text fw={500} size="sm">
              {formatDate(user?.created_at)}
            </Text>
          )}
        </StatCard>
      </SimpleGrid>

      <SimpleGrid cols={{ base: 1, md: 2 }}>
        <Card withBorder radius="md" p="lg">
          <Title order={4}>{t('user.dashboard.plan.title')}</Title>
          <Text c="dimmed" size="sm" mt={4} mb="lg">
            {hasPaidSubscription
              ? t('user.dashboard.plan.activeDescription')
              : isTrial
                ? t('user.dashboard.plan.trialDescription')
                : t('user.dashboard.plan.inactiveDescription')}
          </Text>

          {loading ? (
            <Skeleton height={120} radius="md" />
          ) : hasActiveSubscription ? (
            <Stack gap="md">
              {periodProgress !== null && (
                <Group justify="center">
                  <RingProgress
                    size={140}
                    thickness={12}
                    roundCaps
                    sections={[{ value: periodProgress, color: 'teal' }]}
                    label={
                      <Text ta="center" fw={700} size="sm">
                        {Math.round(periodProgress)}%
                      </Text>
                    }
                  />
                </Group>
              )}
              <Divider />
              <Group justify="space-between">
                <Text c="dimmed" size="sm">
                  {t('user.dashboard.plan.periodStart')}
                </Text>
                <Text size="sm" fw={500}>
                  {formatDate(subscription.created_at)}
                </Text>
              </Group>
              <Group justify="space-between">
                <Text c="dimmed" size="sm">
                  {t('user.dashboard.plan.periodEnd')}
                </Text>
                <Text size="sm" fw={500}>
                  {formatDate(subscription.expires_at)} ({formatRelativeDays(subscription.expires_at)})
                </Text>
              </Group>
            </Stack>
          ) : (
            <Stack gap="md" align="center" py="xl">
              <ThemeIcon size={48} radius="xl" variant="light" color="red">
                <IconCircleX size={26} stroke={1.5} />
              </ThemeIcon>
              <Text c="dimmed" size="sm" ta="center" maw={320}>
                {t('user.dashboard.plan.noSubscription')}
              </Text>
              <Button onClick={() => navigate('/user/billing')} leftSection={<IconReceipt2 size={16} />}>
                {t('user.dashboard.plan.viewPlans')}
              </Button>
            </Stack>
          )}
        </Card>

        <Stack gap="lg">
          <Card withBorder radius="md" p="lg">
            <Title order={4}>{t('user.dashboard.quick.title')}</Title>
            <Divider my="md" />
            <QuickAction
              icon={<IconReceipt2 size={20} stroke={1.5} />}
              title={t('user.dashboard.quick.billing.title')}
              description={t('user.dashboard.quick.billing.description')}
              action={
                <Anchor
                  component={Link}
                  to="/user/billing"
                  size="sm"
                  aria-label={t('user.dashboard.quick.billing.title')}
                >
                  <IconExternalLink size={16} />
                </Anchor>
              }
            />
            <QuickAction
              icon={<IconKey size={20} stroke={1.5} />}
              title={t('user.dashboard.quick.security.title')}
              description={t('user.dashboard.quick.security.description')}
              action={
                <Anchor
                  component={Link}
                  to="/user/profile"
                  size="sm"
                  aria-label={t('user.dashboard.quick.security.title')}
                >
                  <IconExternalLink size={16} />
                </Anchor>
              }
            />
            {/* Auto-renewal only exists for a paid Stripe subscription; the
                trial just runs out */}
            <QuickAction
              icon={<IconClockHour3 size={20} stroke={1.5} />}
              title={t('user.dashboard.quick.renewal.title')}
              description={
                hasPaidSubscription
                  ? t('user.dashboard.quick.renewal.renewsOn', {
                      date: formatRelativeDays(subscription.expires_at),
                    })
                  : isTrial
                    ? t('user.dashboard.quick.renewal.trialEndsIn', {
                        count: daysRemaining ?? 0,
                      })
                    : t('user.dashboard.quick.renewal.unavailable')
              }
              action={
                <Badge
                  size="sm"
                  variant="light"
                  color={hasPaidSubscription ? 'teal' : isTrial ? 'yellow' : 'gray'}
                >
                  {hasPaidSubscription
                    ? t('user.dashboard.quick.renewal.enabled')
                    : isTrial
                      ? t('user.dashboard.quick.renewal.trial')
                      : t('user.dashboard.quick.renewal.disabled')}
                </Badge>
              }
            />
          </Card>

          <Card withBorder radius="md" p="lg">
            <Group justify="space-between" mb="md">
              <Title order={4}>{t('user.dashboard.activity.title')}</Title>
              <ThemeIcon variant="light" size="sm" radius="sm">
                <IconActivity size={16} stroke={1.5} />
              </ThemeIcon>
            </Group>
            <Timeline
              bulletSize={20}
              lineWidth={2}
              active={2}
            >
              <Timeline.Item
                bullet={<IconCalendarUp size={12} stroke={1.5} />}
                title={t('user.dashboard.activity.accountCreated')}
              >
                <Text c="dimmed" size="xs">
                  {formatDate(user?.created_at)}
                </Text>
              </Timeline.Item>
              <Timeline.Item
                bullet={<IconHistory size={12} stroke={1.5} />}
                title={t('user.dashboard.activity.lastLogin')}
              >
                <Text c="dimmed" size="xs">
                  {formatDateTime(user?.last_login_at)}
                </Text>
              </Timeline.Item>
              <Timeline.Item
                bullet={<IconCircleCheck size={12} stroke={1.5} />}
                color={hasActiveSubscription ? 'teal' : 'gray'}
                title={hasActiveSubscription
                  ? t('user.dashboard.activity.subscriptionActive')
                  : t('user.dashboard.activity.noSubscription')}
              >
                <Text c="dimmed" size="xs">
                  {hasActiveSubscription
                    ? t('user.dashboard.activity.expiresOn', { date: formatDate(subscription.expires_at) })
                    : t('user.dashboard.activity.activateAnytime')}
                </Text>
              </Timeline.Item>
            </Timeline>
          </Card>
        </Stack>
      </SimpleGrid>

      {!loading && !hasActiveSubscription && (
        <Alert color="gray" variant="light" icon={<IconCreditCard size={16} />}>
          <Trans
            i18nKey="user.dashboard.subscriptionAlert"
            t={t}
            components={[<Anchor key="choose-plan" component={Link} to="/user/billing" />]}
          />
        </Alert>
      )}
    </Stack>
  );
};

export default UserDashboard;
