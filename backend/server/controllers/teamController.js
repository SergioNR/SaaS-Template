import {
  canCompanyMemberGrantRoleInDb,
  getCompanyMembersInDb,
  getOneCompanyMemberInDb,
  getUserByEmail,
  updateCompanyMemberRoleInDb,
} from '../models/userModel.js';
import {
  createTeamInviteInDb,
  deleteTeamInviteInDb,
  getCompanyPendingInvitesInDb,
  getPendingTeamInviteByCompanyAndEmailInDb,
  getTeamInviteByIdInDb,
  rotateTeamInviteTokenInDb,
} from '../models/teamInvitesModel.js';
import {
  getUserCompanyPermissions,
  getUserCompanyRoleNames,
  getRoleByName,
} from '../models/roleModel.js';
import { getCompanyByIdInDb } from '../models/companyModel.js';
import { deleteUserAndCleanup } from '../utils/userDeletionCleanup.js';
import { canGrantRole, outranksAllRoles, rolesGrantableBy } from '../utils/companyRoleHierarchy.js';
import { logError } from '../config/loggerFunctions.js';
import { sendTeamInviteToUser } from '../integrations/brevo/transactionalEmails/sendTeamInviteToUser.js';

const targetRoleNames = (targetMember) => targetMember.UserRoles.map((userRole) => userRole.Role.name);

const toMemberShape = (member) => ({
  id: member.id,
  email: member.email,
  role: member.role,
  created_at: member.created_at,
  companyRoles: member.UserRoles.map((userRole) => userRole.Role.name),
});

//* Whitelisted shape - the token digest never reaches a response and the raw
//* invite token only ever travels inside the invite email
const toInviteShape = (invite, roleName) => ({
  id: invite.id,
  email: invite.email,
  role: roleName,
  token_expires: invite.token_expires,
  created_at: invite.created_at,
});

export const getTeamData = async (req, res) => {
  const {
    company_id: companyId,
    id: userId,
  } = req.user;

  //* Callers only see the controls their own company roles allow
  const [companyMembers, companyInvites, callerPermissions, callerRoleNames] = await Promise.all([
    getCompanyMembersInDb(companyId),
    getCompanyPendingInvitesInDb(companyId),
    getUserCompanyPermissions(userId),
    getUserCompanyRoleNames(userId),
  ]);

  const assignableRoles = rolesGrantableBy(callerRoleNames);

  //* `manageable` mirrors the server-side rules so the SPA only offers the
  //* actions that can succeed: members follow the strict "outrank every
  //* role, never yourself" rule, invites the "at or below own rank" rule.
  //* The write endpoints re-check both - these flags are hints, not guards
  return res.status(200).json({
    callerId: userId,
    members: companyMembers.map((member) => ({
      ...toMemberShape(member),
      manageable: outranksAllRoles(callerRoleNames, targetRoleNames(member)) && member.id !== userId,
    })),
    invites: companyInvites.map((invite) => ({
      ...toInviteShape(invite, invite.Role.name),
      manageable: canGrantRole(callerRoleNames, invite.Role.name),
    })),
    callerPermissions,
    assignableRoles,
  });
};

//* Detached from the request: only the email side effect depends on whether
//* the invited address already has an account, so the lookup runs after the
//* response was sent. An unregistered address gets the invite link; a
//* registered one gets nothing (accepting would answer 409 anyway, and the
//* existing-account notice is worded for registration attempts). Swallows
//* its own errors
const deliverInviteInBackground = async (invite, inviteToken, companyId, inviterEmail) => {
  try {
    const existingUser = await getUserByEmail(invite.email);

    if (existingUser) {
      return;
    }

    const company = await getCompanyByIdInDb(companyId);

    //* The function swallows its own errors so an email provider outage is
    //* only ever logged
    await sendTeamInviteToUser(invite.email, inviteToken, company?.name, inviterEmail);
  } catch (error) {
    logError(`Background delivery of team invite ${invite.id} failed`, error);
  }
};

const PENDING_INVITE_CONFLICT = {
  message: 'An invite is already pending for this email - resend it instead',
};

