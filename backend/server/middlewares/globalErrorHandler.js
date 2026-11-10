import { STATUS_CODES } from 'node:http';
import { logError, logWarn } from '../config/loggerFunctions.js';

//* body-parser and http-errors set `status` / `statusCode` (e.g. 400 for
//* malformed JSON, 413 for oversized bodies) - keep those instead of a 500
const resolveStatusCode = (err) => {
  const candidate = err?.status ?? err?.statusCode;

  return Number.isInteger(candidate) && candidate >= 400 && candidate < 600 ? candidate : 500;
};

export const globalErrorHandler = (err, req, res, next) => {
  //* Once the response has started streaming Express must close the socket
  if (res.headersSent) {
    return next(err);
  }

  const statusCode = resolveStatusCode(err);
  const isClientError = statusCode < 500;
  const isLocalhost = process.env.DEPLOY_ENVIRONMENT === 'localhost';

  //* Request context so every error/warning line correlates with its
  //* access-log line by request id (req.id is set by requestLogger).
  //* req.path (not originalUrl) keeps query-string secrets such as password
  //* reset tokens out of the logs
  const requestContext = {
    requestId: req?.id ?? null,
    method: req?.method ?? null,
    path: req?.path ?? null,
    userId: req?.user?.id ?? null,
  };

  //* Client errors are expected noise - log them as warnings and do not page
  //* the Telegram errors channel
  if (isClientError) {
    logWarn(`Client error ${statusCode} on ${req.method} ${req.path}`, err, requestContext);
  } else {
    logError(err?.name || 'Unhandled error', err, requestContext);
  }

  if (isLocalhost) {
    return res.status(statusCode).json({
      name: err?.name || STATUS_CODES[statusCode],
      message: err?.message || '',
    });
  }

  return res.status(statusCode).json({
    name: STATUS_CODES[statusCode] || 'Internal Server Error',
    message: isClientError ? 'The request could not be processed' : 'An error occurred, please try again later',
  });
};
