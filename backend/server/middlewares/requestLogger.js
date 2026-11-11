import { randomUUID } from 'node:crypto';
import pinoHttp from 'pino-http';
import { logger } from '../config/logger.js';

//* Query strings must never reach the logs - password reset and invite
//* tokens travel in them (see globalErrorHandler) - and the same goes for
//* headers and bodies. Only the bare method + query-stripped path is kept
export const stripQueryString = (value) => String(value ?? '').split('?')[0];

export const serializeRequest = (req) => ({
  method: req.method,
  path: stripQueryString(req.originalUrl ?? req.url),
});

export const serializeResponse = (res) => ({
  statusCode: res.statusCode,
});

//* 4xx are expected client noise (warn), 5xx and aborted/errored responses
//* need attention (error). Access lines never reach Telegram - only logError
//* calls page a human
export const resolveRequestLogLevel = (req, res, err) => {
  if (err !== undefined || res.statusCode >= 500) {
    return 'error';
  }

  return res.statusCode >= 400 ? 'warn' : 'info';
};

//* The container HEALTHCHECK / orchestrator probes poll /health - logging
//* every probe would flood the logs with noise
export const shouldSkipRequestLogging = (req) => stripQueryString(req.originalUrl ?? req.url) === '/health';

//* Builds the "METHOD /route/pattern" access-log message from the concrete
//* request path and the matched leaf route pattern. originalUrl + req.route
//* are used instead of req.url / req.baseUrl because Express trims those as
//* sub-routers descend and only restores them on the error unwind, so their
//* values at response-finish time are unreliable. Requests that matched no
//* route (the fallback 404s) have no req.route and fall back to the concrete
//* path. Trailing slashes and root routes ("/") are normalized by dropping
//* empty segments on both sides
export const resolveRouteLabel = (method, fullPath, routePath) => {
  const concreteSegments = stripQueryString(fullPath).split('/').filter(Boolean);
  const leafSegments = String(routePath ?? '').split('/').filter(Boolean);

  //* Fallback handlers are mounted on '/*fallback' - a wildcard pattern says
  //* nothing about the route, so they log the concrete path like no match
  const isWildcardLeaf = leafSegments.some((segment) => segment.startsWith('*'));

  if (leafSegments.length === 0 || isWildcardLeaf || leafSegments.length > concreteSegments.length) {
    return `${method} /${concreteSegments.join('/')}`;
  }

  const mountPrefix = concreteSegments.slice(0, concreteSegments.length - leafSegments.length);

  return `${method} /${[...mountPrefix, ...leafSegments].join('/')}`;
};

export const resolveRequestRouteLabel = (req) => resolveRouteLabel(
  req.method,
  req.originalUrl ?? req.url,
  typeof req.route?.path === 'string' ? req.route.path : undefined,
);

//* Fresh server-side id per request, echoed as a response header so clients
//* can quote it back in bug reports - an inbound x-request-id is never
//* honoured, otherwise a caller could spoof correlation across log lines
export const generateRequestId = (req, res) => {
  const requestId = randomUUID();

  res.setHeader('X-Request-Id', requestId);

  return requestId;
};

//* customProps runs at response finish, after the session middlewares further
//* down the chain populated req.user, so the acting user id and its company
//* are available even though this middleware is mounted before them.
//* reqId is set explicitly: pino-http only binds req.id through the req
//* serializer (which keeps method + path only), so without it the access
//* line could not be correlated with its audit/error lines and alerts
export const requestLogProps = (req) => ({
  userId: req.user?.id ?? null,
  companyId: req.user?.company_id ?? null,
  ip: req.ip,
  reqId: req.id ?? null,
});

export const requestLogger = () => pinoHttp({
  logger,
  genReqId: generateRequestId,
  customLogLevel: resolveRequestLogLevel,
  customSuccessMessage: resolveRequestRouteLabel,
  customErrorMessage: resolveRequestRouteLabel,
  customProps: requestLogProps,
  serializers: {
    req: serializeRequest,
    res: serializeResponse,
  },
  autoLogging: {
    ignore: shouldSkipRequestLogging,
  },
});
