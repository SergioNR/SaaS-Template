import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

const DEV_SITE_BASE_URL = 'http://localhost:5173';

// https://vite.dev/config/
export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_');

  //* Seo.jsx builds the canonical/og:url from VITE_SITE_BASE_URL - an unset
  //* var would ship pages without them. Production builds must set it;
  //* the dev server falls back to the local Vite origin
  if (!env.VITE_SITE_BASE_URL) {
    if (command === 'build') {
      throw new Error('VITE_SITE_BASE_URL must be set for production builds (see .env.example)');
    }

    process.env.VITE_SITE_BASE_URL = DEV_SITE_BASE_URL;
  }

  //* Without an API base URL every request goes to the SPA's own origin,
  //* where nginx answers /api/* with 404 - fail the build instead
  if (command === 'build' && !env.VITE_API_BASE_URL) {
    throw new Error('VITE_API_BASE_URL must be set for production builds (see .env.example)');
  }

  return {
    plugins: [react()],
  };
});
