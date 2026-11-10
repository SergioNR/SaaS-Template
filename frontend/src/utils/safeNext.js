export const LOGIN_PATH = '/auth/login';
export const NEXT_PARAM = 'next';

//* The auth pages are `/auth` itself and everything under `/auth/` - a plain
//* prefix check would also match lookalikes such as `/authors`
export const isAuthPath = (pathname) =>
  typeof pathname === 'string' && (pathname === '/auth' || pathname.startsWith('/auth/'));

//* Validates a post-login `next` target. Only same-origin, absolute paths
//* are honoured: must start with a single '/' (not '//' or '/\' - both are
//* protocol-relative URLs to another host in browsers), contain no control
//* characters, and resolve to this origin. Auth pages are rejected so a login
//* never bounces back into itself. Returns the normalised path or null
export const safeNextPath = (raw, origin = window.location.origin) => {
  if (typeof raw !== 'string' || raw === '' || raw.length > 2048) {
    return null;
  }

  // eslint-disable-next-line no-control-regex -- rejecting control characters is the point
  if (!raw.startsWith('/') || raw.startsWith('//') || raw.startsWith('/\\') || /[\u0000-\u001f\u007f]/.test(raw)) {
    return null;
  }

  let url;

  try {
    url = new URL(raw, origin);
  } catch {
    return null;
  }

  if (url.origin !== origin || isAuthPath(url.pathname)) {
    return null;
  }

  return `${url.pathname}${url.search}${url.hash}`;
};

//* `/auth/login?next=<current path>` - the current location is only attached
//* when it is itself a valid target
export const loginRedirectPath = (currentPath) => {
  const next = safeNextPath(currentPath);

  return next ? `${LOGIN_PATH}?${NEXT_PARAM}=${encodeURIComponent(next)}` : LOGIN_PATH;
};

export const currentPath = () => `${window.location.pathname}${window.location.search}${window.location.hash}`;
