import { useCallback, useEffect, useRef, useState } from 'react';
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
  TextInput,
  Title,
} from '@mantine/core';
import { IconSearch } from '@tabler/icons-react';
import apiClient from '../../config/API/axiosConfig.js';
import Seo from '../../components/Seo.jsx';
import SubscriptionStatusBadge from '../../components/shared/SubscriptionStatusBadge.jsx';
import { notifyError } from '../../utils/notifications.js';
import { formatDateTime } from '../../utils/formatDate.js';

const PAGE_SIZE = 25;
const SEARCH_DEBOUNCE_MS = 400;

const AdminCompaniesList = () => {
  const { t } = useTranslation();
  const [companies, setCompanies] = useState([]);
  const [companyCount, setCompanyCount] = useState(0);
  const [nextCursor, setNextCursor] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(false);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');

  useEffect(() => {
    const timer = setTimeout(() => setSearch(searchInput.trim()), SEARCH_DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [searchInput]);

  const fetchCompanies = useCallback(async ({ cursor, signal } = {}) => {
    const response = await apiClient.get('/api/v1/admin/companies', {
      params: {
        limit: PAGE_SIZE,
        ...(search ? { search } : {}),
        ...(cursor ? { cursor } : {}),
      },
      signal,
    });

    return response.data;
  }, [search]);

  //* Every first-page load (filter change, refresh) bumps the request id and
  //* aborts the previous request, so late responses for stale filters - first
  //* pages or load-more pages - are discarded instead of mixed into the list
  const requestIdRef = useRef(0);
  const abortRef = useRef(null);

  const loadFirstPage = useCallback(async () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const requestId = ++requestIdRef.current;

    setLoading(true);
    setError(false);
    setNextCursor(null);

    try {
      const data = await fetchCompanies({ signal: controller.signal });

      if (requestId !== requestIdRef.current) {
        return;
      }

      setCompanies(data.companies);
      setCompanyCount(data.companyCount);
      setNextCursor(data.nextCursor ?? null);
    } catch {
      if (requestId === requestIdRef.current) {
        setError(true);
      }
    } finally {
      if (requestId === requestIdRef.current) {
        setLoading(false);
      }
    }
  }, [fetchCompanies]);

  useEffect(() => {
    loadFirstPage();
  }, [loadFirstPage]);

  useEffect(() => () => abortRef.current?.abort(), []);

  const loadMore = async () => {
    const requestId = requestIdRef.current;
    const signal = abortRef.current?.signal;

    setLoadingMore(true);

    try {
      const data = await fetchCompanies({ cursor: nextCursor, signal });

      if (requestId !== requestIdRef.current) {
        return;
      }

      setCompanies((previousCompanies) => [...previousCompanies, ...data.companies]);
      setNextCursor(data.nextCursor ?? null);
    } catch {
      if (requestId !== requestIdRef.current) {
        return;
      }

      notifyError(t('admin.companies.loadMoreError'));
    } finally {
      setLoadingMore(false);
    }
  };

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
        <TextInput
          value={searchInput}
          onChange={(event) => setSearchInput(event.currentTarget.value)}
          placeholder={t('admin.companies.searchPlaceholder')}
          leftSection={<IconSearch size={16} stroke={1.5} />}
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
