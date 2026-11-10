//* Reasons the local strategy hands to `done(null, false, info)` when the
//* credentials are correct but the login must still be refused - shared by
//* the strategy and loginLocal without importing the strategy (and its
//* import-time dummy hash) into every controller
export const EMAIL_NOT_VERIFIED = 'EMAIL_NOT_VERIFIED';
