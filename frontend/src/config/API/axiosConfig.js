import axios from 'axios';

const LOGIN_PATH = '/auth/login';
const AUTH_ENDPOINT_PREFIX = '/api/v1/auth/';

const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL,
  withCredentials: true,
  timeout: 10000, // 10 seconds
  // The API rejects non-JSON bodies (415) - always send JSON
  headers: { 'Content-Type': 'application/json' },
});

//* An expired/revoked session surfaces as 401 on any protected endpoint - send
//* the user back to login. Auth endpoints are excluded: their 401s (wrong
//* credentials, session probe) are handled by the calling component
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error?.response?.status;
    const requestUrl = error?.config?.url ?? '';

    if (
      status === 401
      && !requestUrl.includes(AUTH_ENDPOINT_PREFIX)
      && !window.location.pathname.startsWith('/auth/')
    ) {
      window.location.assign(LOGIN_PATH);
    }

    return Promise.reject(error);
  },
);

export default apiClient;
