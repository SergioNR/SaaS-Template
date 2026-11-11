import { globSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse as parseYaml } from 'yaml';

//* In-repo replacement for swagger-jsdoc (unmaintained, pinned a vulnerable
//* glob): reads the `@openapi` JSDoc blocks next to the routes and merges
//* them into the base definition the same way - top-level keys of a block
//* are path items (`/api/...`), `components` sections or `tags`

const BACKEND_ROOT = fileURLToPath(new URL('../../', import.meta.url));

const JSDOC_BLOCK = /\/\*\*([\s\S]*?)\*\//g;
const NEXT_TAG = /^@\w/;

//* Pure: every `@openapi` YAML text in a source file, comment markers
//* stripped (`/**`, `*/` and each line's leading ` * `), up to the next JSDoc
//* tag or the end of the block
export const extractOpenapiBlocks = (source) => [...source.matchAll(JSDOC_BLOCK)].flatMap(([, body]) => {
  const lines = body.split('\n').map((line) => line.replace(/^\s*\* ?/, ''));
  const blocks = [];
  let current = null;

  lines.forEach((line) => {
    if (line.trim() === '@openapi') {
      current = [];
      blocks.push(current);
    } else if (NEXT_TAG.test(line.trim())) {
      current = null;
    } else if (current) {
      current.push(line);
    }
  });

  return blocks.map((block) => block.join('\n').trimEnd());
});

const isPlainObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

//* swagger-jsdoc's lodash mergeWith semantics: objects merge recursively,
//* arrays merge index by index, a later null never overwrites
const mergeDeep = (target, source) => {
  if (source === null || source === undefined) {
    return target;
  }

  if (Array.isArray(target) && Array.isArray(source)) {
    const merged = [...target];

    source.forEach((item, index) => {
      merged[index] = mergeDeep(merged[index], item);
    });

    return merged;
  }

  if (isPlainObject(target) && isPlainObject(source)) {
    const merged = { ...target };

    Object.entries(source).forEach(([key, value]) => {
      merged[key] = mergeDeep(merged[key], value);
    });

    return merged;
  }

  return source;
};

const SECTION_KEYS = ['components', 'paths'];

//* Pure: folds parsed annotation documents into a copy of the definition
export const mergeOpenapiAnnotations = (definition, annotations) => {
  const spec = structuredClone(definition);

  spec.paths ??= {};
  spec.components ??= {};
  spec.tags ??= [];

  annotations.forEach((annotation) => {
    Object.entries(annotation ?? {}).forEach(([key, value]) => {
      if (key.startsWith('x-')) {
        return;
      }

      if (SECTION_KEYS.includes(key)) {
        Object.entries(value).forEach(([name, item]) => {
          spec[key][name] = mergeDeep(spec[key][name], item);
        });
      } else if (key === 'tags') {
        [value].flat().forEach((tag) => {
          if (!spec.tags.some((existing) => existing.name === tag.name)) {
            spec.tags.push(tag);
          }
        });
      } else {
        spec.paths[key] = mergeDeep(spec.paths[key], value);
      }
    });
  });

  return spec;
};

//* Builds the document from the definition plus the `@openapi` blocks of
//* every file matched by `apis` (globs relative to backend/). A block that is
//* not valid YAML throws at import time - the coverage spec then fails the
//* build instead of silently dropping an endpoint
export const buildOpenapiDocument = (definition, apis) => {
  //* Pattern order first (it decides the path order shown in Swagger UI),
  //* name order within a pattern
  const files = [...new Set(apis.flatMap((pattern) => globSync(pattern, { cwd: BACKEND_ROOT }).sort()))];

  const annotations = files.flatMap((file) => {
    const source = readFileSync(path.join(BACKEND_ROOT, file), 'utf8');

    return extractOpenapiBlocks(source).map((yamlText) => {
      try {
        return parseYaml(yamlText);
      } catch (error) {
        throw new Error(`Invalid @openapi block in ${file}: ${error.message}`, { cause: error });
      }
    });
  });

  return mergeOpenapiAnnotations(definition, annotations);
};
