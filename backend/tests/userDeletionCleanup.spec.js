import { jest } from '@jest/globals';

const callOrder = [];

jest.unstable_mockModule('../server/models/userModel.js', () => ({
  deleteUserWithCompanyDataInDb: jest.fn(async () => {
    callOrder.push('db-transaction');
    return { status: 'deleted' };
  }),
}));

jest.unstable_mockModule('../server/integrations/stripe/subscription.js', () => ({
  cancelCompanyBillingInStripe: jest.fn(async () => { callOrder.push('stripe'); }),
}));

jest.unstable_mockModule('../server/integrations/s3/deleteS3Objects.js', () => ({
  deleteS3Objects: jest.fn(async () => { callOrder.push('s3'); return { deletedCount: 0, failedKeys: [] }; }),
}));

jest.unstable_mockModule('../server/config/loggerFunctions.js', () => ({
  logError: jest.fn(),
}));

const { cleanupAfterUserDeletion, deleteUserAndCleanup } = await import('../server/utils/userDeletionCleanup.js');
const { deleteUserWithCompanyDataInDb } = await import('../server/models/userModel.js');
const { cancelCompanyBillingInStripe } = await import('../server/integrations/stripe/subscription.js');
const { deleteS3Objects } = await import('../server/integrations/s3/deleteS3Objects.js');
const { logError } = await import('../server/config/loggerFunctions.js');

const companyDeletion = {
  status: 'deleted',
  deletedUser: { id: 'user-1', company_id: 'company-1' },
  companyDeleted: true,
  companyId: 'company-1',
  stripeCustomerId: 'cus_1',
  subscription: { stripe_subscription_id: 'sub_stripe123', expires_at: null },
  fileKeys: ['company-1/file-1/report.pdf', 'company-1/file-2/data.csv'],
};

describe('deleteUserAndCleanup', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    callOrder.length = 0;
  });

  it('passes the guard options to the transactional model function', async () => {
    deleteUserWithCompanyDataInDb.mockResolvedValueOnce({ status: 'deleted', companyDeleted: false });

    await deleteUserAndCleanup('user-1', { protectLastOwner: true, companyId: 'company-1' });

    expect(deleteUserWithCompanyDataInDb).toHaveBeenCalledWith('user-1', { protectLastOwner: true, companyId: 'company-1' });
  });

  it('touches neither Stripe nor the bucket while other users remain', async () => {
    deleteUserWithCompanyDataInDb.mockResolvedValueOnce({ status: 'deleted', companyDeleted: false });

    await deleteUserAndCleanup('user-1');

    expect(cancelCompanyBillingInStripe).not.toHaveBeenCalled();
    expect(deleteS3Objects).not.toHaveBeenCalled();
  });

  it('cancels Stripe and deletes the bucket objects only after the DB transaction committed', async () => {
    deleteUserWithCompanyDataInDb.mockImplementationOnce(async () => {
      callOrder.push('db-transaction');
      return companyDeletion;
    });

    const result = await deleteUserAndCleanup('user-1');

    expect(result).toBe(companyDeletion);
    expect(callOrder).toEqual(['db-transaction', 'stripe', 's3']);
    //* The whole customer is cleaned up, not only the stored subscription
    expect(cancelCompanyBillingInStripe).toHaveBeenCalledWith({
      companyId: 'company-1',
      stripeCustomerId: 'cus_1',
      stripeSubscriptionId: 'sub_stripe123',
    });
    expect(deleteS3Objects).toHaveBeenCalledWith(['company-1/file-1/report.pdf', 'company-1/file-2/data.csv']);
  });

  it('runs no external cleanup when the transaction refused the deletion', async () => {
    deleteUserWithCompanyDataInDb.mockResolvedValueOnce({ status: 'last_owner' });

    const result = await deleteUserAndCleanup('user-1', { protectLastOwner: true });

    expect(result).toEqual({ status: 'last_owner' });
    expect(cancelCompanyBillingInStripe).not.toHaveBeenCalled();
    expect(deleteS3Objects).not.toHaveBeenCalled();
  });

  it('runs no external cleanup when the transaction throws', async () => {
    deleteUserWithCompanyDataInDb.mockRejectedValueOnce(Object.assign(new Error('fk'), { code: 'P2003' }));

    await expect(deleteUserAndCleanup('user-1')).rejects.toThrow('fk');
    expect(cancelCompanyBillingInStripe).not.toHaveBeenCalled();
    expect(deleteS3Objects).not.toHaveBeenCalled();
  });
});

describe('cleanupAfterUserDeletion', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('still cleans up the Stripe customer when no subscription row existed', async () => {
    await cleanupAfterUserDeletion({ ...companyDeletion, subscription: null });

    //* A checkout completed in another tab may have created a subscription
    //* the deleted row never knew about
    expect(cancelCompanyBillingInStripe).toHaveBeenCalledWith({
      companyId: 'company-1',
      stripeCustomerId: 'cus_1',
      stripeSubscriptionId: null,
    });
    expect(deleteS3Objects).toHaveBeenCalledWith(companyDeletion.fileKeys);
  });

  it('never throws when a provider fails after the commit', async () => {
    cancelCompanyBillingInStripe.mockRejectedValueOnce(new Error('stripe down'));
    deleteS3Objects.mockRejectedValueOnce(new Error('s3 down'));

    await expect(cleanupAfterUserDeletion(companyDeletion)).resolves.toBeUndefined();
    expect(logError).toHaveBeenCalledTimes(2);
  });
});
