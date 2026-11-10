import { useCallback, useEffect, useState } from 'react';
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
import {
  IconMailForward,
  IconTrash,
  IconUserPlus,
} from '@tabler/icons-react';
import apiClient from '../../config/API/axiosConfig.js';
import Seo from '../../components/Seo.jsx';
import LockedTooltip from '../../components/LockedTooltip.jsx';
import { notifyError, notifySuccess } from '../../utils/notifications.js';
import { formatDateTime } from '../../utils/formatDate.js';

const roleLabel = (t, roleName) => t(`team.roles.${roleName}`, roleName);

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
  const [now, setNow] = useState(null);

  useEffect(() => {
    setNow(Date.now());
  }, []);

  const [inviteModalOpened, setInviteModalOpened] = useState(false);
  const [inviteRole, setInviteRole] = useState(null);
  const [inviteRoleError, setInviteRoleError] = useState(false);
  const [inviting, setInviting] = useState(false);

  const [removeTarget, setRemoveTarget] = useState(null);
  const [removing, setRemoving] = useState(false);

  const loadTeam = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await apiClient.get('/api/v1/team');

      setMembers(response.data.members);
      setInvites(response.data.invites);
      setCallerPermissions(response.data.callerPermissions);
      setAssignableRoles(response.data.assignableRoles);
      setCallerId(response.data.callerId ?? null);
    } catch (err) {
      const status = err?.response?.status;
      const code = err?.response?.data?.code;

      //* Users without a company membership (shouldn't reach this page - the
      //* wrapper redirects superadmins) get a specific message
      setError(status === 403 && code === 'COMPANY_MEMBERSHIP_REQUIRED' ? 'membership' : 'load');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadTeam();
  }, [loadTeam]);

  const canInvite = callerPermissions.includes('team.invite');
  const canRemove = callerPermissions.includes('team.remove');
  const canManageRoles = callerPermissions.includes('team.manage_roles');

  const assignableRoleOptions = assignableRoles.map((roleName) => ({
    value: roleName,
    label: roleLabel(t, roleName),
  }));

  const submitInvite = async (event) => {
    event.preventDefault();

    //* Mantine's Select `required` is not enforced by the browser
    if (!inviteRole) {
      setInviteRoleError(true);
      return;
    }

    setInviting(true);

    try {
      await apiClient.post('/api/v1/team/invites', {
        email: event.target.email.value,
        roleName: inviteRole,
      });

      notifySuccess(t('team.invites.sentToast'));
      setInviteModalOpened(false);
      setInviteRole(null);
      event.target.email.value = '';
      await loadTeam();
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
    if (!removeTarget) {
      return;
    }

    setRemoving(true);

    try {
      await apiClient.delete(`/api/v1/team/members/${removeTarget.id}`);

      notifySuccess(t('team.members.removedToast', { email: removeTarget.email }));
      setRemoveTarget(null);
      await loadTeam();
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

  const changeMemberRole = async (memberId, roleName) => {
    if (!roleName) {
      return;
    }

    try {
      await apiClient.patch(`/api/v1/team/members/${memberId}`, { roleName });

      notifySuccess(t('team.members.roleUpdatedToast'));
      await loadTeam();
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
  };

  const resendInvite = async (inviteId) => {
    try {
      await apiClient.post(`/api/v1/team/invites/${inviteId}/resend`);

      notifySuccess(t('team.invites.resentToast'));
      await loadTeam();
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
  };

  const revokeInvite = async (inviteId) => {
    try {
      await apiClient.delete(`/api/v1/team/invites/${inviteId}`);

      notifySuccess(t('team.invites.revokedToast'));
      await loadTeam();
    } catch (err) {
      if (err?.response?.status === 403) {
        notifyError(t('team.errors.forbidden'));
      } else {
        notifyError(t('team.errors.generic'));
      }
    }
  };

  const memberRows = members.map((member) => {
    //* The Select can only represent a single role that the caller is allowed
    //* to assign; other members (multi-role, or a role above the caller's
    //* reach such as the owner) keep their badge and a locked Select
    const currentRole = member.companyRoles.length === 1 ? member.companyRoles[0] : null;
    const roleNotAssignable = !currentRole || !assignableRoles.includes(currentRole);
    //* The API marks a member manageable only when the caller strictly
    //* outranks every role they hold; the caller's own row is never manageable
    const isSelf = callerId !== null && member.id === callerId;
    const outranked = !member.manageable;
    const rankLockLabel = isSelf ? t('team.locked.self') : t('team.locked.notOutranked');

    const roleLocked = !canManageRoles || isSelf || outranked || roleNotAssignable;
    const roleLockLabel = !canManageRoles
      ? t('team.locked.manageRoles')
      : isSelf || outranked
        ? rankLockLabel
        : t('team.locked.roleNotAssignable');

    const removeLocked = !canRemove || isSelf || outranked;
    const removeLockLabel = !canRemove ? t('team.locked.remove') : rankLockLabel;

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
            <LockedTooltip locked={roleLocked} label={roleLockLabel}>
              <Select
                size="xs"
                w={160}
                disabled={roleLocked}
                data={assignableRoleOptions}
                value={roleNotAssignable ? null : currentRole}
                onChange={(roleName) => changeMemberRole(member.id, roleName)}
                aria-label={t('team.members.roleChange', { email: member.email })}
              />
            </LockedTooltip>
            <LockedTooltip locked={removeLocked} label={removeLockLabel}>
              <ActionIcon
                variant="subtle"
                color="red"
                disabled={removeLocked}
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
    const expired = now !== null && new Date(invite.token_expires).getTime() < now;
    //* `manageable` = the caller can grant the invite's role
    const inviteLocked = !canInvite || !invite.manageable;
    const inviteLockLabel = !canInvite ? t('team.locked.invite') : t('team.locked.inviteRole');

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
          <Group gap={6} wrap="nowrap">
            <Text fz="sm">{formatDateTime(invite.token_expires)}</Text>
            {expired && (
              <Badge color="red" variant="light" size="sm">
                {t('team.invites.expiredBadge')}
              </Badge>
            )}
          </Group>
        </Table.Td>
        <Table.Td>
          <Group gap={0} justify="flex-end" wrap="nowrap">
            <LockedTooltip locked={inviteLocked} label={inviteLockLabel}>
              <ActionIcon
                variant="subtle"
                color="blue"
                disabled={inviteLocked}
                aria-label={t('team.invites.resend', { email: invite.email })}
                onClick={() => resendInvite(invite.id)}
              >
                <IconMailForward size={16} stroke={1.5} />
              </ActionIcon>
            </LockedTooltip>
            <LockedTooltip locked={inviteLocked} label={inviteLockLabel}>
              <ActionIcon
                variant="subtle"
                color="red"
                disabled={inviteLocked}
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
        <LockedTooltip locked={!canInvite} label={t('team.locked.invite')}>
          <Button
            leftSection={<IconUserPlus size={16} />}
            disabled={!canInvite}
            onClick={() => setInviteModalOpened(true)}
          >
            {t('team.inviteButton')}
          </Button>
        </LockedTooltip>
      </Group>

      {error ? (
        <Alert color="red" variant="light">
          {error === 'membership' ? t('team.errors.membershipRequired') : t('team.errors.loadError')}
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
                  {loading ? (
                    [1, 2, 3].map((row) => (
                      <Table.Tr key={row}>
                        {[1, 2, 3, 4].map((cell) => (
                          <Table.Td key={cell}>
                            <Skeleton height={20} />
                          </Table.Td>
                        ))}
                      </Table.Tr>
                    ))
                  ) : memberRows}
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
                  {loading ? (
                    [1, 2].map((row) => (
                      <Table.Tr key={row}>
                        {[1, 2, 3, 4].map((cell) => (
                          <Table.Td key={cell}>
                            <Skeleton height={20} />
                          </Table.Td>
                        ))}
                      </Table.Tr>
                    ))
                  ) : inviteRows}
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
        onClose={() => {
          setInviteModalOpened(false);
          setInviteRoleError(false);
        }}
        title={t('team.inviteModal.title')}
      >
        <form onSubmit={submitInvite}>
          <Stack>
            <TextInput
              name="email"
              label={t('team.inviteModal.email')}
              placeholder={t('team.inviteModal.emailPlaceholder')}
              type="email"
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
              <Button variant="default" onClick={() => setInviteModalOpened(false)} disabled={inviting}>
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
        onClose={() => setRemoveTarget(null)}
        title={t('team.members.removeModal.title')}
      >
        <Stack>
          <Text size="sm">
            {t('team.members.removeModal.description', { email: removeTarget?.email ?? '' })}
          </Text>
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
