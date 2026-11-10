//* Analytics consent, remembered per browser. PostHog is not even downloaded
//* until the visitor accepts (see analytics/posthog.js). Storage access is
//* wrapped: private windows and blocked site data must not break the app -
//* without storage the banner simply asks again next visit
const STORAGE_KEY = 'analytics-consent';

export const CONSENT_GRANTED = 'granted';
export const CONSENT_DENIED = 'denied';

const listeners = new Set();
let memoryValue = null;

const readStored = () => {
  try {
    const value = window.localStorage.getItem(STORAGE_KEY);

    return value === CONSENT_GRANTED || value === CONSENT_DENIED ? value : null;
  } catch {
    return memoryValue;
  }
};

//* null = not decided yet (banner visible)
export const getConsent = () => readStored();

export const setConsent = (value) => {
  memoryValue = value;

  try {
    if (value === null) {
      window.localStorage.removeItem(STORAGE_KEY);
    } else {
      window.localStorage.setItem(STORAGE_KEY, value);
    }
  } catch {
    // Kept in memory for this page load only
  }

  listeners.forEach((listener) => listener(value));
};

export const subscribeConsent = (listener) => {
  listeners.add(listener);

  return () => listeners.delete(listener);
};
