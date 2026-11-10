import { checkSchema, validationResult } from 'express-validator';

//* Runs an express-validator schema against a fake req the way the routers
//* mount it (checkSchema middlewares, then validationResult - what
//* sanitizerResult reads). Shared by the validator specs so the harness cannot
//* drift between them
export const runSchema = async (schema, { body = {}, query = {}, params = {} } = {}) => {
  const req = { body, query, params };

  for (const middleware of checkSchema(schema)) {
    await new Promise((resolve, reject) => {
      middleware(req, {}, (error) => (error ? reject(error) : resolve()));
    });
  }

  const result = validationResult(req);

  return { req, result, errors: result.array() };
};

//* Query-string shorthand for the list/token query schemas
export const runQuerySchema = (schema, query) => runSchema(schema, { query });

//* The distinct field paths that failed - order-insensitive assertions
export const failedPaths = (errors) => [...new Set(errors.map((error) => error.path))];
