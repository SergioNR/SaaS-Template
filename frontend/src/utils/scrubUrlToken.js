//* Token pages (/auth/restore-password, /auth/accept-invite) read their
//* one-time token from the query string once, keep it in state and then drop
//* it from the address bar - so it is not left in history, screenshots,
//* shared links or any later analytics pageview. history.state is kept so
//* React Router's own entry key stays valid
export const scrubQueryFromAddressBar = () => {
  const { pathname, search, hash } = window.location;

  if (!search && !hash) {
    return;
  }

  window.history.replaceState(window.history.state, '', pathname);
};

export default scrubQueryFromAddressBar;
