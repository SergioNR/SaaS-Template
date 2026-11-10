import bcrypt from 'bcryptjs';
import { BCRYPT_SALT_ROUNDS, SESSION_COOKIE_NAME, SESSION_COOKIE_OPTIONS } from '../config/security.js';
import { logError } from '../config/loggerFunctions.js';
import passport from '../auth/passportjs.js';
import { posthogUserSuccessLoggedIn } from '../models/posthogModel.js';
import {
  getUserByEmail,
  canCompanyMemberGrantRoleInDb,
  updateUserPasswordInDB,
  createUserInDB,
  getUserPassword,
  updateUserLastLoginDate,
} from '../models/userModel.js';
import {
  createPasswordResetToken,
  getPasswordResetTokenData,
  resetUserPasswordWithTokenInDb,
} from '../models/passwordResetTokensModel.js';
import { getTeamInviteByTokenInDb, deleteTeamInviteByIdSafe } from '../models/teamInvitesModel.js';
import { linkSessionToUser } from '../models/sessionModel.js';
import { sendResetPasswordTokenToUser } from '../integrations/brevo/transactionalEmails/sendResetPasswordTokenToUser.js';
import { sendExistingAccountNoticeToUser } from '../integrations/brevo/transactionalEmails/sendExistingAccountNoticeToUser.js';

//* Detached from the request: the lookup, token creation and email all run
//* after the response was sent, so neither the body nor the timing of the
//* response depends on whether the account exists. Swallows its own errors
const issuePasswordResetToken = async (email) => {
  try {
    const user = await getUserByEmail(email);

    if (!user) {
      return;
    }

    const passwordResetToken = await createPasswordResetToken(user.id);

    //* The function swallows its own errors - recipient is the stored address
    await sendResetPasswordTokenToUser(user.email, passwordResetToken);
  } catch (error) {
    logError('Password reset token issuance failed', error);
  }
};

export const requestPasswordResetToken = async (req, res) => {
  const { email } = req.body;

  issuePasswordResetToken(email); // Fire-and-forget

  //* Not checking / notifying for user existence to prevent security leaks
  return res.status(200).json({
    message: 'If this email exists, a reset link will be sent',
  });
};

export const checkPasswordResetTokenValidity = async (req, res) => {
  const { passwordResetToken } = req.query;

  const passwordResetTokenData = await getPasswordResetTokenData(passwordResetToken);

  if (!passwordResetTokenData) {
    return res.status(404).json({});
  }

  const {
    token_expires: tokenExpirationDate,
  } = passwordResetTokenData;

  if (new Date(tokenExpirationDate) < new Date()) {
    return res.status(400).json({
      message: 'Password reset token expired',
    });
  }

  return res.status(200).json({});
};

export const updateRecoveredUserPassword = async (req, res) => {
  const {
    newPassword,
    passwordResetToken,
  } = req.body;

  //* Hashed before the transaction so the slow bcrypt never holds row locks
  const hashedPassword = await bcrypt.hash(newPassword, BCRYPT_SALT_ROUNDS);

  //* Consumes the token (single use), updates the password and revokes every
  //* reset token and session of the user in one transaction
  const resetResult = await resetUserPasswordWithTokenInDb(passwordResetToken, hashedPassword);

  if (!resetResult) {
    return res.status(400).json({
      message: 'Password reset token is invalid or expired',
    });
  }

  return res.status(200).json({});
};

//* Both 400s of the invite check/accept carry a stable code so the SPA can
//* tell "ask for a new invite" from "the inviter can no longer vouch for it"
const INVITE_EXPIRED_RESPONSE = {
  message: 'Invite expired - Please ask a team admin for a new invite',
  code: 'INVITE_EXPIRED',
};

const INVITER_INVALID_RESPONSE = {
  message: 'Invite is no longer valid - the inviter left the company or lost the required role',
  code: 'INVITER_INVALID',
};

//* Fast path only - acceptance repeats the check under the company lock
const isInviterStillAbleToGrant = (inviteData) => canCompanyMemberGrantRoleInDb(
  inviteData.invited_by,
  inviteData.company_id,
  inviteData.Role.name,
);

