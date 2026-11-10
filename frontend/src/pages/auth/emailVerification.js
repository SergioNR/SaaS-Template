//* Pure outcome mapping for the email verification flow, kept out of the
//* components so it can be specced on its own

//* `POST /api/v1/auth/email-verification` failure → page state. 400 (unknown,
//* expired or used - always `EMAIL_VERIFICATION_INVALID`) and 422 (malformed)
//* mean "ask for a new link"; anything else is retryable
export const verifyFailureState = (err) => {
  const status = err?.response?.status;

  return status === 400 || status === 422 ? 'invalid' : 'error';
};

//* `POST /api/v1/auth/email-verification/resend` failure → i18n key. The
//* success answer is identical whether or not the account exists
export const resendFailureKey = (err) => {
  const status = err?.response?.status;

  if (status === 422) {
    return 'auth.resendVerification.errors.invalid';
  }

  if (status === 429) {
    return 'auth.errors.tooManyAttempts';
  }

  return 'auth.resendVerification.errors.generic';
};
