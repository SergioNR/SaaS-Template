import { logger } from './logger.js';
import { sendErrorLogsToTelegram } from '../integrations/telegram/sendLogsToTelegram.js';

//* Only a whitelist of error fields is logged - serializing the whole error
//* object leaks whatever libraries attach to it (request bodies, headers,
//* connection strings, Prisma query params, ...)
export const serializeError = (error) => {
  if (error === null || error === undefined) {
    return { name: 'UnknownError', message: 'no error provided' };
  }

  if (typeof error !== 'object') {
    return { name: 'NonErrorThrown', message: String(error) };
  }

  const serialized = {
    name: error.name,
    message: error.message,
    code: error.code,
    status: error.status ?? error.statusCode,
    stack: error.stack,
  };

  return Object.fromEntries(Object.entries(serialized).filter(([, value]) => value !== undefined));
};

//* Severity decides the channel: errors page a human through Telegram, while
//* warnings and info stay in pino only - routine events must never flood the
//* alert chat, or real incidents drown in them
export const logError = (errorMessage, error, additionalInfo = 'N/A') => {
  try {
    logger.error({
      message: errorMessage,
      context: {
        errorDetails: serializeError(error),
        additionalInfo: additionalInfo,
      },
    });

    //* Fire-and-forget on purpose - the integration swallows its own errors,
    //* so a Telegram outage must never break or delay the log call
    sendErrorLogsToTelegram(errorMessage, serializeError(error), additionalInfo);
  } catch {
    // Fail silently
  }
};

export const logWarn = (message, error, additionalInfo = 'N/A') => {
  try {
    logger.warn({
      message: message,
      context: {
        errorDetails: serializeError(error),
        additionalInfo: additionalInfo,
      },
    });
  } catch {
    // Fail silently
  }
};

export const logInfo = (message, context = 'no context') => {
  try {
    logger.info({
      message: message,
      context: context,
    });
  } catch {
    // Fail silently
  }
};

//* Business-event audit line for successful writes. The payload is constant
//* action names, entity types, ids and FIELD NAMES only - never field values
//* or free text - so PII and secrets stay out of the logs by construction.
//* Info level keeps it out of the Telegram alert channel; the top-level
//* userId/companyId/reqId mirror the access-log fields so log searches work
//* across both line types
export const logAudit = (req, action, { entity, entityId, changedFields } = {}) => {
  try {
    const audit = {
      entity: entity,
      entityId: entityId ?? null,
    };

    if (changedFields !== undefined) {
      audit.changedFields = changedFields;
    }

    logger.info({
      message: action,
      audit: audit,
      userId: req?.user?.id ?? null,
      companyId: req?.user?.company_id ?? null,
      reqId: req?.id ?? null,
    });
  } catch {
    // Fail silently
  }
};

export const logRateLimited = (req) => {
  try {
    logger.warn({
      message: 'rate limit exceeded',
      context: {
        ipAddress: req.ip,
      },
    });
  } catch {
    // Fail silently
  }
};
