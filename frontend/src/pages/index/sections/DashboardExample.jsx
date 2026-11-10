import { Title, Text, AspectRatio, Stack, Box } from '@mantine/core';
import { useTranslation } from 'react-i18next';

const DashboardExample = () => {
  const { t } = useTranslation();

  return (
    <Stack align="center" gap="xl">
      <Title order={2} ta="center" w="100%" maw="1140px">
        {t('index.dashboardExample.title')}
      </Title>
      <Text size="lg" ta="center" c="dimmed" w="100%" maw="1140px">
        {t('index.dashboardExample.subtitle')}
      </Text>

      <AspectRatio ratio={16 / 9} mt="md" w="100%" maw="1500px">
        <Box
          style={{
            width: '100%',
            height: '100%',
            borderRadius: 'var(--mantine-radius-md)',
            border: '1px dashed var(--mantine-color-default-border)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Text c="dimmed">{t('index.dashboardExample.placeholder')}</Text>
        </Box>
      </AspectRatio>
    </Stack>
  );
};

export default DashboardExample;
