//* Pure: builds an absolute SPA link from the ORIGIN (scheme, host, port) of
//* the configured front-end URL - a trailing slash or a path in
//* FRONT_WEB_APP_ORIGIN_URL can never produce `//auth/...` or a wrong page.
//* Search params are URL-encoded by URLSearchParams. Used for every link the
//* API hands out: emailed links (Brevo) and Stripe redirect URLs
export const frontendUrl = (path, searchParams = {}, originUrl = process.env.FRONT_WEB_APP_ORIGIN_URL) => {
  const url = new URL(path, new URL(originUrl).origin);

  Object.entries(searchParams).forEach(([key, value]) => {
    url.searchParams.set(key, value);
  });

  return url.toString();
};