export const createTeamInvite = async (req, res) => {
  const { email, roleName } = req.body;

  const {
    company_id: companyId,
    email: inviterEmail,
    id: inviterId,
  } = req.user;

  //* Every check that can change the response is company-scoped or about the
  //* caller - nothing here depends on the invited account existing
  const existingInvite = await getPendingTeamInviteByCompanyAndEmailInDb(companyId, email);

  if (existingInvite) {
    return res.status(409).json(PENDING_INVITE_CONFLICT);
  }

  const role = await getRoleByName(roleName);

  if (!role) {
    return res.status(404).json({
      message: 'Role does not exist',
    });
  }

  //* Callers can only grant roles they hold themselves (directly or through
  //* the role hierarchy)
  const callerRoleNames = await getUserCompanyRoleNames(inviterId);

  if (!canGrantRole(callerRoleNames, roleName)) {
    return res.status(403).json({
      message: 'You can only invite users to roles you hold yourself',
    });
  }

  //* The row is written synchronously for every address - registered or
  //* not - so GET /team, a repeated POST (409) and resend/revoke behave the
  //* same either way and cannot be used to probe for accounts. Only the
  //* email differs, and it runs detached (deliverInviteInBackground)
  let creation;

  try {
    creation = await createTeamInviteInDb({
      email,
      companyId,
      roleId: role.id,
      invitedBy: inviterId,
    });
  } catch (error) {
    //* A concurrent invite for the same company+email beat the pending check
    //* - the unique constraint resolves the race
    if (error.code === 'P2002') {
      return res.status(409).json(PENDING_INVITE_CONFLICT);
    }

    throw error;
  }

  const { invite, inviteToken } = creation;

  deliverInviteInBackground(invite, inviteToken, companyId, inviterEmail); // Fire-and-forget

  return res.status(201).json({
    invite: toInviteShape(invite, role.name),
  });
};

export const resendTeamInvite = async (req, res) => {
  const { inviteId } = req.params;

  const {
    company_id: companyId,
    email: inviterEmail,
    id: callerId,
  } = req.user;

  const invite = await getTeamInviteByIdInDb(inviteId, companyId);

  if (!invite) {
    return res.status(404).json({
      message: 'Invite does not exist',
    });
  }

  //* Resending re-issues the invite's role, so the caller must be able to
  //* grant it - an admin cannot keep an owner invite alive
  const callerRoleNames = await getUserCompanyRoleNames(callerId);

  if (!canGrantRole(callerRoleNames, invite.Role.name)) {
    return res.status(403).json({
      message: 'You can only resend invites to roles you hold yourself',
    });
  }

  //* The rotated link would be refused on click (accept re-checks the
  //* original inviter), so refuse up front instead of mailing a dead link -
  //* the caller can revoke it and issue a fresh invite under their own name
  if (!(await canCompanyMemberGrantRoleInDb(invite.invited_by, companyId, invite.Role.name))) {
    return res.status(409).json({
      message: 'The original inviter left the company or can no longer grant this role - revoke the invite and send a new one',
      code: 'INVITER_INVALID',
    });
  }

  let rotation;

  try {
    //* Single atomic UPDATE - the previous link stops working, the expiry
    //* window resets and the invite id (and original inviter) stay the same
    rotation = await rotateTeamInviteTokenInDb(inviteId, companyId);
  } catch (error) {
    if (error.code === 'P2002') {
      return res.status(409).json({
        message: 'The invite could not be rotated - please try again',
      });
    }

    throw error;
  }

  if (!rotation) {
    //* Revoked or accepted between the lookup and the rotation
    return res.status(404).json({
      message: 'Invite does not exist',
    });
  }

  const { invite: rotatedInvite, inviteToken } = rotation;

  //* The row is never deleted here, registered invitee or not - the same
  //* detached delivery as on creation decides whether an email goes out
  deliverInviteInBackground(rotatedInvite, inviteToken, companyId, inviterEmail); // Fire-and-forget

  return res.status(200).json({
    invite: toInviteShape(rotatedInvite, invite.Role.name),
  });
};

