import { createRequire } from 'node:module';
import pino from 'pino';

//* Exported for the redaction spec
export const redactOptions = {
  paths: [
    'context.email',
    'context.password',
    'context.username',
    'context.currentPassword',
    'context.newPassword',
    'context.confirmNewPassword',
    'context.inviteToken',
    'context.passwordResetToken',
    'context.userData.inviteToken',
    //* logError/logWarn extra details land under additionalInfo
    'context.additionalInfo.email',
    'context.additionalInfo.password',
    'context.additionalInfo.username',
    'context.additionalInfo.currentPassword',
    'context.additionalInfo.newPassword',
    'context.additionalInfo.confirmNewPassword',
    'context.additionalInfo.inviteToken',
    'context.additionalInfo.passwordResetToken',
    //* Credentials carried by request objects (HTTP access logs, errors that
    //* attach the request)
    'req.headers.cookie',
    'req.headers.authorization',
    'context.req.headers.cookie',
    'context.req.headers.authorization',
    //* Request bodies (e.g. body-parser errors carry the raw body, which can
    //* contain passwords) must never reach the logs
    'context.errorDetails.body',
    'context.*.body',
    'context.body',
  ],
  censor: '[REDACTED]',
};

const isLocalhost = () => process.env.DEPLOY_ENVIRONMENT === 'localhost';

//* The prod image omits devDependencies, so running it locally with
//* DEPLOY_ENVIRONMENT=localhost would crash the transport worker - fall back
//* to JSON whenever pino-pretty cannot be resolved
const isPinoPrettyInstalled = () => {
  try {
    createRequire(import.meta.url).resolve('pino-pretty');

    return true;
  } catch {
    return false;
  }
};

export const DEFAULT_LOG_LEVEL = 'info';

//* pino.levels.values is the label -> numeric map ('warn' -> 40). An unknown
//* LOG_LEVEL would make pino throw at boot, so it falls back to the default
export const resolveLogLevel = (level) => (
  typeof level === 'string' && pino.levels.values[level] !== undefined ? level : DEFAULT_LOG_LEVEL
);

//* Pure helper (unit-tested without spawning transport workers). Composes the
//* pino transport targets: stdout always - pino-pretty on localhost when it
//* is installed, plain JSON lines (pino/file on fd 1) otherwise - plus the
//* optional Better Stack (@logtail/pino) transport whenever both shipping
//* vars are set. Both are required together: a half-configured source would
//* silently send logs nowhere. Without any transport (deployed, no Better
//* Stack) pino writes to stdout directly, which is synchronous and cheapest
export const buildTransportTargets = ({
  isLocalhostEnv = isLocalhost(),
  prettyInstalled = isPinoPrettyInstalled(),
  sourceToken = process.env.BETTER_STACK_SOURCE_TOKEN,
  ingestingHost = process.env.BETTER_STACK_INGESTING_HOST,
  level = resolveLogLevel(process.env.LOG_LEVEL),
} = {}) => {
  const usePretty = isLocalhostEnv && prettyInstalled;
  const useBetterStack = Boolean(sourceToken && ingestingHost);

  if (!useBetterStack && !usePretty) {
    return { level, targets: undefined };
  }

  const targets = [];

  //* Human-readable output only for local development. Deployed environments
  //* emit plain JSON lines on stdout so the log collector can parse them, and
  //* pino-pretty (a devDependency) is never loaded there
  if (usePretty) {
    targets.push({
      target: 'pino-pretty',
      options: {
        destination: 1,
        colorize: true,
      },
      level,
    });
  } else {
    targets.push({
      target: 'pino/file',
      options: { destination: 1 },
      level,
    });
  }

  if (useBetterStack) {
    targets.push({
      target: '@logtail/pino',
      options: {
        sourceToken,
        options: { endpoint: `https://${ingestingHost}` },
      },
      level,
    });
  }

  return { level, targets };
};

const { level, targets } = buildTransportTargets();

const transport = targets !== undefined ? pino.transport({ targets }) : undefined;

// Apply redaction at the logger level so sensitive fields are removed
export const logger = pino(
  {
    level,
    redact: redactOptions,
  },
  transport,
);
