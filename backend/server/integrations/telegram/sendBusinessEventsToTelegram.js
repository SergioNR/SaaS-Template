import { isTelegramConfigured, sendTelegramMessage } from '../../config/telegramBotConfig.js';
import { logWarn } from '../../config/loggerFunctions.js';
import { escapeHtml } from './sendLogsToTelegram.js';

//* Optional low-noise "what happened today" channel, separate from the errors
//* chat. Read per call so the channel can be toggled without a code change
export const isBusinessEventsChannelConfigured = () => Boolean(
  isTelegramConfigured() && process.env.TELEGRAM_EVENTS_CHAT_ID,
);

const formatDate = (value) => {
  if (!value) {
    return null;
  }

  const date = new Date(value);

  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
};

const formatPlan = (plan) => (plan ? `${plan.planName} (${plan.planBillingCycle})` : 'unknown plan');

const formatActor = (actorKind) => ({
  self: 'the member themselves',
  team: 'a company admin',
  admin: 'a platform admin',
  system: 'automatic cleanup (unverified account)',
}[actorKind] ?? 'unknown');

//* Data minimisation by construction: every template only reads the fields
//* listed here - company name, plan, dates, role names, actor kind, counts.
//* Never emails, user/company/Stripe ids, tokens or passwords
const EVENT_TEMPLATES = {
  'company.registered': (fields) => ({
    title: 'New company registered',
    lines: [
      ['Company', fields.companyName || 'unnamed'],
      ['Trial ends', formatDate(fields.trialEndsAt)],
    ],
  }),
  'subscription.started': (fields) => ({
    title: fields.startKind === 'converted' ? 'Trial converted to a paid subscription' : 'Company resubscribed',
    lines: [
      ['Company', fields.companyName],
      ['Plan', formatPlan(fields.plan)],
      ['Type', fields.startKind === 'converted' ? 'converted from trial' : 'resubscribed'],
      ['Period ends', formatDate(fields.periodEndsAt)],
    ],
  }),
  'subscription.cancellation_scheduled': (fields) => ({
    title: 'Subscription cancellation scheduled',
    lines: [
      ['Company', fields.companyName],
      ['Plan', formatPlan(fields.plan)],
      ['Access ends', formatDate(fields.accessEndsAt)],
    ],
  }),
  'subscription.ended': (fields) => ({
    title: 'Subscription ended',
    lines: [
      ['Company', fields.companyName],
      ['Plan', formatPlan(fields.plan)],
      ['Final status', fields.status],
    ],
  }),
  'team.invite.accepted': (fields) => ({
    title: 'Team invite accepted',
    lines: [
      ['Company', fields.companyName],
      ['Role', fields.roleName],
      ['Members', fields.memberCount],
    ],
  }),
  'account.deleted': (fields) => (fields.platformAdmin
    ? { title: 'Platform admin account deleted', lines: [] }
    : {
      title: 'Account deleted',
      lines: [
        ['Deleted by', formatActor(fields.actorKind)],
        ['Company', fields.companyName],
        ['Remaining members', fields.remainingMemberCount],
      ],
    }),
  'company.deleted': (fields) => ({
    title: 'Company deleted',
    lines: [
      ['Company', fields.companyName],
      ['Deleted by', formatActor(fields.actorKind)],
      ['Had a paid subscription', fields.hadPaidSubscription ? 'yes' : 'no'],
    ],
  }),
};

export const BUSINESS_EVENTS = Object.keys(EVENT_TEMPLATES);

const line = ([label, value]) => (value === null || value === undefined || value === ''
  ? null
  : `<b>${escapeHtml(label)}</b>: ${escapeHtml(value)}`);

//* Pure - exported for the spec. Empty values are dropped, every value is
//* escaped and truncated by escapeHtml
export const buildBusinessEventMessage = (event, fields = {}) => {
  const template = EVENT_TEMPLATES[event];

  if (!template) {
    return null;
  }

  const { title, lines } = template(fields);

  return [`📈 <b>${escapeHtml(title)}</b>`, ...lines.map(line).filter(Boolean)].join('\n');
};

//* Fire-and-forget: callers wrap it in trackBackground and never await it on
//* a response path. Never throws; a failed delivery is a warning only - a
//* Telegram outage must never turn every signup into an error alert.
//* Resolves true when the message was delivered
export const sendBusinessEventToTelegram = async (event, fields = {}) => {
  try {
    if (!isBusinessEventsChannelConfigured()) {
      return false;
    }

    const message = buildBusinessEventMessage(event, fields);

    if (!message) {
      logWarn(`Unknown business event ${event} - not sent`, new Error('Unknown business event'));
      return false;
    }

    const delivered = await sendTelegramMessage(process.env.TELEGRAM_EVENTS_CHAT_ID, message);

    if (!delivered) {
      logWarn('Business event delivery failed', new Error('Telegram did not accept the message'), { event });
    }

    return delivered;
  } catch (error) {
    logWarn('Business event delivery failed', error, { event });
    return false;
  }
};
