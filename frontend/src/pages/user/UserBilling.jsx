import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import apiClient from '../../config/API/axiosConfig.js';
import { Container, Stack, Card, Title, Text, Group, Button, SimpleGrid, Alert, Badge, Tooltip } from '@mantine/core';
import { useSubscription } from '../../contexts/useSubscription.js';
import PageLoader from '../../components/PageLoader.jsx';
import Seo from '../../components/Seo.jsx';
import { notifyError, notifyInfo, notifySuccess } from '../../utils/notifications.js';
import { PLANS } from '../../config/plans.js';
import { formatPlanPrice } from '../../utils/formatPrice.js';
import { formatDateTime } from '../../utils/formatDate.js';

const CHECKOUT_URL_PREFIX = 'https://checkout.stripe.com/';
const PORTAL_URL_PREFIX = 'https://billing.stripe.com/';
const BILLING_PERMISSION = 'billing.manage';

//* Stripe redirects back here with ?status=paid|cancelled. The webhook that
//* activates the subscription may land a few seconds after the redirect, so
//* a paid return re-fetches the subscription a few times before giving up
const CHECKOUT_STATUS_PARAM = 'status';
const PAID_POLL_INTERVAL_MS = 2000;
const PAID_POLL_MAX_ATTEMPTS = 5;

//* Only navigate to Stripe-hosted pages - never to an arbitrary URL from the API
const redirectToStripe = (url, expectedPrefix) => {
  if (typeof url !== 'string' || !url.startsWith(expectedPrefix)) {
    return false;
  }

  window.location.assign(url);
  return true;
};

