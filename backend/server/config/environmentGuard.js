//* DEPLOY_ENVIRONMENT=localhost switches off the session secret requirement,
//* the global rate limiters, secure cookies and error-message hiding, and
//* serves the API docs. A production process booted with it (a copied local
//* .env, a mistyped deployment variable) would run with all of that disabled,
//* so the combination refuses to boot instead of silently degrading
export const assertSafeDeployEnvironment = (env = process.env) => {
  if (env.NODE_ENV === 'production' && env.DEPLOY_ENVIRONMENT === 'localhost') {
    throw new Error('DEPLOY_ENVIRONMENT=localhost is not allowed with NODE_ENV=production - it disables the session secret, rate limiters, secure cookies and error hiding');
  }
};

//* Runs on import: app.js imports this module first, so the check happens
//* before any other module reads DEPLOY_ENVIRONMENT at load time
assertSafeDeployEnvironment();
