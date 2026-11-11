import { logWarn } from '../config/loggerFunctions.js';
import { getCompanyByIdInDb } from '../models/companyModel.js';
import { getSubscriptionDataInDb } from '../models/subscriptionModel.js';
import { countUsersInDb } from '../models/userModel.js';
import { isStoredSubscriptionActive } from '../config/stripeSubscriptionStatuses.js';
import {
  isBusinessEventsChannelConfigured,
  sendBusinessEventToTelegram,
} from '../integrations/telegram/sendBusinessEventsToTelegram.js';

//* Glue between committed writes and the optional business-events channel:
//* reads the few display fields the message needs (company name, counts) and
//* hands plain data to the integration. Every notifier runs AFTER the write
//* committed, is called without `await` inside trackBackground(...), checks
//* the channel first (no database reads when it is off) and never throws -
//* failures only warn

const runNotifier = async (event, buildEvents) => {
  if (!isBusinessEventsChannelConfigured()) {
    return;
  }

  try {
    const events = await buildEvents();

    for (const [eventName, fields] of events) {
      await sendBusinessEventToTelegram(eventName, fields);
    }
  } catch (error) {
    logWarn(`Business event ${event} could not be prepared`, error, { event });
  }
};

const getCompanyName = async (companyId) => (companyId ? (await getCompanyByIdInDb(companyId))?.name ?? null : null);

export const notifyCompanyRegistered = (companyId) => runNotifier('company.registered', async () => {
  const [companyName, subscription] = await Promise.all([
    getCompanyName(companyId),
    getSubscriptionDataInDb(companyId),
  ]);

  return [['company.registered', { companyName, trialEndsAt: subscription?.expires_at ?? null }]];
});

export const notifyInviteAccepted = ({ companyId, companyName, roleName }) => runNotifier('team.invite.accepted', async () => {
  const memberCount = await countUsersInDb({ company_id: companyId });

  return [['team.invite.accepted', { companyName, roleName, memberCount }]];
});

//* `transition` comes from classifySubscriptionTransition (webhook handler)
export const notifySubscriptionTransition = (companyId, transition) => runNotifier(transition.event, async () => {
  const companyName = await getCompanyName(companyId);

  return [[transition.event, { ...transition.fields, companyName }]];
});

//* `deletionResult` is deleteUserWithCompanyDataInDb's 'deleted' result. A
//* deleted company's name is read inside the deletion transaction (the row
//* is gone after the commit); a remaining company is read now
export const notifyUserDeleted = (deletionResult, actorKind) => runNotifier('account.deleted', async () => {
  const { deletedUser } = deletionResult;

  if (deletedUser?.role === 'superadmin') {
    return [['account.deleted', { platformAdmin: true }]];
  }

  if (deletionResult.companyDeleted) {
    const companyName = deletionResult.companyName ?? null;

    return [
      ['account.deleted', { actorKind, companyName, remainingMemberCount: 0 }],
      ['company.deleted', {
        actorKind,
        companyName,
        hadPaidSubscription: isStoredSubscriptionActive(deletionResult.subscription),
      }],
    ];
  }

  return [['account.deleted', {
    actorKind,
    companyName: await getCompanyName(deletedUser?.company_id),
    remainingMemberCount: deletionResult.remainingMemberCount ?? null,
  }]];
});
