import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useOutletContext, useSearchParams } from 'react-router';
import {
  ActionIcon,
  Alert,
  Anchor,
  Badge,
  Button,
  Group,
  Modal,
  Skeleton,
  Stack,
  Table,
  Text,
  Title,
} from '@mantine/core';
import { IconTrash } from '@tabler/icons-react';
import apiClient from '../../config/API/axiosConfig.js';
import Seo from '../../components/Seo.jsx';
import { notifyError, notifySuccess } from '../../utils/notifications.js';
import { formatDateTime } from '../../utils/formatDate.js';
import { useCursorList } from '../../hooks/useCursorList.js';
import DebouncedSearchInput from '../../components/DebouncedSearchInput.jsx';
import LockedTooltip from '../../components/LockedTooltip.jsx';
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
const FILTER_FIELDS = ADMIN_LIST_FILTER_FIELDS.users;

const AdminUsersList = () => {
  const { t } = useTranslation();
  //* Provided by AdminDashboardWrapper's <Outlet context>
  const { sessionUser } = useOutletContext();
  const [search, setSearch] = useState('');
  //* Applied filters and sort live in the URL so a filtered view can be
  //* shared or bookmarked; changing them rebuilds fetchUsers, which makes
  //* useCursorList restart from the first page
  const [searchParams, setSearchParams] = useSearchParams();
  const filterKey = searchParams.toString();
  const appliedFilters = useMemo(
    () => filterValuesFromSearchParams(FILTER_FIELDS, new URLSearchParams(filterKey)),
    [filterKey],
  );
  const sort = useMemo(() => sortFromSearchParams('users', new URLSearchParams(filterKey)), [filterKey]);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const fetchUsers = useCallback(
    async ({ cursor, signal } = {}) => {
      const response = await apiClient.get('/api/v1/admin/users', {
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

  const onLoadMoreError = useCallback(() => notifyError(t('admin.users.loadMoreError')), [t]);

  //* Stale-response handling (abort + request id) lives in useCursorList
  const {
    rows: users,
    rowCount: userCount,
    nextCursor,
    loading,
    loadingMore,
    error,
    errorStatus,
    reload,
    loadMore,
  } = useCursorList({ fetchPage: fetchUsers, rowsKey: 'users', countKey: 'userCount', onLoadMoreError });

  const confirmDelete = async () => {
    if (!deleteTarget) {
      return;
    }

    setDeleting(true);

    try {
      await apiClient.delete(`/api/v1/admin/users/${deleteTarget.id}`);

      notifySuccess(t('admin.users.deletedToast', { email: deleteTarget.email }));
      setDeleteTarget(null);
      await reload();
    } catch (err) {
      const status = err?.response?.status;
      const code = err?.response?.data?.code;

      if (status === 409 && code === 'LAST_COMPANY_OWNER') {
        notifyError(t('admin.users.deleteLastOwner'));
      } else if (status === 409) {
        notifyError(t('admin.users.deleteConflict'));
      } else if (status === 404) {
        notifyError(t('admin.users.deleteNotFound'));
      } else {
        notifyError(t('admin.users.deleteError'));
      }
    } finally {
      setDeleting(false);
    }
  };

  const rows = users.map((user) => {
    //* Admins delete their own account from their profile, not from this list
    const isSelf = user.id === sessionUser?.id;

    return (
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
          <Text fz="sm">{user.Company?.name ?? '—'}</Text>
        </Table.Td>
        <Table.Td>
          <Text fz="sm">{formatDateTime(user.last_login_at)}</Text>
        </Table.Td>
        <Table.Td>
          <Text fz="sm">{formatDateTime(user.created_at)}</Text>
        </Table.Td>
        <Table.Td>
          <Group gap={0} justify="flex-end">
            <LockedTooltip locked={isSelf} label={t('admin.users.deleteSelfLocked')}>
              <ActionIcon
                variant="subtle"
                color="red"
                disabled={isSelf}
                aria-label={t('admin.users.deleteAction', { email: user.email })}
                onClick={() => setDeleteTarget(user)}
              >
                <IconTrash size={16} stroke={1.5} />
              </ActionIcon>
            </LockedTooltip>
          </Group>
        </Table.Td>
      </Table.Tr>
    );
  });

  return (
    <Stack gap="lg">
      <Seo title={t('seo.pages.adminUsers')} />

      <Title order={2}>{t('admin.users.title')}</Title>

      <Group justify="space-between" wrap="wrap">
        <Group gap="sm" wrap="nowrap">
          <DebouncedSearchInput
            onSearch={setSearch}
            label={t('admin.users.searchLabel')}
            placeholder={t('admin.users.searchPlaceholder')}
            w={260}
          />
        </Group>
        <Text c="dimmed" size="sm">
          {t('admin.users.count', { count: userCount })}
        </Text>
      </Group>

      <AdminFilterPanel fields={FILTER_FIELDS} applied={appliedFilters} onApply={applyFilters} />

      {error ? (
        <Alert color="red" variant="light">
          {errorStatus === 422 ? t('admin.filters.invalid') : t('admin.loadError')}
        </Alert>
      ) : (
        <>
          <Table.ScrollContainer minWidth={900}>
            <Table verticalSpacing="sm">
              <Table.Thead>
                <Table.Tr>
                  <SortableTh sortKey="email" current={sort} onSort={applySort}>
                    {t('admin.users.columns.email')}
                  </SortableTh>
                  <Table.Th>{t('admin.users.columns.role')}</Table.Th>
                  <Table.Th>{t('admin.users.columns.company')}</Table.Th>
                  <SortableTh sortKey="last_login_at" current={sort} onSort={applySort}>
                    {t('admin.users.columns.lastLogin')}
                  </SortableTh>
                  <SortableTh sortKey="created_at" current={sort} onSort={applySort}>
                    {t('admin.users.columns.createdAt')}
                  </SortableTh>
                  <Table.Th />
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {loading ? (
                  [1, 2, 3, 4, 5].map((row) => (
                    <Table.Tr key={row}>
                      {[1, 2, 3, 4, 5, 6].map((cell) => (
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

          {!loading && users.length === 0 && (
            <Text c="dimmed" size="sm" ta="center">
              {t('admin.users.empty')}
            </Text>
          )}

          {nextCursor && !loading && (
            <Group justify="center">
              <Button variant="light" onClick={loadMore} loading={loadingMore}>
                {t('admin.users.loadMore')}
              </Button>
            </Group>
          )}
        </>
      )}

      <Modal
        opened={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        title={t('admin.users.deleteModal.title')}
      >
        <Stack>
          <Text size="sm">
            {t('admin.users.deleteModal.description', { email: deleteTarget?.email ?? '' })}
          </Text>
          {deleteTarget?.role === 'superadmin' && (
            <Alert color="red" variant="light">
              {t('admin.users.deleteModal.superadminWarning')}
            </Alert>
          )}
          <Group justify="flex-end">
            <Button variant="default" onClick={() => setDeleteTarget(null)} disabled={deleting}>
              {t('admin.users.deleteModal.cancel')}
            </Button>
            <Button color="red" onClick={confirmDelete} loading={deleting}>
              {t('admin.users.deleteModal.confirm')}
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Stack>
  );
};

export default AdminUsersList;
