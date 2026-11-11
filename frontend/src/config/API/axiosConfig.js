import axios from 'axios';
import { currentPath, isAuthPath, loginRedirectPath } from '../../utils/safeNext.js';
import { invalidateSessionCaches } from '../../utils/sessionCaches.js';
import { hardRedirect } from '../../utils/hardRedirect.js';

const AUTH_ENDPOINT_PREFIX = '/api/v1/auth/';

const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL,
  withCredentials: true,
  timeout: 10000, // 10 seconds
  // The API rejects non-JSON bodies (415) - always send JSON
  headers: { 'Content-Type': 'application/json' },
});

//* Several requests failing with 401 at once must trigger one redirect
let redirectingToLogin = false;

//* An expired/revoked session surfaces as 401 on any protected endpoint - send
//* the user back to login with `?next=<current path>` so they land where they
//* were. Auth endpoints are excluded: their 401s (wrong credentials, session
//* probe) are handled by the calling component
export const handleUnauthorized = (error) => {
  const status = error?.response?.status;
  const requestUrl = error?.config?.url ?? '';

  if (
    status === 401 &&
    !redirectingToLogin &&
    !requestUrl.includes(AUTH_ENDPOINT_PREFIX) &&
    !isAuthPath(window.location.pathname)
  ) {
    redirectingToLogin = true;
    invalidateSessionCaches();
    hardRedirect(loginRedirectPath(currentPath()));
  }

  return Promise.reject(error);
};

//* Test hook - the flag otherwise lives until the full-page redirect
export const resetUnauthorizedRedirect = () => {
  redirectingToLogin = false;
};

apiClient.interceptors.response.use((response) => response, handleUnauthorized);

export default apiClient;
