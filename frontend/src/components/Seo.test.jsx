import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../test/renderWithProviders.jsx';
import Seo from './Seo.jsx';

const attr = (selector, name) => document.head.querySelector(selector)?.getAttribute(name) ?? null;

describe('Seo', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it.each(['https://example.com', 'https://example.com/', 'https://example.com///'])(
    'builds single-slash canonical, og:url and image URLs from origin %s',
    (origin) => {
      vi.stubEnv('VITE_SITE_BASE_URL', origin);

      renderWithProviders(<Seo title="Precios" description="Planes" path="/pricing" />);

      expect(attr('link[rel="canonical"]', 'href')).toBe('https://example.com/pricing');
      expect(attr('meta[property="og:url"]', 'content')).toBe('https://example.com/pricing');
      expect(attr('meta[property="og:image"]', 'content')).toBe('https://example.com/og-image.png');
      expect(attr('meta[name="twitter:image"]', 'content')).toBe('https://example.com/og-image.png');
      expect(attr('meta[name="robots"]', 'content')).toBe('index, follow');
    },
  );

  it('emits no canonical or og:url on internal pages', () => {
    vi.stubEnv('VITE_SITE_BASE_URL', 'https://example.com/');

    renderWithProviders(<Seo title="Panel" />);

    expect(document.head.querySelector('link[rel="canonical"]')).toBeNull();
    expect(document.head.querySelector('meta[property="og:url"]')).toBeNull();
    expect(attr('meta[name="robots"]', 'content')).toBe('noindex, nofollow');
    expect(attr('meta[property="og:image"]', 'content')).toBe('https://example.com/og-image.png');
  });
});
