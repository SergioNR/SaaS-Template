import { useTranslation } from 'react-i18next';
import { Box, Container, SimpleGrid, Stack, Group, Divider, Image, Text, Anchor } from '@mantine/core';
import { Link } from 'react-router';
import classes from './SiteFooter.module.css';
import { analyticsEnabled, resetAnalyticsConsent } from '../../analytics/posthog.js';

export const SiteFooter = () => {
  const { t } = useTranslation();

  const year = new Date().getFullYear();

  const columns = [
    {
      title: t('footer.columns.product'),
      links: [
        { label: t('footer.links.pricing'), href: '/pricing' },
      ],
    },
    {
      title: t('footer.columns.resources'),
      links: [
        { label: t('footer.links.faq'), href: '/preguntas-frecuentes' },
      ],
    },
    {
      title: t('footer.columns.legal'),
      links: [
        { label: t('footer.links.terms'), href: '/terminos-condiciones' },
        { label: t('footer.links.contact'), href: `mailto:${t('common.contactEmail')}` },
      ],
    },
  ];

  return (
    <Box component="footer" role="contentinfo" aria-label={t('footer.ariaLabel')} p="xl" className={classes.footer}>
      <Container size="xl">
        <SimpleGrid
          cols={{ base: 1, sm: 3, md: 4, lg: 5 }}
          spacing="xl"
        >
          <Stack gap="xs">
            <Group gap="sm" align="center" wrap="nowrap">
              <Image src="/logo.svg" alt={t('footer.logoAlt')} w={36} h={36} />
              <Text fw={700} fz="lg">
                {t('common.siteName')}
              </Text>
            </Group>
            <Text c="dimmed" fz="sm">
              {t('footer.tagline')}
            </Text>
          </Stack>

          {columns.map((col) => (
            <Stack key={col.title} gap={6}>
              <Text fw={700} fz="sm">
                {col.title}
              </Text>
              {col.links.map((link) => (
                <Anchor
                  key={link.label}
                  {...(link.href.startsWith('/')
                    ? { component: Link, to: link.href }
                    : { href: link.href })}
                  c="dimmed"
                  size="sm"
                  underline="hover"
                >
                  {link.label}
                </Anchor>
              ))}
            </Stack>
          ))}
        </SimpleGrid>

        <Divider my="lg" />

        <Group justify="space-between" wrap="wrap" gap="md">
          <Text c="dimmed" fz="sm">
            {t('footer.copyright', { year, siteName: t('common.siteName') })}
          </Text>
          {/* Re-opens the consent banner so the choice can be changed */}
          {analyticsEnabled && (
            <Anchor component="button" type="button" c="dimmed" size="sm" underline="hover" onClick={resetAnalyticsConsent}>
              {t('consent.manage')}
            </Anchor>
          )}
        </Group>
      </Container>
    </Box>
  );
};
