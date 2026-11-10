import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useOutletContext } from 'react-router';
import {
  ActionIcon,
  Alert,
  Anchor,
  Badge,
  Button,
  Group,
  Modal,
  Select,
  Skeleton,
  Stack,
  Table,
  Text,
  TextInput,
  Title,
  Tooltip,
} from '@mantine/core';
import { IconSearch, IconTrash } from '@tabler/icons-react';
import apiClient from '../../config/API/axiosConfig.js';
import Seo from '../../components/Seo.jsx';
import { notifyError, notifySuccess } from '../../utils/notifications.js';
import { formatDateTime } from '../../utils/formatDate.js';

const PAGE_SIZE = 25;
const SEARCH_DEBOUNCE_MS = 400;

const AdminUsersList = () => {
  const { t } = useTranslation();
  //* Provided by AdminDashboardWrapper's <Outlet context>
  const { sessionUser } = useOutletContext();
  const [users, setUsers] = useState([]);
  const [userCount, setUserCount] = useState(0);
  const [nextCursor, setNextCursor] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(false);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [role, setRole] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setSearch(searchInput.trim()), SEARCH_DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [searchInput]);

  const fetchUsers = useCallback(async ({ cursor, signal } = {}) => {
    const response = await apiClient.get('/api/v1/admin/users', {
      params: {
        limit: PAGE_SIZE,
        ...(search ? { search } : {}),
        ...(role ? { role } : {}),
        ...(cursor ? { cursor } : {}),
      },
      signal,
    });

    return response.data;
  }, [search, role]);

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
      const data = await fetchUsers({ signal: controller.signal });

      if (requestId !== requestIdRef.current) {
        return;
      }

      setUsers(data.users);
      setUserCount(data.userCount);
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
  }, [fetchUsers]);

  useEffect(() => {
    loadFirstPage();
  }, [loadFirstPage]);

  useEffect(() => () => abortRef.current?.abort(), []);

  const loadMore = async () => {
    const requestId = requestIdRef.current;
    const signal = abortRef.current?.signal;

    setLoadingMore(true);

    try {
      const data = await fetchUsers({ cursor: nextCursor, signal });

      if (requestId !== requestIdRef.current) {
        return;
      }

      setUsers((previousUsers) => [...previousUsers, ...data.users]);
      setNextCursor(data.nextCursor ?? null);
    } catch {
      if (requestId !== requestIdRef.current) {
        return;
      }

      notifyError(t('admin.users.loadMoreError'));
    } finally {
      setLoadingMore(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) {
      return;
    }

    setDeleting(true);

    try {
      await apiClient.delete(`/api/v1/admin/users/${deleteTarget.id}`);

      notifySuccess(t('admin.users.deletedToast', { email: deleteTarget.email }));
      setDeleteTarget(null);
      await loadFirstPage();
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

  const roleOptions = [
    { value: 'user', label: t('admin.roles.user') },
    { value: 'superadmin', label: t('admin.roles.superadmin') },
  ];

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
            {/* Disabled controls swallow pointer events - the span keeps the tooltip hoverable */}
            <Tooltip label={t('admin.users.deleteSelfLocked')} disabled={!isSelf} withArrow>
              <span style={{ display: 'inline-flex' }}>
                <ActionIcon
                  variant="subtle"
                  color="red"
                  disabled={isSelf}
                  aria-label={t('admin.users.deleteAction', { email: user.email })}
                  onClick={() => setDeleteTarget(user)}
                >
                  <IconTrash size={16} stroke={1.5} />
                </ActionIcon>
              </span>
            </Tooltip>
          </Group>
        </Table.Td>
      </Table.Tr>
    );
  });

  return (
    <Stack gap="lg">
      <Seo title={t('seo.pages.admin')} />

      <Title order={2}>{t('admin.users.title')}</Title>

      <Group justify="space-between" wrap="wrap">
        <Group gap="sm" wrap="nowrap">
          <TextInput
            value={searchInput}
            onChange={(event) => setSearchInput(event.currentTarget.value)}
            placeholder={t('admin.users.searchPlaceholder')}
            leftSection={<IconSearch size={16} stroke={1.5} />}
            w={260}
          />
          <Select
            value={role}
            onChange={setRole}
            data={roleOptions}
            placeholder={t('admin.users.roleFilterPlaceholder')}
            clearable
            w={180}
          />
        </Group>
        <Text c="dimmed" size="sm">
          {t('admin.users.count', { count: userCount })}
        </Text>
      </Group>

      {error ? (
        <Alert color="red" variant="light">
          {t('admin.loadError')}
        </Alert>
      ) : (
        <>
          <Table.ScrollContainer minWidth={900}>
            <Table verticalSpacing="sm">
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>{t('admin.users.columns.email')}</Table.Th>
                  <Table.Th>{t('admin.users.columns.role')}</Table.Th>
                  <Table.Th>{t('admin.users.columns.company')}</Table.Th>
                  <Table.Th>{t('admin.users.columns.lastLogin')}</Table.Th>
                  <Table.Th>{t('admin.users.columns.createdAt')}</Table.Th>
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
