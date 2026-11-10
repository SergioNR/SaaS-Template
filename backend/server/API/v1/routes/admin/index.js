import { Router } from 'express';
import { usersRouter } from './usersRouter.js';
import { companiesRouter } from './companiesRouter.js';
import { statsRouter } from './statsRouter.js';

//* Admin is a namespace-by-audience bounded context (everything a superadmin
//* touches) - sub-routers per resource keep the files navigable while the
//* single mount in apiRouter keeps the one superadmin gate. Sub-routers carry
//* no fallback: the one below catches every unmatched /v1/admin path

export const adminRouter = Router();

adminRouter.use('/users', usersRouter);
adminRouter.use('/companies', companiesRouter);
adminRouter.use('/stats', statsRouter);

adminRouter.use('/*fallback', (req, res) => {
  res.status(404).json({
    message: 'The requested route is not available or does not exist',
  }); //* Will catch failed requests even though they are authenticated & have the appropiate role
});
