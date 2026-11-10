import { CONSENT_DENIED, CONSENT_GRANTED, getConsent, setConsent } from './consent.js';
import { sanitizeEvent } from './sanitizeUrl.js';

//* Single entry point to PostHog. `posthog-js` is never in the main bundle:
//* it is dynamic-imported only when a key is configured AND the visitor has
//* accepted analytics, and never before first paint. Callers use the helpers
//* below - they are no-ops while analytics is disabled, undecided or denied
const posthogKey = import.meta.env.VITE_PUBLIC_POSTHOG_KEY;
const posthogHost = import.meta.env.VITE_PUBLIC_POSTHOG_HOST || 'https://eu.i.posthog.com';

export const analyticsEnabled = Boolean(posthogKey);

let client = null;
let loadPromise = null;
//* The signed-in user, remembered so consent given mid-session still
//* identifies them - identify() itself only ever runs after consent
let pendingIdentity = null;

const loadPostHog = () => {
  if (!loadPromise) {
    loadPromise = import('posthog-js')
      .then(({ default: posthog }) => {
        posthog.init(posthogKey, {
          api_host: posthogHost,
          defaults: '2025-05-24',
          debug: false,
          //* Nothing is captured or persisted until opt_in_capturing() below
          opt_out_capturing_by_default: true,
          opt_out_persistence_by_default: true,
          before_send: sanitizeEvent,
        });
        client = posthog;

        return posthog;
      })
      .catch(() => {
        //* Blocked by an ad blocker / offline - analytics stays off, retry on next consent
        loadPromise = null;

        return null;
      });
  }

  return loadPromise;
};

const startCapturing = async () => {
  const posthog = await loadPostHog();

  //* Consent may have been withdrawn while the chunk was downloading
  if (!posthog || getConsent() !== CONSENT_GRANTED) {
    return;
  }

  posthog.opt_in_capturing();

  if (pendingIdentity) {
    posthog.identify(pendingIdentity);
  }
};

//* Called once from main.jsx: loads PostHog after first paint (idle when
//* available) for visitors who already accepted
export const scheduleAnalytics = () => {
  if (!analyticsEnabled || getConsent() !== CONSENT_GRANTED) {
    return;
  }

  if (typeof window.requestIdleCallback === 'function') {
    window.requestIdleCallback(() => startCapturing(), { timeout: 5000 });
  } else {
    setTimeout(() => startCapturing(), 1);
  }
};

export const grantAnalyticsConsent = () => {
  setConsent(CONSENT_GRANTED);

  if (analyticsEnabled) {
    startCapturing();
  }
};

export const denyAnalyticsConsent = () => {
  setConsent(CONSENT_DENIED);
  client?.opt_out_capturing();
};

//* Re-opens the consent banner (footer "cookie preferences" link)
export const resetAnalyticsConsent = () => {
  client?.opt_out_capturing();
  setConsent(null);
};

export const identifyUser = (userId) => {
  pendingIdentity = userId ?? null;

  if (client && userId && getConsent() === CONSENT_GRANTED) {
    client.identify(userId);
  }
};

//* On logout / account deletion. reset() clears PostHog's consent state back
//* to the opted-out default, so a consenting visitor is opted in again
export const resetAnalyticsUser = () => {
  pendingIdentity = null;

  if (!client) {
    return;
  }

  client.reset();

  if (getConsent() === CONSENT_GRANTED) {
    client.opt_in_capturing();
  }
};

export const captureException = (error, properties) => {
  if (client && getConsent() === CONSENT_GRANTED) {
    client.captureException(error, properties);
  }
};
