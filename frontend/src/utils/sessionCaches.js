//* Session-scoped caches are module-level singletons that survive route
//* changes (no full reload between logout and the next login), so they must
//* be reset on every session change: the next user on this tab must never see
//* the previous user's data or permission gating.
//*
//* Each cache registers its reset function here. `invalidateSessionCaches()`
//* runs them all and bumps the generation counter; a fetch that started in
//* an older generation must discard its result instead of writing it back
//* into the cache (see hooks/useCompanyPermissions.js). Call it after a
//* successful login, logout or account deletion, and when a 401 ends the session
let generation = 0;
const resetters = new Set();

export const getSessionGeneration = () => generation;

export const registerSessionCache = (reset) => {
  resetters.add(reset);

  return () => resetters.delete(reset);
};

export const invalidateSessionCaches = () => {
  generation += 1;
  resetters.forEach((reset) => reset());
};

export default invalidateSessionCaches;