export const checkTeamInviteValidity = async (req, res) => {
  const { inviteToken } = req.query;

  const inviteData = await getTeamInviteByTokenInDb(inviteToken);

  if (!inviteData) {
    return res.status(404).json({
      message: 'Team invite does not exist',
    });
  }

  const { token_expires: tokenExpirationDate } = inviteData;

  if (new Date(tokenExpirationDate) < new Date()) {
    return res.status(400).json(INVITE_EXPIRED_RESPONSE);
  }

  if (!(await isInviterStillAbleToGrant(inviteData))) {
    return res.status(400).json(INVITER_INVALID_RESPONSE);
  }

  return res.status(200).json({
    email: inviteData.email,
    companyName: inviteData.Company?.name,
    roleName: inviteData.Role.name,
  });
};

export const acceptTeamInvite = async (req, res) => {
  const {
    inviteToken,
    password,
  } = req.body;

  const inviteData = await getTeamInviteByTokenInDb(inviteToken);

  if (!inviteData) {
    return res.status(404).json({
      message: 'Team invite does not exist',
    });
  }

  const { token_expires: tokenExpires } = inviteData;

  if (new Date(tokenExpires) < new Date()) {
    return res.status(400).json(INVITE_EXPIRED_RESPONSE);
  }

  if (!(await isInviterStillAbleToGrant(inviteData))) {
    //* Void it - a dead inviter cannot be revived by a later resend either
    await deleteTeamInviteByIdSafe(inviteData.id);

    return res.status(400).json(INVITER_INVALID_RESPONSE);
  }

  const existingUser = await getUserByEmail(inviteData.email);

  if (existingUser) {
    //* The invitee registered on their own in the meantime. The row is kept
    //* (it expires and is cleaned up like any other): deleting it would make
    //* the invite vanish from GET /team and tell the inviting company that
    //* the address now has an account
    return res.status(409).json({
      message: 'Email is already registered - Please log in instead',
    });
  }

  const hashedPassword = await bcrypt.hash(password, BCRYPT_SALT_ROUNDS);

  let acceptResult;

  try {
    acceptResult = await createUserInDB({
      username: inviteData.email,
      password: hashedPassword,
      companyId: inviteData.company_id,
      roleId: inviteData.role_id,
      //* Re-checked under the company lock, in the same transaction as the
      //* user creation - a demotion committed after the fast path above
      //* still voids the invite
      roleName: inviteData.Role.name,
      invitedBy: inviteData.invited_by,
      //* Consumed in the same transaction as the user creation, with a
      //* conditional delete on id + digest + expiry - the lookup above is
      //* only a fast path, the transaction is the real guard
      inviteId: inviteData.id,
      inviteToken,
    });
  } catch (error) {
    //* Concurrent self-registration with the same email can beat the check
    //* above - the unique constraint resolves the race (the invite row is
    //* kept for the same reason as above; the transaction rolled back)
    if (error.code === 'P2002') {
      return res.status(409).json({
        message: 'Email is already registered - Please log in instead',
      });
    }

    throw error;
  }

  if (acceptResult.status === 'inviter_invalid') {
    //* The inviter was removed or demoted between the fast path and the
    //* transaction - the transaction already voided the invite
    return res.status(400).json(INVITER_INVALID_RESPONSE);
  }

  if (acceptResult.status !== 'created') {
    //* Consumed, revoked, rotated or expired between the lookup and the
    //* transaction - either way the link is dead and a new invite is needed
    return res.status(400).json({
      message: 'Invite is invalid or expired - Please ask a team admin for a new invite',
      code: 'INVITE_EXPIRED',
    });
  }

  //* No auto-login here - consistent with the register endpoint
  return res.status(201).json({});
};

//* Mounted behind checkAuthentication(), so req.user is always present here
export const checkSession = async (req, res) => res.status(200).json({
  user: {
    id: req.user.id,
    role: req.user.role,
  },
});