export const revokeTeamInvite = async (req, res) => {
  const { inviteId } = req.params;

  const {
    company_id: companyId,
    id: callerId,
  } = req.user;

  const invite = await getTeamInviteByIdInDb(inviteId, companyId);

  if (!invite) {
    return res.status(404).json({
      message: 'Invite does not exist',
    });
  }

  //* Same rank rule as creating the invite: nobody revokes invites to roles
  //* above their own
  const callerRoleNames = await getUserCompanyRoleNames(callerId);

  if (!canGrantRole(callerRoleNames, invite.Role.name)) {
    return res.status(403).json({
      message: 'You can only revoke invites to roles you hold yourself',
    });
  }

  await deleteTeamInviteInDb(inviteId, companyId);

  return res.status(200).json({});
};

//* Callers may only manage members they outrank - every role the target
//* holds must rank strictly below the caller's own, so an admin can never
//* demote or remove an owner nor another admin. The controller checks only
//* answer early; the model repeats them under the company lock with fresh
//* role rows
export const removeTeamMember = async (req, res) => {
  const { userId } = req.params;

  const {
    company_id: companyId,
    id: callerId,
  } = req.user;

  if (userId === callerId) {
    return res.status(409).json({
      message: 'You cannot remove yourself - delete your account from the profile page instead',
    });
  }

  const targetMember = await getOneCompanyMemberInDb(userId, companyId);

  if (!targetMember) {
    return res.status(404).json({
      message: 'Member not found in your company',
    });
  }

  const callerRoleNames = await getUserCompanyRoleNames(callerId);

  if (!outranksAllRoles(callerRoleNames, targetRoleNames(targetMember))) {
    return res.status(403).json({
      message: 'You can only remove members whose every role ranks below your own',
    });
  }

  //* The rank and last-owner checks are repeated inside the transaction,
  //* under the company lock, together with the delete itself
  const deletionResult = await deleteUserAndCleanup(userId, {
    companyId,
    protectLastOwner: true,
    callerId,
  });

  if (deletionResult.status === 'not_found') {
    return res.status(404).json({
      message: 'Member not found in your company',
    });
  }

  if (deletionResult.status === 'forbidden') {
    return res.status(403).json({
      message: 'You can only remove members whose every role ranks below your own',
    });
  }

  if (deletionResult.status === 'last_owner') {
    return res.status(409).json({
      message: 'The last company owner cannot be removed',
    });
  }

  return res.status(200).json({
    userId,
  });
};

export const updateTeamMemberRole = async (req, res) => {
  const { userId } = req.params;
  const { roleName } = req.body;

  const {
    company_id: companyId,
    id: callerId,
  } = req.user;

  if (userId === callerId) {
    return res.status(409).json({
      message: 'You cannot change your own role',
    });
  }

  const targetMember = await getOneCompanyMemberInDb(userId, companyId);

  if (!targetMember) {
    return res.status(404).json({
      message: 'Member not found in your company',
    });
  }

  const role = await getRoleByName(roleName);

  if (!role) {
    return res.status(404).json({
      message: 'Role does not exist',
    });
  }

  const callerRoleNames = await getUserCompanyRoleNames(callerId);

  //* Granting is "at or below own rank", managing the current holder is
  //* "strictly below" - both must hold
  if (!canGrantRole(callerRoleNames, roleName)) {
    return res.status(403).json({
      message: 'You can only assign roles you hold yourself',
    });
  }

  if (!outranksAllRoles(callerRoleNames, targetRoleNames(targetMember))) {
    return res.status(403).json({
      message: 'You can only change the role of members whose every role ranks below your own',
    });
  }

  //* The rank and last-owner checks are repeated inside the transaction,
  //* under the company lock, together with the write itself
  const updateResult = await updateCompanyMemberRoleInDb(userId, companyId, role, {
    callerId,
  });

  if (updateResult.status === 'not_found') {
    return res.status(404).json({
      message: 'Member not found in your company',
    });
  }

  if (updateResult.status === 'forbidden') {
    return res.status(403).json({
      message: 'You can only change the role of members whose every role ranks below your own',
    });
  }

  if (updateResult.status === 'last_owner') {
    return res.status(409).json({
      message: 'The last company owner cannot be demoted',
    });
  }

  return res.status(200).json({
    member: toMemberShape(updateResult.member),
  });
};
