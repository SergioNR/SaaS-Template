//* Maps a failed `PATCH /api/v1/auth/password-reset` to its i18n key. The API
//* answers 400 for every unknown, expired or consumed token (never 404), 422
//* for invalid input; anything else is a network/server error
export const restoreSubmitErrorKey = (err) => {
  const status = err?.response?.status;

  if (status === 400) {
    return 'auth.restore.errors.expired';
  }

  if (status === 422) {
    return 'auth.restore.errors.invalid';
  }

  return 'auth.restore.errors.generic';
};

export default restoreSubmitErrorKey;
