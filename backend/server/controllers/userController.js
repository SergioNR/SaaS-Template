import bcrypt from 'bcrypt';
import { getUserById, getUserPassword, updateUserPasswordInDb } from '../models/userModel.js';
import { BCRYPT_SALT_ROUNDS, SESSION_COOKIE_NAME, SESSION_COOKIE_OPTIONS } from '../config/security.js';
import { deleteUserAndCleanup } from '../utils/userDeletionCleanup.js';
import { logAudit } from '../config/loggerFunctions.js';
import { sendMappedWriteError } from '../utils/prismaErrors.js';

const USER_DELETION_WRITE_ERRORS = {
  P2003: { status: 409, message: 'User deletion failed - Related DB entries exist' },
};

export const getUserProfile = async (req, res) => {
  const { id: userId } = req.user;

  const userProfile = await getUserById(userId);

  if (!userProfile) {
    return res.status(404).json({});
  }

  return res.status(200).json({
    user: userProfile,
  });
};

//* PATCH /api/v1/user/password - also served by the deprecated alias
//* PATCH /api/v1/auth/update-user-password
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
  const updatedUser = await updateUserPasswordInDb(userId, newHashedPassword, {
    keepSessionId: req.sessionID,
  });

  logAudit(req, 'user.password.updated', { entity: 'user', entityId: updatedUser.id });

  return res.status(200).json({
    userId: updatedUser.id,
  });
};

export const deleteUser = async (req, res) => {
  let deletionResult;

  try {
    //* The last company owner cannot leave while other members remain -
    //* nobody would be left to manage them. Checked under the company lock
    //* inside the deletion transaction
    deletionResult = await deleteUserAndCleanup(req.user.id, {
      protectLastOwner: true,
    });
  } catch (error) {
    //* Only the DB transaction can throw - post-commit cleanup never does,
    //* so a mapped 409/404 here always means nothing was deleted
    if (sendMappedWriteError(res, error, USER_DELETION_WRITE_ERRORS)) {
      return res;
    }

    throw error; //* Forwarded to the global error handler (Express 5)
  }

  if (deletionResult.status === 'not_found') {
    return res.status(404).json({});
  }

  if (deletionResult.status === 'last_owner') {
    return res.status(409).json({
      message: 'You are the last company owner - make another member an owner before deleting your account',
      code: 'USER_LAST_COMPANY_OWNER',
    });
  }

  if (deletionResult.status === 'last_superadmin') {
    return res.status(409).json({
      message: 'You are the last superadmin - promote another superadmin before deleting your account',
      code: 'LAST_SUPERADMIN',
    });
  }

  logAudit(req, 'user.deleted', { entity: 'user', entityId: req.user.id });

  if (deletionResult.companyDeleted) {
    logAudit(req, 'company.deleted', { entity: 'company', entityId: deletionResult.companyId });
  }

  //* Best-effort destruction of the (now revoked) current session
  return req.session.destroy(() => {
    res.clearCookie(SESSION_COOKIE_NAME, SESSION_COOKIE_OPTIONS); //* Same attributes it was set with, or the browser keeps it

    return res.status(200).json({});
  });
};
