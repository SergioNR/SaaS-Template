import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useSearchParams } from 'react-router';
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
import AdminFilterPanel from '../../components/AdminFilterPanel.jsx';
import SortableTh from '../../components/SortableTh.jsx';
import {
  ADMIN_LIST_FILTER_FIELDS,
  filterValuesFromSearchParams,
  listRequestParams,
  mergeListSearchParams,
  nextSort,
  sortFromSearchParams,
} from '../../components/adminFilterValues.js';

const PAGE_SIZE = 25;
const FILTER_FIELDS = ADMIN_LIST_FILTER_FIELDS.companies;

const AdminCompaniesList = () => {
  const { t } = useTranslation();
  const [search, setSearch] = useState('');
  //* Applied filters and sort live in the URL (shareable views); changing
  //* them rebuilds fetchCompanies, which restarts the list from page one
  const [searchParams, setSearchParams] = useSearchParams();
  const filterKey = searchParams.toString();
  const appliedFilters = useMemo(
    () => filterValuesFromSearchParams(FILTER_FIELDS, new URLSearchParams(filterKey)),
    [filterKey],
  );
  const sort = useMemo(() => sortFromSearchParams('companies', new URLSearchParams(filterKey)), [filterKey]);

  const fetchCompanies = useCallback(
    async ({ cursor, signal } = {}) => {
      const response = await apiClient.get('/api/v1/admin/companies', {
        params: {
          limit: PAGE_SIZE,
          ...(search ? { search } : {}),
          ...listRequestParams({ filters: appliedFilters, sort }),
          ...(cursor ? { cursor } : {}),
        },
        signal,
      });

      return response.data;
    },
    [search, appliedFilters, sort],
  );

  const applyFilters = (filters) => setSearchParams(mergeListSearchParams(searchParams, FILTER_FIELDS, { filters }));
  const applySort = (key) =>
    setSearchParams(mergeListSearchParams(searchParams, FILTER_FIELDS, { sort: nextSort(sort, key) }));

  const onLoadMoreError = useCallback(() => notifyError(t('admin.companies.loadMoreError')), [t]);

  //* Stale-response handling (abort + request id) lives in useCursorList
  const {
    rows: companies,
    rowCount: companyCount,
    nextCursor,
    loading,
    loadingMore,
    error,
    errorStatus,
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
      <Seo title={t('seo.pages.adminCompanies')} />

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

      <AdminFilterPanel fields={FILTER_FIELDS} applied={appliedFilters} onApply={applyFilters} />

      {error ? (
        <Alert color="red" variant="light">
          {errorStatus === 422 ? t('admin.filters.invalid') : t('admin.loadError')}
        </Alert>
      ) : (
        <>
          <Table.ScrollContainer minWidth={700}>
            <Table verticalSpacing="sm">
              <Table.Thead>
                <Table.Tr>
                  <SortableTh sortKey="name" current={sort} onSort={applySort}>
                    {t('admin.companies.columns.name')}
                  </SortableTh>
                  <Table.Th>{t('admin.companies.columns.users')}</Table.Th>
                  <Table.Th>{t('admin.companies.columns.subscription')}</Table.Th>
                  <SortableTh sortKey="created_at" current={sort} onSort={applySort}>
                    {t('admin.companies.columns.createdAt')}
                  </SortableTh>
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
