import { Router } from 'express';

import { userRouter } from './v1/routes/userRouter.js';
import { authRouter } from './v1/routes/authRouter.js';
import { adminRouter } from './v1/routes/adminRouter.js';
import { billingRouter } from './v1/routes/billingRouter.js';
import { teamRouter } from './v1/routes/teamRouter.js';
import { filesRouter } from './v1/routes/filesRouter.js';
import { checkAuthentication } from '../middlewares/authenticationChecker.js';
import { checkPermissionByRole } from '../middlewares/permissionByRoleChecker.js';
import { checkCompanyMembership } from '../middlewares/companyMembershipChecker.js';
import { isS3Configured } from '../config/s3.js';
import { logInfo } from '../config/loggerFunctions.js';

export const apiRouter = Router();

const userRole = 'user';
const superadminRole = 'superadmin';

apiRouter.use('/v1/auth', authRouter);

apiRouter.use(
  '/v1/billing',
  checkAuthentication(),
  checkPermissionByRole(userRole),
  checkCompanyMembership(),
  billingRouter,
);

apiRouter.use(
  '/v1/user',
  checkAuthentication(),
  checkPermissionByRole(userRole),
  userRouter,
);

//* Team routes are open to every company member - the fine-grained company
//* permission checks happen per route inside teamRouter. Mounted like billing
//* so every company-scoped router shares the same gate chain
apiRouter.use(
  '/v1/team',
  checkAuthentication(),
  checkPermissionByRole(userRole),
  checkCompanyMembership(),
  teamRouter,
);

apiRouter.use(
  '/v1/admin',
  checkAuthentication(),
  checkPermissionByRole(superadminRole),
  adminRouter,
);

//* File storage is an optional feature - without S3_BUCKET the router is
//* never mounted and /api/v1/files falls through to the fallback 404 below
if (isS3Configured()) {
  apiRouter.use(
    '/v1/files',
    checkAuthentication(),
    checkPermissionByRole(userRole),
    checkCompanyMembership(),
    filesRouter,
  );
} else {
  //* An optional feature switched off is a startup note, not a warning
  logInfo('S3 storage is not configured (S3_BUCKET is not set) - /api/v1/files endpoints are disabled');
}

apiRouter.use('/*fallback', (req, res) => {
  res.status(404).json({
    message: 'The requested route is not available or does not exist',
  }); //* Will catch failed requests even though they are authenticated & have the appropiate role
});
