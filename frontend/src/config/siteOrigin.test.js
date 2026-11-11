import { describe, expect, it } from 'vitest';
import { normalizeSiteOrigin } from './siteOrigin.js';

describe('normalizeSiteOrigin', () => {
  it.each([
    ['https://example.com', 'https://example.com'],
    ['https://example.com/', 'https://example.com'],
    ['https://example.com///', 'https://example.com'],
    ['  https://example.com/  ', 'https://example.com'],
    ['\thttps://example.com\n', 'https://example.com'],
  ])('normalises %j to %s', (raw, expected) => {
    expect(normalizeSiteOrigin(raw)).toBe(expected);
  });

  it.each([undefined, null, '', '   '])('returns an empty origin for %j', (raw) => {
    expect(normalizeSiteOrigin(raw)).toBe('');
  });
});
