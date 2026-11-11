import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActionIcon,
  Alert,
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
} from '@mantine/core';
import { IconMailForward, IconTrash, IconUserPlus } from '@tabler/icons-react';
import apiClient from '../../config/API/axiosConfig.js';
import Seo from '../../components/Seo.jsx';
import LockedTooltip from '../../components/LockedTooltip.jsx';
import { notifyError, notifySuccess } from '../../utils/notifications.js';
import { formatDateTime } from '../../utils/formatDate.js';
import { primeCompanyPermissions } from '../../hooks/useCompanyPermissions.js';
import { callerCapabilities, inviteButtonState, inviteLocks, memberLocks } from './teamLocks.js';

const roleLabel = (t, roleName) => t(`team.roles.${roleName}`, roleName);

const memberKey = (id) => `member:${id}`;
const inviteKey = (id) => `invite:${id}`;

export function Team() {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  //* null | 'load' | 'membership'
  const [error, setError] = useState(null);
  const [members, setMembers] = useState([]);
  const [invites, setInvites] = useState([]);
  const [callerPermissions, setCallerPermissions] = useState([]);
  const [assignableRoles, setAssignableRoles] = useState([]);
  const [callerId, setCallerId] = useState(null);
  //* Rows with a mutation in flight (role change, resend, revoke) - their
  //* controls are disabled so a double click cannot fire the request twice
  const [pendingIds, setPendingIds] = useState(() => new Set());

  const [inviteModalOpened, setInviteModalOpened] = useState(false);
  const [inviteRole, setInviteRole] = useState(null);
  const [inviteRoleError, setInviteRoleError] = useState(false);
  const [inviting, setInviting] = useState(false);

  const [removeTarget, setRemoveTarget] = useState(null);
  const [removing, setRemoving] = useState(false);

  //* Every load aborts the previous one and bumps the request id, so a slow
  //* response never overwrites a newer one (e.g. the reload after a mutation)
  const requestIdRef = useRef(0);
  const abortRef = useRef(null);

  //* `silent` (after a mutation) keeps the current table on screen instead
  //* of flashing the skeleton, and keeps the last good data on failure
  const loadTeam = useCallback(async ({ silent = false } = {}) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const requestId = ++requestIdRef.current;

    if (!silent) {
      setLoading(true);
      setError(null);
    }

    try {
      const response = await apiClient.get('/api/v1/team', { signal: controller.signal });

      if (requestId !== requestIdRef.current) {
        return;
      }

      setMembers(response.data.members);
      setInvites(response.data.invites);
      setCallerPermissions(response.data.callerPermissions);
      setAssignableRoles(response.data.assignableRoles);
      setCallerId(response.data.callerId ?? null);
      setError(null);
      //* Other pages (billing) read the same permissions from the session cache
      primeCompanyPermissions(response.data.callerPermissions);
    } catch (err) {
      if (requestId !== requestIdRef.current || silent) {
        return;
      }

      const status = err?.response?.status;
      const code = err?.response?.data?.code;

      //* Users without a company membership (shouldn't reach this page - the
      //* wrapper redirects superadmins) get a specific message
      setError(status === 403 && code === 'COMPANY_MEMBERSHIP_REQUIRED' ? 'membership' : 'load');
    } finally {
      if (requestId === requestIdRef.current && !silent) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    loadTeam();
  }, [loadTeam]);

  useEffect(() => () => abortRef.current?.abort(), []);

  const isPending = (key) => pendingIds.has(key);

  //* Marks a row busy for the duration of `action`; a second call while busy
  //* is dropped
  const pendingRef = useRef(new Set());
  const withPending = async (key, action) => {
    if (pendingRef.current.has(key)) {
      return;
    }

    pendingRef.current.add(key);
    setPendingIds(new Set(pendingRef.current));

    try {
      await action();
    } finally {
      pendingRef.current.delete(key);
      setPendingIds(new Set(pendingRef.current));
    }
  };

  const capabilities = callerCapabilities(callerPermissions);
  const permissionsKnown = !loading && !error;
  const inviteButton = inviteButtonState({ permissionsKnown, capabilities });

  const assignableRoleOptions = assignableRoles.map((roleName) => ({
    value: roleName,
    label: roleLabel(t, roleName),
  }));

  //* Shared by the modal's onClose and its Cancel button - dismissing the
  //* dialog by any means resets the role choice and its error
  const closeInviteModal = () => {
    if (inviting) {
      return;
    }

    setInviteModalOpened(false);
    setInviteRole(null);
    setInviteRoleError(false);
  };

  const submitInvite = async (event) => {
    event.preventDefault();

    if (inviting) {
      return;
    }

    //* Mantine's Select `required` is not enforced by the browser
    if (!inviteRole) {
      setInviteRoleError(true);
      return;
    }

    //* Captured before the await - React reuses the event object afterwards
    const form = event.currentTarget;

    setInviting(true);

    try {
      await apiClient.post('/api/v1/team/invites', {
        email: form.elements.email.value,
        roleName: inviteRole,
      });

      notifySuccess(t('team.invites.sentToast'));
      setInviteModalOpened(false);
      setInviteRole(null);
      form.reset();
      await loadTeam({ silent: true });
    } catch (err) {
      const status = err?.response?.status;

      //* 409 only means an invite is already pending for this email
      if (status === 409) {
        notifyError(t('team.errors.inviteConflict'));
      } else if (status === 403) {
        notifyError(t('team.errors.forbidden'));
      } else {
        notifyError(t('team.errors.generic'));
      }
    } finally {
      setInviting(false);
    }
  };

  const confirmRemove = async () => {
    if (!removeTarget || removing) {
      return;
    }

    setRemoving(true);

    try {
      await apiClient.delete(`/api/v1/team/members/${removeTarget.id}`);

      notifySuccess(t('team.members.removedToast', { email: removeTarget.email }));
      setRemoveTarget(null);
      await loadTeam({ silent: true });
    } catch (err) {
      const status = err?.response?.status;

      if (status === 409) {
        notifyError(t('team.errors.removeConflict'));
      } else if (status === 403) {
        notifyError(t('team.errors.forbidden'));
      } else {
        notifyError(t('team.errors.generic'));
      }
    } finally {
      setRemoving(false);
    }
  };

  const changeMemberRole = (memberId, roleName) => {
    if (!roleName) {
      return undefined;
    }

    return withPending(memberKey(memberId), async () => {
      try {
        await apiClient.patch(`/api/v1/team/members/${memberId}`, { roleName });

        notifySuccess(t('team.members.roleUpdatedToast'));
        await loadTeam({ silent: true });
      } catch (err) {
        const status = err?.response?.status;

        if (status === 409) {
          notifyError(t('team.errors.roleConflict'));
        } else if (status === 403) {
          notifyError(t('team.errors.forbidden'));
        } else {
          notifyError(t('team.errors.generic'));
        }
      }
    });
  };

  const resendInvite = (inviteId) =>
    withPending(inviteKey(inviteId), async () => {
      try {
        await apiClient.post(`/api/v1/team/invites/${inviteId}/resend`);

        notifySuccess(t('team.invites.resentToast'));
        await loadTeam({ silent: true });
      } catch (err) {
        const status = err?.response?.status;
        const code = err?.response?.data?.code;

        //* INVITER_INVALID: the original inviter can no longer grant the role -
        //* the invite has to be revoked and sent again. Any other 409 is a
        //* transient conflict worth retrying
        if (status === 409 && code === 'INVITER_INVALID') {
          notifyError(t('team.errors.resendInviterInvalid'));
        } else if (status === 409) {
          notifyError(t('team.errors.retry'));
        } else if (status === 403) {
          notifyError(t('team.errors.forbidden'));
        } else {
          notifyError(t('team.errors.generic'));
        }
      }
    });

  const revokeInvite = (inviteId) =>
    withPending(inviteKey(inviteId), async () => {
      try {
        await apiClient.delete(`/api/v1/team/invites/${inviteId}`);

        notifySuccess(t('team.invites.revokedToast'));
        await loadTeam({ silent: true });
      } catch (err) {
        if (err?.response?.status === 403) {
          notifyError(t('team.errors.forbidden'));
        } else {
          notifyError(t('team.errors.generic'));
        }
      }
    });

  const memberRows = members.map((member) => {
    const { currentRole, roleNotAssignable, roleLocked, roleLockLabel, removeLocked, removeLockLabel } = memberLocks({
      member,
      callerId,
      assignableRoles,
      capabilities,
    });
    const pending = isPending(memberKey(member.id));

    return (
      <Table.Tr key={member.id}>
        <Table.Td>
          <Text fz="sm">{member.email}</Text>
        </Table.Td>
        <Table.Td>
          <Group gap={4}>
            {member.companyRoles.map((roleName) => (
              <Badge
                key={roleName}
                color={roleName === 'company_owner' ? 'violet' : roleName === 'company_admin' ? 'indigo' : 'gray'}
                variant="light"
              >
                {roleLabel(t, roleName)}
              </Badge>
            ))}
          </Group>
        </Table.Td>
        <Table.Td>
          <Text fz="sm">{formatDateTime(member.created_at)}</Text>
        </Table.Td>
        <Table.Td>
          <Group gap="sm" justify="flex-end" wrap="nowrap">
            <LockedTooltip locked={roleLocked} label={t(roleLockLabel)}>
              <Select
                size="xs"
                w={160}
                disabled={roleLocked || pending}
                data={assignableRoleOptions}
                value={roleNotAssignable ? null : currentRole}
                onChange={(roleName) => changeMemberRole(member.id, roleName)}
                aria-label={t('team.members.roleChange', { email: member.email })}
                aria-busy={pending}
              />
            </LockedTooltip>
            <LockedTooltip locked={removeLocked} label={t(removeLockLabel)}>
              <ActionIcon
                variant="subtle"
                color="red"
                disabled={removeLocked || pending}
                aria-label={t('team.members.removeAction', { email: member.email })}
                onClick={() => setRemoveTarget(member)}
              >
                <IconTrash size={16} stroke={1.5} />
              </ActionIcon>
            </LockedTooltip>
          </Group>
        </Table.Td>
      </Table.Tr>
    );
  });

  const inviteRows = invites.map((invite) => {
    const { locked: inviteLocked, lockLabel: inviteLockLabel } = inviteLocks({ invite, capabilities });
    const pending = isPending(inviteKey(invite.id));

    return (
      <Table.Tr key={invite.id}>
        <Table.Td>
          <Text fz="sm">{invite.email}</Text>
        </Table.Td>
        <Table.Td>
          <Badge color="gray" variant="light">
            {roleLabel(t, invite.role)}
          </Badge>
        </Table.Td>
        <Table.Td>
          <Text fz="sm">{formatDateTime(invite.token_expires)}</Text>
        </Table.Td>
        <Table.Td>
          <Group gap={0} justify="flex-end" wrap="nowrap">
            <LockedTooltip locked={inviteLocked} label={t(inviteLockLabel)}>
              <ActionIcon
                variant="subtle"
                color="blue"
                disabled={inviteLocked || pending}
                aria-label={t('team.invites.resend', { email: invite.email })}
                onClick={() => resendInvite(invite.id)}
              >
                <IconMailForward size={16} stroke={1.5} />
              </ActionIcon>
            </LockedTooltip>
            <LockedTooltip locked={inviteLocked} label={t(inviteLockLabel)}>
              <ActionIcon
                variant="subtle"
                color="red"
                disabled={inviteLocked || pending}
                aria-label={t('team.invites.revoke', { email: invite.email })}
                onClick={() => revokeInvite(invite.id)}
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
      <Seo title={t('seo.pages.team')} />

      <Group justify="space-between" align="flex-start" wrap="wrap">
        <Title order={2}>{t('team.title')}</Title>
        <LockedTooltip locked={inviteButton.showLockTooltip} label={t('team.locked.invite')}>
          <Button
            leftSection={<IconUserPlus size={16} />}
            disabled={inviteButton.disabled}
            onClick={() => setInviteModalOpened(true)}
          >
            {t('team.inviteButton')}
          </Button>
        </LockedTooltip>
      </Group>

      {error ? (
        <Alert color="red" variant="light">
          <Stack gap="sm" align="flex-start">
            <Text size="sm">
              {error === 'membership' ? t('team.errors.membershipRequired') : t('team.errors.loadError')}
            </Text>
            {/* A missing membership will not fix itself - only offer a retry for load failures */}
            {error === 'load' && (
              <Button size="xs" variant="light" color="red" onClick={() => loadTeam()}>
                {t('common.retry')}
              </Button>
            )}
          </Stack>
        </Alert>
      ) : (
        <>
          <Stack gap="xs">
            <Title order={4}>{t('team.members.title')}</Title>
            <Table.ScrollContainer minWidth={800}>
              <Table verticalSpacing="sm">
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>{t('team.members.columns.email')}</Table.Th>
                    <Table.Th>{t('team.members.columns.role')}</Table.Th>
                    <Table.Th>{t('team.members.columns.joined')}</Table.Th>
                    <Table.Th />
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {loading
                    ? [1, 2, 3].map((row) => (
                        <Table.Tr key={row}>
                          {[1, 2, 3, 4].map((cell) => (
                            <Table.Td key={cell}>
                              <Skeleton height={20} />
                            </Table.Td>
                          ))}
                        </Table.Tr>
                      ))
                    : memberRows}
                </Table.Tbody>
              </Table>
            </Table.ScrollContainer>
            {!loading && members.length === 0 && (
              <Text c="dimmed" size="sm" ta="center">
                {t('team.members.empty')}
              </Text>
            )}
          </Stack>

          <Stack gap="xs">
            <Title order={4}>{t('team.invites.title')}</Title>
            <Table.ScrollContainer minWidth={800}>
              <Table verticalSpacing="sm">
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>{t('team.invites.columns.email')}</Table.Th>
                    <Table.Th>{t('team.invites.columns.role')}</Table.Th>
                    <Table.Th>{t('team.invites.columns.expires')}</Table.Th>
                    <Table.Th />
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {loading
                    ? [1, 2].map((row) => (
                        <Table.Tr key={row}>
                          {[1, 2, 3, 4].map((cell) => (
                            <Table.Td key={cell}>
                              <Skeleton height={20} />
                            </Table.Td>
                          ))}
                        </Table.Tr>
                      ))
                    : inviteRows}
                </Table.Tbody>
              </Table>
            </Table.ScrollContainer>
            {!loading && invites.length === 0 && (
              <Text c="dimmed" size="sm" ta="center">
                {t('team.invites.empty')}
              </Text>
            )}
          </Stack>
        </>
      )}

      <Modal
        opened={inviteModalOpened}
        onClose={closeInviteModal}
        title={t('team.inviteModal.title')}
      >
        <form onSubmit={submitInvite}>
          <Stack>
            <TextInput
              name="email"
              label={t('team.inviteModal.email')}
              placeholder={t('team.inviteModal.emailPlaceholder')}
              type="email"
              autoComplete="off"
              required
            />
            <Select
              label={t('team.inviteModal.role')}
              placeholder={t('team.inviteModal.rolePlaceholder')}
              data={assignableRoleOptions}
              value={inviteRole}
              onChange={(roleName) => {
                setInviteRole(roleName);
                setInviteRoleError(false);
              }}
              error={inviteRoleError ? t('team.inviteModal.roleRequired') : null}
              required
            />
            <Group justify="flex-end">
              <Button variant="default" onClick={closeInviteModal} disabled={inviting}>
                {t('team.inviteModal.cancel')}
              </Button>
              <Button type="submit" loading={inviting}>
                {t('team.inviteModal.submit')}
              </Button>
            </Group>
          </Stack>
        </form>
      </Modal>

      <Modal
        opened={removeTarget !== null}
        onClose={() => {
          if (!removing) {
            setRemoveTarget(null);
          }
        }}
        title={t('team.members.removeModal.title')}
      >
        <Stack>
          <Text size="sm">{t('team.members.removeModal.description', { email: removeTarget?.email ?? '' })}</Text>
          <Group justify="flex-end">
            <Button variant="default" onClick={() => setRemoveTarget(null)} disabled={removing}>
              {t('team.members.removeModal.cancel')}
            </Button>
            <Button color="red" onClick={confirmRemove} loading={removing}>
              {t('team.members.removeModal.confirm')}
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Stack>
  );
}

export default Team;