const UserBilling = () => {
  const { t } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();
  const {
    subscription,
    loading,
    error,
    hasPaidSubscription,
    isTrial,
    hasBillingId,
    refresh,
  } = useSubscription();
  // null while unknown - the backend still enforces the permission (403)
  const [canManageBilling, setCanManageBilling] = useState(null);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [portalLoading, setPortalLoading] = useState(false);
  const [paidPollsLeft, setPaidPollsLeft] = useState(0);
  //* Guards the one-off toast against StrictMode's double effect run
  const handledStatusRef = useRef(false);

  const checkoutStatus = searchParams.get(CHECKOUT_STATUS_PARAM);

  useEffect(() => {
    if (!checkoutStatus || handledStatusRef.current) {
      return;
    }

    handledStatusRef.current = true;

    if (checkoutStatus === 'paid') {
      notifySuccess(t('billing.checkout.paid'));
      refresh({ silent: true });
      setPaidPollsLeft(PAID_POLL_MAX_ATTEMPTS);
    } else if (checkoutStatus === 'cancelled') {
      notifyInfo(t('billing.checkout.cancelled'));
    }

    //* Strip the param so a reload doesn't replay the toast
    setSearchParams((params) => {
      params.delete(CHECKOUT_STATUS_PARAM);
      return params;
    }, { replace: true });
  }, [checkoutStatus, refresh, setSearchParams, t]);

  useEffect(() => {
    if (paidPollsLeft === 0 || hasPaidSubscription) {
      return undefined;
    }

    const timer = setTimeout(async () => {
      await refresh({ silent: true });
      setPaidPollsLeft((left) => left - 1);
    }, PAID_POLL_INTERVAL_MS);

    return () => clearTimeout(timer);
  }, [paidPollsLeft, hasPaidSubscription, refresh]);

  //* Polling ran out and the webhook still hasn't marked the subscription as
  //* paid - tell the user it's still being processed
  const pollingStartedRef = useRef(false);

  useEffect(() => {
    if (paidPollsLeft > 0) {
      pollingStartedRef.current = true;
      return;
    }

    if (pollingStartedRef.current && !hasPaidSubscription) {
      notifyInfo(t('billing.checkout.processing'));
    }

    pollingStartedRef.current = false;
  }, [paidPollsLeft, hasPaidSubscription, t]);

  useEffect(() => {
    const controller = new AbortController();

    const loadPermissions = async () => {
      try {
        const response = await apiClient.get('/api/v1/team', { signal: controller.signal });
        const permissions = response.data?.callerPermissions ?? [];

        setCanManageBilling(permissions.includes(BILLING_PERMISSION));
      } catch {
        // Leave the actions enabled - a 403 on click is handled with a toast
      }
    };

    loadPermissions();

    return () => controller.abort();
  }, []);

  const billingLocked = canManageBilling === false;

  const handlePriceLink = async (planName, planBillingCycle) => {
    const planData = {
      planName: planName,
      planBillingCycle: planBillingCycle,
    };

    setCheckoutLoading(true);

    try {
      const response = await apiClient.post('/api/v1/billing/checkout-session', planData);

      if (redirectToStripe(response.data?.checkoutSessionUrl, CHECKOUT_URL_PREFIX)) {
        return;
      }

      notifyError(t('billing.errors.checkout'));
    } catch (err) {
      const status = err?.response?.status;
      const code = err?.response?.data?.code;

      if (status === 403) {
        notifyError(t('billing.errors.forbidden'));
      } else if (status === 409 && code === 'SUBSCRIPTION_ACTIVE') {
        notifyError(t('billing.errors.subscriptionActive'));
      } else if (status === 400 || status === 409 || status === 422) {
        notifyError(t('billing.errors.invalid'));
      } else {
        notifyError(t('billing.errors.checkout'));
      }
    }

    setCheckoutLoading(false);
  };

  const handleBillingCustomerPortal = async () => {
    setPortalLoading(true);

    try {
      const response = await apiClient.post('/api/v1/billing/customer-portal');

      if (redirectToStripe(response.data?.customerPortalUrl, PORTAL_URL_PREFIX)) {
        return;
      }

      notifyError(t('billing.errors.portal'));
    } catch (err) {
      if (err?.response?.status === 403) {
        notifyError(t('billing.errors.forbidden'));
      } else {
        notifyError(t('billing.errors.portal'));
      }
    }

    setPortalLoading(false);
  };

  if (loading) {
    return (
      <Container size="sm">
        <Seo title={t('seo.pages.billing')} />
        <PageLoader label={t('loading.billing')} />
      </Container>
    );
  }

  if (error) {
    return (
      <Container size="sm">
        <Seo title={t('seo.pages.billing')} />
        <Alert color="red" title={t('common.error')}>{error}</Alert>
      </Container>
    );
  }

  const statusLabel = hasPaidSubscription
    ? t('billing.statusActive')
    : isTrial
      ? t('billing.statusTrial')
      : t('billing.statusInactive');

  return (
    <Container size="sm">
      <Seo title={t('seo.pages.billing')} />
      <Stack gap="lg">

        <Card withBorder p="lg" radius="md">
          <Stack gap="sm" mt="sm">
            <Group gap="xs">
              <Text fw={700}>{t('billing.status')}</Text>
              <Badge
                color={hasPaidSubscription ? 'teal' : isTrial ? 'yellow' : 'red'}
                variant="light"
              >
                {statusLabel}
              </Badge>
            </Group>
            {subscription?.expires_at && (
              <Text fw={500}>
                <b>{isTrial ? t('billing.trialEndsAt') : t('billing.expiresAt')}</b>{' '}
                {formatDateTime(subscription.expires_at)}
              </Text>
            )}
          </Stack>
        </Card>

        {/* The plan card stays visible during the free trial - that's when
            the user needs to pick a plan */}
        { !hasPaidSubscription &&
          <SimpleGrid cols={1} spacing="lg">
            <Card
              withBorder
              p="lg"
              radius="md"
              style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 280 }}
            >
              <Title order={3}>{t('billing.monthly.title')}</Title>
              <Group align="center" mt="xs">
                <Text fw={700} size="xl">
                  {t('billing.monthly.pricePerMonth', { price: formatPlanPrice(PLANS.PRO) })}
                </Text>
                <Text size="sm" c="dimmed">{t('billing.monthly.vatIncluded')}</Text>
              </Group>
              <Text c="dimmed" mt="md">{t('billing.monthly.description')}</Text>
              {/* Disabled buttons swallow pointer events - the span wrapper keeps the tooltip hoverable */}
              <Tooltip
                label={t('billing.locked.manage')}
                disabled={!billingLocked}
                position="top"
                withArrow
              >
                <span style={{ marginTop: 'auto' }}>
                  <Button
                    mt="md"
                    fullWidth
                    variant='outline'
                    disabled={billingLocked}
                    loading={checkoutLoading}
                    onClick={() => handlePriceLink(PLANS.PRO.id, 'monthly')}
                  >
                    {t('billing.monthly.choose')}
                  </Button>
                </span>
              </Tooltip>
            </Card>
          </SimpleGrid>
        }

        <Card withBorder p="lg" radius="md">
          <Title order={3}>{t('billing.invoices.title')}</Title>
          <Text c="dimmed" mt="xs">
            {t('billing.invoices.description')}
          </Text>
          <Group mt="md">
            {/* Disabled buttons swallow pointer events - the span wrapper keeps the tooltip hoverable */}
            <Tooltip
              label={billingLocked ? t('billing.locked.manage') : t('billing.invoices.portalDisabled')}
              disabled={hasBillingId && !billingLocked}
              position="top"
              withArrow
            >
              <span>
                <Button
                  onClick={handleBillingCustomerPortal}
                  disabled={!hasBillingId || billingLocked}
                  loading={portalLoading}
                >
                  {t('billing.invoices.openPortal')}
                </Button>
              </span>
            </Tooltip>
          </Group>
        </Card>
      </Stack>
    </Container>
  );
};

export default UserBilling;
