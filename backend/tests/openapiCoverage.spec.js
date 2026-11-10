import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { openapiSpecification } from '../server/config/swagger.js';
import { adminUserListQueryValidationSchema } from '../server/utils/validators/adminUserListQuerySchema.js';
import { adminCompanyListQueryValidationSchema } from '../server/utils/validators/adminCompanyListQuerySchema.js';
import { filesListQueryValidationSchema } from '../server/utils/validators/filesListQuerySchema.js';
import { passwordResetTokenQuerySchema } from '../server/utils/validators/passwordResetTokenQuerySchema.js';
import { teamInviteTokenQuerySchema } from '../server/utils/validators/teamInviteTokenQuerySchema.js';

//* Documentation gate: nothing that touches the routes may ship undocumented.
//* A new or changed route needs its `@openapi` block (and schema/parameter
//* updates) in the same change - this spec fails the build otherwise. The
//* rule itself is in backend/AGENTS.md ("API conventions")

const ROUTER_ROOTS = [
  'server/API/v1/routes',
  'server/routers',
  'server/webhooks',
];

const listJsFiles = (dir) => readdirSync(dir).flatMap((entry) => {
  const full = path.join(dir, entry);

  if (statSync(full).isDirectory()) {
    return listJsFiles(full);
  }

  return full.endsWith('.js') ? [full] : [];
});

const ROUTE_DEFINITION = /^\s*\w+\.(get|post|put|patch|delete|all)\(\s*'([^']*)'/;

//* The 404 catch-all every router ends with is not part of the API surface
const FALLBACK_PATH = '/*fallback';

//* The JSDoc block that ends right above `lineIndex`. Blank lines and `//`
//* rationale comments between the block and the route are allowed
const docBlockAbove = (lines, lineIndex) => {
  let end = lineIndex - 1;

  while (end >= 0 && (lines[end].trim() === '' || lines[end].trim().startsWith('//'))) {
    end -= 1;
  }

  if (end < 0 || !lines[end].trim().endsWith('*/')) {
    return null;
  }

  let start = end;

  while (start >= 0 && !lines[start].trim().startsWith('/**')) {
    start -= 1;
  }

  return start < 0 ? null : lines.slice(start, end + 1).join('\n');
};

const routerFiles = ROUTER_ROOTS
  .filter((root) => statSync(root, { throwIfNoEntry: false })?.isDirectory())
  .flatMap(listJsFiles);

describe('OpenAPI coverage - routes', () => {
  it('scans the API, root, webhook and admin sub-routers', () => {
    ['authRouter.js', 'indexRouter.js', 'webhooksRouter.js', path.join('admin', 'usersRouter.js')].forEach((name) => {
      expect(routerFiles.some((file) => file.endsWith(name))).toBe(true);
    });
  });

  it.each(routerFiles)('documents every route in %s', (file) => {
    const lines = readFileSync(file, 'utf8').split('\n');
    const undocumented = [];

    lines.forEach((line, index) => {
      const match = line.match(ROUTE_DEFINITION);

      if (!match || match[2] === FALLBACK_PATH) {
        return;
      }

      const block = docBlockAbove(lines, index);
      //* `.all` routes must document at least one method
      const methodPattern = match[1] === 'all' ? '(get|post|put|patch|delete)' : match[1];
      const documentsMethod = block
        && /@openapi/.test(block)
        && new RegExp(`^\\s*\\*\\s+${methodPattern}:\\s*$`, 'm').test(block);

      if (!documentsMethod) {
        undocumented.push(`line ${index + 1}: ${line.trim()}`);
      }
    });

    expect(undocumented).toEqual([]);
  });
});

const resolveRef = (ref) => ref
  .split('/')
  .slice(1)
  .reduce((node, key) => node?.[key], openapiSpecification);

const resolveParameter = (parameter) => (parameter.$ref ? resolveRef(parameter.$ref) : parameter);

const documentedQueryParams = (operation) => new Set(
  (operation?.parameters ?? [])
    .map(resolveParameter)
    .filter((parameter) => parameter?.in === 'query')
    .map((parameter) => parameter.name),
);

//* Every route that validates its query string, with the schema it mounts.
//* Add a row when a route gains a query schema
const QUERY_VALIDATED_OPERATIONS = [
  ['get', '/api/v1/admin/users', adminUserListQueryValidationSchema],
  ['get', '/api/v1/admin/companies', adminCompanyListQueryValidationSchema],
  ['get', '/api/v1/files', filesListQueryValidationSchema],
  ['get', '/api/v1/auth/password-reset', passwordResetTokenQuerySchema],
  ['get', '/api/v1/auth/invite', teamInviteTokenQuerySchema],
];

describe('OpenAPI coverage - query parameters', () => {
  it.each(QUERY_VALIDATED_OPERATIONS)('documents every query param %s %s validates', (method, routePath, schema) => {
    const operation = openapiSpecification.paths[routePath]?.[method];

    expect(operation).toBeDefined();

    const documented = documentedQueryParams(operation);
    const missing = Object.keys(schema).filter((name) => !documented.has(name));

    expect(missing).toEqual([]);
  });

  it.each(QUERY_VALIDATED_OPERATIONS)('never documents a query param %s %s does not validate', (method, routePath, schema) => {
    const operation = openapiSpecification.paths[routePath][method];
    const validated = new Set(Object.keys(schema));
    const stale = [...documentedQueryParams(operation)].filter((name) => !validated.has(name));

    expect(stale).toEqual([]);
  });
});

describe('OpenAPI coverage - references', () => {
  it('resolves every $ref in the specification', () => {
    const broken = [];

    const walk = (node, where) => {
      if (Array.isArray(node)) {
        node.forEach((child, index) => walk(child, `${where}[${index}]`));
      } else if (node && typeof node === 'object') {
        if (typeof node.$ref === 'string' && resolveRef(node.$ref) === undefined) {
          broken.push(`${where} -> ${node.$ref}`);
        }

        Object.entries(node).forEach(([key, child]) => walk(child, `${where}.${key}`));
      }
    };

    walk(openapiSpecification, 'spec');

    expect(broken).toEqual([]);
  });

  it('defines the shared responses and parameters the routers reference', () => {
    expect(Object.keys(openapiSpecification.components.responses)).toEqual(expect.arrayContaining([
      'Unauthorized', 'Forbidden', 'NotFound', 'ValidationError', 'TooManyRequests',
    ]));
    expect(Object.keys(openapiSpecification.components.parameters)).toEqual(expect.arrayContaining([
      'SearchQuery', 'LimitQuery', 'CursorQuery',
    ]));
  });
});
