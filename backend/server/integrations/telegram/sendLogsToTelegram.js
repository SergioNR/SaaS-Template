import { sendTelegramMessage } from '../../config/telegramBotConfig.js';

const chatIds = {
  errors: process.env.TELEGRAM_ERRORS_CHAT_ID,
};

//* Telegram hard limit is 4096 chars per message
const MAX_FIELD_LENGTH = 1000;

const HTML_ENTITIES = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
};

//* Messages are sent with parse_mode=HTML, so every interpolated value must be
//* escaped - otherwise a `<` in an error message breaks delivery, and
//* attacker-controlled text could inject markup/links into the alert
const stringify = (value) => {
  if (typeof value === 'string') {
    return value;
  }

  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    return String(value);
  }
};

export const escapeHtml = (value) => {
  const text = stringify(value);
  const truncated = text.length > MAX_FIELD_LENGTH ? `${text.slice(0, MAX_FIELD_LENGTH)}...` : text;

  return truncated.replace(/[&<>"]/g, (char) => HTML_ENTITIES[char]);
};

//* The same alert at most once per window per process: an error raised on
//* every request (database down, provider outage) must page once, not flood
//* the chat and hit Telegram's rate limits. pino still logs every occurrence
export const ALERT_DEDUPE_WINDOW_MS = 60 * 1000;
const MAX_TRACKED_ALERTS = 500;
const lastSentAtByAlert = new Map();

//* Exported for the spec - returns true when the alert may be sent now
export const shouldSendAlert = (alertKey, now = Date.now()) => {
  const lastSentAt = lastSentAtByAlert.get(alertKey);

  if (lastSentAt !== undefined && now - lastSentAt < ALERT_DEDUPE_WINDOW_MS) {
    return false;
  }

  //* Bounded memory: expired entries are pruned, and if every entry is
  //* still fresh the oldest one goes
  if (lastSentAtByAlert.size >= MAX_TRACKED_ALERTS) {
    for (const [key, sentAt] of lastSentAtByAlert) {
      if (now - sentAt >= ALERT_DEDUPE_WINDOW_MS) {
        lastSentAtByAlert.delete(key);
      }
    }

    if (lastSentAtByAlert.size >= MAX_TRACKED_ALERTS) {
      lastSentAtByAlert.delete(lastSentAtByAlert.keys().next().value);
    }
  }

  lastSentAtByAlert.set(alertKey, now);

  return true;
};

export const resetAlertDedupe = () => lastSentAtByAlert.clear();

//* With the pg driver adapter a database outage throws a Prisma error whose
//* message is only the "Invalid `prisma.x.y()` invocation:" header and whose
//* meaning lives in `code` (ECONNREFUSED, ...) - fall back to the code so the
//* alert always says what happened
const PRISMA_INVOCATION_HEADER_ONLY = /^\s*Invalid `[^`]+` invocation:\s*$/;

export const resolveErrorDetails = (error = {}) => {
  const message = typeof error?.message === 'string' ? error.message : '';

  if (message.trim() === '' || PRISMA_INVOCATION_HEADER_ONLY.test(message)) {
    return error?.code ?? 'N/A';
  }

  return message;
};

export const buildAlertKey = (errorMessage, error = {}) => [
  errorMessage,
  error?.name ?? '',
  error?.code ?? '',
  error?.message ?? '',
].join('|');

//* Only errors reach Telegram - info and warnings stay in pino (see
//* config/loggerFunctions.js), so there is no info chat sender anymore
export const sendErrorLogsToTelegram = async (errorMessage, error = {}, additionalInfo = 'N/A') => {
  //* Keyed on what identifies the incident - not the timestamp or details.
  //* The code is part of it: two failures with the same empty message but
  //* different codes are different incidents
  if (!shouldSendAlert(buildAlertKey(errorMessage, error))) {
    return;
  }

  //* The request id (set by the global error handler) lets whoever reads the
  //* alert jump straight to the matching access and error lines
  const requestId = additionalInfo !== null && typeof additionalInfo === 'object'
    ? additionalInfo.requestId
    : undefined;

  const telegramMessage = `
  🚨 <b>New error logged at ${new Date().toISOString()}</b> 🚨
  \n<b>Request Id</b>: ${escapeHtml(requestId ?? 'N/A')}
  \n<b>Error Name</b>: ${escapeHtml(error?.name ?? 'N/A')}
  \n<b>Error Code</b>: ${escapeHtml(error?.code ?? 'N/A')}
  \n<b>Error Message</b>: ${escapeHtml(errorMessage)}
  \n<b>Error Details</b>: ${escapeHtml(resolveErrorDetails(error))}
  \n<b>Additional Info</b>: ${escapeHtml(additionalInfo)}
  `;

  await sendTelegramMessage(chatIds.errors, telegramMessage);
};
