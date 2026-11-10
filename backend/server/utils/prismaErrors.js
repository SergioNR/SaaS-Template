//* Prisma write failures a caller can trigger through the API, mapped to the
//* status codes the API conventions reserve for them. Anything else is
//* unexpected and must be thrown on to the global error handler (500)
export const WRITE_ERROR_RESPONSES = {
  //* Unique constraint - a duplicate, or a concurrent request won the race
  P2002: { status: 409, message: 'A record with the same unique value already exists' },
  //* Foreign key constraint - a referenced row is missing or still referenced
  P2003: { status: 409, message: 'The record is referenced by, or references, a record that blocks the write' },
  //* Required record not found - deleted or never existed
  P2025: { status: 404, message: 'The record does not exist' },
};

export const isPrismaErrorCode = (error, code) => error?.code === code;

//* Answers a mapped write error and returns true, or returns false when the
//* error is not one of the mapped codes so the caller rethrows it.
//* `overrides` swaps in endpoint-specific bodies per code ({ status,
//* message, code? }), or switches a code off with null - e.g. an endpoint
//* where a P2002 means something else than a duplicate
export const sendMappedWriteError = (res, error, overrides = {}) => {
  const responses = { ...WRITE_ERROR_RESPONSES, ...overrides };
  const mapped = typeof error?.code === 'string' && Object.hasOwn(responses, error.code)
    ? responses[error.code]
    : null;

  if (!mapped) {
    return false;
  }

  const { status, ...body } = mapped;

  res.status(status).json(body);

  return true;
};
