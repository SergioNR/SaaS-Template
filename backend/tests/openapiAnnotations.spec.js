import { extractOpenapiBlocks, mergeOpenapiAnnotations } from '../server/utils/openapiAnnotations.js';

describe('extractOpenapiBlocks', () => {
  it('returns the YAML of each @openapi block with the comment markers stripped', () => {
    const source = `
/**
 * @openapi
 * /api/v1/thing:
 *   get:
 *     summary: Read a thing
 */
router.get('/thing', handler);

/** Plain JSDoc without an annotation */
const helper = () => {};

/**
 * @openapi
 * /api/v1/thing:
 *   post:
 *     summary: Create a thing
 */
`;

    expect(extractOpenapiBlocks(source)).toEqual([
      '/api/v1/thing:\n  get:\n    summary: Read a thing',
      '/api/v1/thing:\n  post:\n    summary: Create a thing',
    ]);
  });

  it('stops a block at the next JSDoc tag', () => {
    const source = `/**
 * @openapi
 * /health:
 *   get:
 *     summary: Health
 * @deprecated use /ready
 */`;

    expect(extractOpenapiBlocks(source)).toEqual(['/health:\n  get:\n    summary: Health']);
  });

  it('keeps @ characters that are YAML content', () => {
    const source = `/**
 * @openapi
 * /a:
 *   get:
 *     description: mail support@example.com
 */`;

    expect(extractOpenapiBlocks(source)[0]).toContain('support@example.com');
  });
});

describe('mergeOpenapiAnnotations', () => {
  const definition = { openapi: '3.0.3', tags: [{ name: 'Auth' }], components: { schemas: { A: { type: 'string' } } } };

  it('merges methods of the same path from several blocks without touching the definition', () => {
    const spec = mergeOpenapiAnnotations(definition, [
      { '/x': { get: { summary: 'get' } } },
      { '/x': { post: { summary: 'post' } } },
    ]);

    expect(spec.paths['/x']).toEqual({ get: { summary: 'get' }, post: { summary: 'post' } });
    expect(definition.paths).toBeUndefined();
  });

  it('merges components and new tags, ignores duplicate tags and x- extensions', () => {
    const spec = mergeOpenapiAnnotations(definition, [
      { components: { schemas: { B: { type: 'integer' } } } },
      { tags: [{ name: 'Auth' }, { name: 'Files' }] },
      { 'x-internal': { anything: true } },
    ]);

    expect(Object.keys(spec.components.schemas)).toEqual(['A', 'B']);
    expect(spec.tags.map((tag) => tag.name)).toEqual(['Auth', 'Files']);
    expect(spec.paths).toEqual({});
  });

  it('never lets a later null overwrite a value', () => {
    const spec = mergeOpenapiAnnotations(definition, [
      { '/y': { get: { summary: 'kept' } } },
      { '/y': { get: { summary: null } } },
    ]);

    expect(spec.paths['/y'].get.summary).toBe('kept');
  });
});
