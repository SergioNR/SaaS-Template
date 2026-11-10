import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import {
  Alert,
  Anchor,
  Button,
  Group,
  Skeleton,
  Stack,
  Table,
  Text,
  Title,
} from '@mantine/core';
import apiClient from '../../config/API/axiosConfig.js';
import Seo from '../../components/Seo.jsx';
import SubscriptionStatusBadge from '../../components/shared/SubscriptionStatusBadge.jsx';
import { notifyError } from '../../utils/notifications.js';
import { formatDateTime } from '../../utils/formatDate.js';
import { useCursorList } from '../../hooks/useCursorList.js';
import DebouncedSearchInput from '../../components/DebouncedSearchInput.jsx';

const PAGE_SIZE = 25;

const AdminCompaniesList = () => {
  const { t } = useTranslation();
  const [search, setSearch] = useState('');

  const fetchCompanies = useCallback(
    async ({ cursor, signal } = {}) => {
      const response = await apiClient.get('/api/v1/admin/companies', {
        params: {
          limit: PAGE_SIZE,
          ...(search ? { search } : {}),
          ...(cursor ? { cursor } : {}),
        },
        signal,
      });

      return response.data;
    },
    [search],
  );

  const onLoadMoreError = useCallback(() => notifyError(t('admin.companies.loadMoreError')), [t]);

  //* Stale-response handling (abort + request id) lives in useCursorList
  const {
    rows: companies,
    rowCount: companyCount,
    nextCursor,
    loading,
    loadingMore,
    error,
    loadMore,
  } = useCursorList({ fetchPage: fetchCompanies, rowsKey: 'companies', countKey: 'companyCount', onLoadMoreError });

  const rows = companies.map((company) => (
    <Table.Tr key={company.id}>
      <Table.Td>
        <Anchor component={Link} to={`/admin/companies/${company.id}`} size="sm">
          {company.name ?? t('admin.fields.unnamedCompany')}
        </Anchor>
      </Table.Td>
      <Table.Td>
        <Text fz="sm">{company.userCount}</Text>
      </Table.Td>
      <Table.Td>
        <SubscriptionStatusBadge subscription={company.subscription} />
      </Table.Td>
      <Table.Td>
        <Text fz="sm">{formatDateTime(company.created_at)}</Text>
      </Table.Td>
    </Table.Tr>
  ));

  return (
    <Stack gap="lg">
      <Seo title={t('seo.pages.admin')} />

      <Title order={2}>{t('admin.companies.title')}</Title>

      <Group justify="space-between" wrap="wrap">
        <DebouncedSearchInput
          onSearch={setSearch}
          label={t('admin.companies.searchLabel')}
          placeholder={t('admin.companies.searchPlaceholder')}
          w={260}
        />
        <Text c="dimmed" size="sm">
          {t('admin.companies.count', { count: companyCount })}
        </Text>
      </Group>

      {error ? (
        <Alert color="red" variant="light">
          {t('admin.loadError')}
        </Alert>
      ) : (
        <>
          <Table.ScrollContainer minWidth={700}>
            <Table verticalSpacing="sm">
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>{t('admin.companies.columns.name')}</Table.Th>
                  <Table.Th>{t('admin.companies.columns.users')}</Table.Th>
                  <Table.Th>{t('admin.companies.columns.subscription')}</Table.Th>
                  <Table.Th>{t('admin.companies.columns.createdAt')}</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {loading ? (
                  [1, 2, 3, 4, 5].map((row) => (
                    <Table.Tr key={row}>
                      {[1, 2, 3, 4].map((cell) => (
                        <Table.Td key={cell}>
                          <Skeleton height={20} />
                        </Table.Td>
                      ))}
                    </Table.Tr>
                  ))
                ) : rows}
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>

          {!loading && companies.length === 0 && (
            <Text c="dimmed" size="sm" ta="center">
              {t('admin.companies.empty')}
            </Text>
          )}

          {nextCursor && !loading && (
            <Group justify="center">
              <Button variant="light" onClick={loadMore} loading={loadingMore}>
                {t('admin.companies.loadMore')}
              </Button>
            </Group>
          )}
        </>
      )}
    </Stack>
  );
};

export default AdminCompaniesList;
