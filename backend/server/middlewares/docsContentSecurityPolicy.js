import helmet from 'helmet';

//* Swagger UI is the only HTML page of this service (served on localhost
//* only, see app.js). It loads its bundle and init script from the same
//* origin, injects inline styles and data: icons, and "Try it out" calls the
//* API origin from the spec (API_PUBLIC_ORIGIN_URL, e.g. a tunnel) - so this
//* policy replaces the deny-all API policy on the docs route only. Scripts
//* stay same-origin: no inline or third-party script is ever allowed
export const buildDocsContentSecurityPolicyDirectives = (apiPublicOrigin = process.env.API_PUBLIC_ORIGIN_URL) => ({
  defaultSrc: ["'self'"],
  scriptSrc: ["'self'"],
  styleSrc: ["'self'", "'unsafe-inline'"],
  imgSrc: ["'self'", 'data:'],
  connectSrc: apiPublicOrigin ? ["'self'", apiPublicOrigin] : ["'self'"],
  objectSrc: ["'none'"],
  baseUri: ["'self'"],
  frameAncestors: ["'none'"],
});

export const docsContentSecurityPolicy = () => helmet.contentSecurityPolicy({
  useDefaults: false,
  directives: buildDocsContentSecurityPolicyDirectives(),
});
