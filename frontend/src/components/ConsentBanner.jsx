import { useSyncExternalStore } from 'react';
import { useTranslation } from 'react-i18next';
import { Anchor, Button, Group, Paper, Text } from '@mantine/core';
import { Link } from 'react-router';
import { getConsent, subscribeConsent } from '../analytics/consent.js';
import { analyticsEnabled, denyAnalyticsConsent, grantAnalyticsConsent } from '../analytics/posthog.js';

//* Asks once per browser before any analytics runs. Hidden when no PostHog
//* key is configured (nothing to consent to) or once the visitor has chosen
export function ConsentBanner() {
  const { t } = useTranslation();
  const consent = useSyncExternalStore(subscribeConsent, getConsent, () => null);

  if (!analyticsEnabled || consent !== null) {
    return null;
  }

  return (
    <Paper
      role="region"
      aria-label={t('consent.ariaLabel')}
      withBorder
      shadow="md"
      p="md"
      radius="md"
      pos="fixed"
      bottom={16}
      left={16}
      right={16}
      maw={560}
      style={{ zIndex: 300 }}
    >
      <Text size="sm">
        {t('consent.body')}{' '}
        <Anchor component={Link} to="/terminos-condiciones" size="sm">
          {t('consent.learnMore')}
        </Anchor>
      </Text>
      <Group justify="flex-end" gap="sm" mt="sm">
        <Button variant="default" size="xs" onClick={denyAnalyticsConsent}>
          {t('consent.decline')}
        </Button>
        <Button size="xs" onClick={grantAnalyticsConsent}>
          {t('consent.accept')}
        </Button>
      </Group>
    </Paper>
  );
}

export default ConsentBanner;