export const loginLocal = (req, res, next) => passport.authenticate('local', (err, user) => {
  if (err) {
    return next(err);
  }

  if (!user) { //* Will trigger if user does not exist
    return res.status(401).json({});
  }

  // Log the user in and establish a session
  return req.login(user, async (loginErr) => {
    if (loginErr) { //* A session-establishment failure is a server error, not a credentials error
      logError('User login failed', loginErr);
      return next(loginErr);
    }

    // Successful login
    //* Store the user id on the session row so sessions can be revoked by
    //* user. A failure aborts the login and destroys the session - an
    //* unlinked session could never be revoked
    try {
      await linkSessionToUser(req.sessionID, user.id);
    } catch (linkErr) {
      logError(`Could not link session to user ${user.id}`, linkErr);

      return req.session.destroy(() => next(linkErr));
    }

    posthogUserSuccessLoggedIn(user.id, 'local'); // Fire-and-forget function

    updateUserLastLoginDate(user.id); // Fire-and-forget function

    return res.status(200).json({
      user: {
        id: user.id,
        role: user.role,
      },
    });
  });
})(req, res, next);

//* Detached from the request so the existing-account and new-account paths
//* are indistinguishable in response body, status AND timing (the bcrypt
//* hash and the multi-row create would otherwise only run for new emails).
//* Swallows its own errors - they are logged, never surfaced to the client
const registerUserInBackground = async (email, password, companyName) => {
  try {
    const existingUser = await getUserByEmail(email);

    if (existingUser) {
      //* The function swallows its own errors - recipient is the stored address
      await sendExistingAccountNoticeToUser(existingUser.email);

      return;
    }

    const hashedPassword = await bcrypt.hash(password, BCRYPT_SALT_ROUNDS);

    //* The registrant founds the company and becomes its company owner
    await createUserInDB({
      username: email,
      password: hashedPassword,
      companyName,
    });
  } catch (error) {
    //* Concurrent registrations can beat the existence check - the unique
    //* constraint resolves the race, nothing else to do
    if (error.code === 'P2002') {
      return;
    }

    logError('Background user registration failed', error);
  }
};

export const registerUser = async (req, res) => {
  const { username, password, companyName } = req.body;

  registerUserInBackground(username, password, companyName); // Fire-and-forget

  //* Same shape & status for new and already-registered emails so the
  //* endpoint cannot be used to enumerate registered emails
  return res.status(201).json({});
};

export const updateUserPassword = async (req, res) => {
  const {
    currentPassword,
    newPassword,
  } = req.body;

  const { id: userId } = req.user;

  const currentHashedPasswordQuery = await getUserPassword(userId);

  if (!currentHashedPasswordQuery) {
    return res.status(404).json({});
  }

  const { password: currentHashedPassword } = currentHashedPasswordQuery;

  // Compare current password with stored hash
  const isMatch = await bcrypt.compare(currentPassword, currentHashedPassword);

  if (!isMatch) {
    //* Both 400s carry a stable code - the SPA maps it to user-facing copy
    return res.status(400).json({
      message: 'Current password is incorrect',
      code: 'AUTH_CURRENT_PASSWORD_INCORRECT',
    });
  }

  if (currentPassword === newPassword) {
    return res.status(400).json({
      message: 'New password must be different from the current password',
      code: 'AUTH_PASSWORD_UNCHANGED',
    });
  }

  // Hash the new password
  const newHashedPassword = await bcrypt.hash(newPassword, BCRYPT_SALT_ROUNDS);

  //* One transaction: new hash, every outstanding reset token revoked and
  //* every other session revoked - the current one is kept alive. A failure
  //* throws (500) instead of leaving a half-applied credential change
  const updatedUser = await updateUserPasswordInDB(userId, newHashedPassword, {
    keepSessionId: req.sessionID,
  });

  return res.status(200).json({
    userId: updatedUser.id,
  });
};

export const logoutUser = (req, res, next) => req.logout((err) => {
  if (err) {
    logError('User logout failed', err);
    return next(err);
  }

  // Destroy session explicitly
  return req.session.destroy((error) => {
    if (error) {
      logError('Session destruction failed', error);
      return next(error);
    }

    //* Clear cookie on client side - same attributes it was set with, or the
    //* browser keeps it
    res.clearCookie(SESSION_COOKIE_NAME, SESSION_COOKIE_OPTIONS);

    return res.status(200).json({});
  });
});
