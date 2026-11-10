//* Never log an axios error object: `error.config.data` carries the request
//* body (passwords, tokens) and `error.request` the full XHR. Only the status
//* and the backend's machine-readable `code` are logged, and only in dev
export const apiErrorSummary = (error) => ({
  status: error?.response?.status ?? null,
  code: error?.response?.data?.code ?? null,
});

export const logApiError = (context, error) => {
  if (!import.meta.env.DEV) {
    return;
  }

  // eslint-disable-next-line no-console -- the one sanctioned logging sink
  console.warn(context, apiErrorSummary(error));
};

export default logApiError;
