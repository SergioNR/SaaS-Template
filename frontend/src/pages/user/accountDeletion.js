//* Maps a failed DELETE /api/v1/user to its i18n key, kept pure so it is
//* unit-tested (AccountActionsForm.test.jsx). Both 409 codes are refusals
//* that leave the account - and the session - untouched
export const deletionErrorKey = (err) => {
  const status = err?.response?.status;
  const code = err?.response?.data?.code;

  if (status === 409 && code === 'USER_LAST_COMPANY_OWNER') {
    return 'user.accountActions.deleteLastOwner';
  }

  if (status === 409 && code === 'LAST_SUPERADMIN') {
    return 'user.accountActions.deleteLastSuperadmin';
  }

  return 'user.accountActions.deleteError';
};
