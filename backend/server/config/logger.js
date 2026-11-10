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

//* Human-readable output only for local development. Deployed environments
//* emit plain JSON lines on stdout so the log collector can parse them, and
//* pino-pretty (a devDependency) is never loaded there
const isLocalhost = process.env.DEPLOY_ENVIRONMENT === 'localhost';

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

const transport = isLocalhost && isPinoPrettyInstalled()
  ? pino.transport({
    targets: [
      {
        target: 'pino-pretty',
        options: {
          destination: 1,
          colorize: true,
        },
      },
    ],
  })
  : undefined;

// Apply redaction at the logger level so sensitive fields are removed
export const logger = pino(
  {
    redact: redactOptions,
  },
  transport,
);
