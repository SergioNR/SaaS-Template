import helmet from 'helmet';

//* The API answers JSON only, so its responses never need to load or run
//* anything: a deny-all CSP makes any response a browser renders by mistake
//* (an error page, a reflected value, a mis-typed body) inert, and
//* frame-ancestors 'none' forbids framing. The only HTML this service serves
//* is Swagger UI, which is localhost-only and gets its own relaxed policy in
//* routers/docsRouter.js (docsContentSecurityPolicy)
export const API_CONTENT_SECURITY_POLICY_DIRECTIVES = {
  defaultSrc: ["'none'"],
  frameAncestors: ["'none'"],
};

export const helmetMiddleware = helmet({
  contentSecurityPolicy: {
    useDefaults: false,
    directives: API_CONTENT_SECURITY_POLICY_DIRECTIVES,
  },
});
