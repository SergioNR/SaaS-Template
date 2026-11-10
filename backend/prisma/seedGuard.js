//* The seed writes well-known accounts with a public password
//* (`Password123!`, superadmin included). It only runs against local
//* development databases, or when an operator opts in explicitly with
//* ALLOW_SEED=1 (e.g. a throwaway staging database)
export const isSeedAllowed = (env = process.env) => env.DEPLOY_ENVIRONMENT === 'localhost'
  || env.ALLOW_SEED === '1';
