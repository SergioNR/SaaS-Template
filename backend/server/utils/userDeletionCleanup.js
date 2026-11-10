import { deleteUserWithCompanyDataInDb } from '../models/userModel.js';
import { deleteS3Objects } from '../integrations/s3/deleteS3Objects.js';
import { cancelCompanyBillingInStripe } from '../integrations/stripe/subscription.js';
import { logError } from '../config/loggerFunctions.js';

//* Third-party side effects of a committed deletion. They run strictly after
//* the DB transaction so a rollback can never leave a cancelled Stripe
//* subscription or deleted bucket objects behind for a still-existing
//* company. Both calls are best-effort and never throw, so a provider outage
//* cannot flip an already-committed deletion into an error response
export const cleanupAfterUserDeletion = async (deletionResult) => {
  if (!deletionResult?.companyDeleted) {
    return;
  }

  try {
    //* Expires open checkouts and cancels EVERY access-granting subscription
    //* of the customer, not only the one the deleted row tracked
    await cancelCompanyBillingInStripe({
      companyId: deletionResult.companyId,
      stripeCustomerId: deletionResult.stripeCustomerId,
      stripeSubscriptionId: deletionResult.subscription?.stripe_subscription_id ?? null,
    });
  } catch (error) {
    logError(`Stripe cancellation after deleting user ${deletionResult.deletedUser?.id} failed`, error);
  }

  try {
    await deleteS3Objects(deletionResult.fileKeys ?? []);
  } catch (error) {
    logError(`Bucket cleanup after deleting user ${deletionResult.deletedUser?.id} failed`, error);
  }
};

//* Shared by self-, team- and admin-triggered deletion:
//* 1. one DB transaction removes the user, revokes their sessions and - when
//*    they were the last member - removes the company's subscription,
//*    invites, files and company rows (see deleteUserWithCompanyDataInDb)
//* 2. after the commit, the company's open Stripe checkouts are expired, its
//*    customer's access-granting subscriptions are cancelled at period end
//*    and the company's bucket objects are deleted
//* DB errors (e.g. P2003) propagate from step 1 only - step 2 never throws,
//* so callers can map DB errors without misreporting a committed delete.
//* Resolves to the model's result ({ status, ... })
export const deleteUserAndCleanup = async (userId, options = {}) => {
  const deletionResult = await deleteUserWithCompanyDataInDb(userId, options);

  if (deletionResult.status === 'deleted') {
    await cleanupAfterUserDeletion(deletionResult);
  }

  return deletionResult;
};
