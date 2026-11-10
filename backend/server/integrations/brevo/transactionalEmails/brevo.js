import { BrevoClient } from '@getbrevo/brevo';
import { requireEnv } from '../../../config/requiredEnv.js';

requireEnv('BREVO_API_KEY', 'refusing to start without transactional email delivery');
//* Brevo rejects a send without a verified sender - without it every reset
//* and invite email would silently fail at request time
requireEnv('BREVO_SENDER_EMAIL', 'refusing to start without a transactional email sender');
requireEnv('BREVO_RESET_PASSWORD_TEMPLATE_ID', 'refusing to start without the password reset email template');
requireEnv('BREVO_TEAM_INVITE_TEMPLATE_ID', 'refusing to start without the team invite email template');

export const brevoClient = new BrevoClient({
  apiKey: process.env.BREVO_API_KEY,
});

export const companyEmails = {
  support: process.env.BREVO_SENDER_EMAIL,
  billing: process.env.BREVO_SENDER_EMAIL,
  hello: process.env.BREVO_SENDER_EMAIL,
};

//* Template ids live in env so each environment (and each fork of this
//* template) points at its own Brevo account without a code change
export const templateIds = {
  resetPassword: Number(process.env.BREVO_RESET_PASSWORD_TEMPLATE_ID),
  teamInvite: Number(process.env.BREVO_TEAM_INVITE_TEMPLATE_ID),
};

//* Shared template params - every template can build absolute links from
//* the web app origin instead of hard-coding the host in Brevo
export const commonTemplateParams = () => ({
  appOrigin: process.env.FRONT_WEB_APP_ORIGIN_URL,
});

//* Pure: builds an absolute SPA link from the ORIGIN (scheme, host, port) of
//* the configured front-end URL - a trailing slash or a path in
//* FRONT_WEB_APP_ORIGIN_URL can never produce `//auth/...` or a wrong page.
//* Search params are URL-encoded by URLSearchParams
export const frontendUrl = (path, searchParams = {}, originUrl = process.env.FRONT_WEB_APP_ORIGIN_URL) => {
  const url = new URL(path, new URL(originUrl).origin);

  Object.entries(searchParams).forEach(([key, value]) => {
    url.searchParams.set(key, value);
  });

  return url.toString();
};

//* sendTransacEmail available properties -- eg: brevoClient.transactionalEmails.sendTransacEmail({ sender: {}, ... })
// 'sender';
// 'to'
// 'bcc'
// 'cc'
// 'htmlContent'
// 'textContent'
// 'subject'
// 'replyTo'
// 'attachment'
// 'headers'
// 'templateId'
// 'params'
// 'messageVersions'
// 'tags'?: Array<string>;
// 'scheduledAt';
