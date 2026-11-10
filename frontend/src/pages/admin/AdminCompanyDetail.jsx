import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router';
import {
  Alert,
  Anchor,
  Badge,
  Card,
  Divider,
  Group,
  SimpleGrid,
  Skeleton,
  Stack,
  Table,
  Text,
  Title,
} from '@mantine/core';
import { IconArrowLeft } from '@tabler/icons-react';
import PropTypes from 'prop-types';
import apiClient from '../../config/API/axiosConfig.js';
import Seo from '../../components/Seo.jsx';
import SubscriptionStatusBadge from '../../components/shared/SubscriptionStatusBadge.jsx';
import { formatDate, formatDateTime } from '../../utils/formatDate.js';

const DetailRow = ({ label, children }) => (
  <Group justify="space-between" py="xs" wrap="nowrap">
    <Text c="dimmed" size="sm">{label}</Text>
    {children}
  </Group>
);

DetailRow.propTypes = {
  label: PropTypes.string,
  children: PropTypes.node,
};

const AdminCompanyDetail = () => {
  const { companyId } = useParams();
  const { t } = useTranslation();
  const [company, setCompany] = useState(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    //* Navigating between detail pages reuses this component - reset state and
    //* abort the previous request so a late response never renders for the new id
    const controller = new AbortController();

    setCompany(null);
    setLoading(true);
    setNotFound(false);
    setError(false);

    const fetchCompany = async () => {
      try {
        const response = await apiClient.get(`/api/v1/admin/companies/${companyId}`, {
          signal: controller.signal,
        });

        if (controller.signal.aborted) {
          return;
        }

        setCompany(response.data.company);
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

    fetchCompany();

    return () => controller.abort();
  }, [companyId]);

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
        <Anchor component={Link} to="/admin/companies" size="sm">
          <Group gap={4}>
            <IconArrowLeft size={14} stroke={1.5} />
            {t('admin.backToCompanies')}
          </Group>
        </Anchor>
        <Alert color={notFound ? 'yellow' : 'red'} variant="light">
          {notFound ? t('admin.companyDetail.notFound') : t('admin.loadError')}
        </Alert>
      </Stack>
    );
  }

  const userRows = company.users.map((user) => (
    <Table.Tr key={user.id}>
      <Table.Td>
        <Anchor component={Link} to={`/admin/users/${user.id}`} size="sm">
          {user.email}
        </Anchor>
      </Table.Td>
      <Table.Td>
        <Badge color={user.role === 'superadmin' ? 'violet' : 'gray'} variant="light">
          {t(`admin.roles.${user.role}`)}
        </Badge>
      </Table.Td>
      <Table.Td>
        <Text fz="sm">{formatDateTime(user.created_at)}</Text>
      </Table.Td>
      <Table.Td>
        <Text fz="sm">{formatDateTime(user.last_login_at)}</Text>
      </Table.Td>
    </Table.Tr>
  ));

  return (
    <Stack gap="lg">
      <Seo title={t('seo.pages.admin')} />

      <Anchor component={Link} to="/admin/companies" size="sm">
        <Group gap={4}>
          <IconArrowLeft size={14} stroke={1.5} />
          {t('admin.backToCompanies')}
        </Group>
      </Anchor>

      <Group justify="space-between" align="flex-start" wrap="wrap">
        <Title order={2}>{company.name ?? t('admin.fields.unnamedCompany')}</Title>
        <Badge color={company.stripeLinked ? 'teal' : 'gray'} variant="light" size="lg">
          {company.stripeLinked
            ? t('admin.fields.stripeLinked')
            : t('admin.fields.stripeNotLinked')}
        </Badge>
      </Group>

      <SimpleGrid cols={{ base: 1, md: 2 }}>
        <Card withBorder radius="md" p="lg">
          <Title order={4}>{t('admin.companyDetail.info')}</Title>
          <Divider my="md" />
          <DetailRow label={t('admin.fields.companyName')}>
            <Text size="sm" fw={500}>{company.name ?? t('admin.fields.unnamedCompany')}</Text>
          </DetailRow>
          <DetailRow label={t('admin.fields.createdAt')}>
            <Text size="sm" fw={500}>{formatDateTime(company.created_at)}</Text>
          </DetailRow>
          <DetailRow label={t('admin.fields.updatedAt')}>
            <Text size="sm" fw={500}>{formatDateTime(company.updated_at)}</Text>
          </DetailRow>
          <DetailRow label={t('admin.companyDetail.userCount')}>
            <Text size="sm" fw={500}>{company.users.length}</Text>
          </DetailRow>
        </Card>

        <Card withBorder radius="md" p="lg">
          <Title order={4}>{t('admin.fields.subscription')}</Title>
          <Divider my="md" />
          {company.subscription ? (
            <>
              <DetailRow label={t('admin.fields.status')}>
                <SubscriptionStatusBadge subscription={company.subscription} />
              </DetailRow>
              <DetailRow label={t('admin.fields.createdAt')}>
                <Text size="sm" fw={500}>{formatDate(company.subscription.created_at)}</Text>
              </DetailRow>
              <DetailRow label={t('admin.fields.updatedAt')}>
                <Text size="sm" fw={500}>{formatDate(company.subscription.updated_at)}</Text>
              </DetailRow>
              <DetailRow label={t('admin.fields.expiresAt')}>
                <Text size="sm" fw={500}>{formatDate(company.subscription.expires_at)}</Text>
              </DetailRow>
            </>
          ) : (
            <Text c="dimmed" size="sm">{t('admin.fields.noSubscription')}</Text>
          )}
        </Card>
      </SimpleGrid>

      <Card withBorder radius="md" p="lg">
        <Title order={4}>{t('admin.companyDetail.users')}</Title>
        <Divider my="md" />
        {company.users.length === 0 ? (
          <Text c="dimmed" size="sm">{t('admin.companyDetail.noUsers')}</Text>
        ) : (
          <Table.ScrollContainer minWidth={600}>
            <Table verticalSpacing="sm">
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>{t('admin.users.columns.email')}</Table.Th>
                  <Table.Th>{t('admin.users.columns.role')}</Table.Th>
                  <Table.Th>{t('admin.users.columns.createdAt')}</Table.Th>
                  <Table.Th>{t('admin.users.columns.lastLogin')}</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>{userRows}</Table.Tbody>
            </Table>
          </Table.ScrollContainer>
        )}
      </Card>
    </Stack>
  );
};

export default AdminCompanyDetail;
