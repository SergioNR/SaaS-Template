import { createTheme, DEFAULT_THEME } from '@mantine/core';

//* Template theme - neutral on purpose. Rebrand here, not per component:
//* swap the `brand` scale (10 shades, 0 = lightest, 9 = darkest) and the
//* font. Components reference the primary colour through Mantine's
//* `--mantine-primary-color-*` variables, never a hard-coded colour name.
//* The font is self-hosted via @fontsource (imported in main.jsx), so the
//* CSP needs no third-party font origin. Every other placeholder a fork
//* replaces is listed in the root README "Forking checklist"
const brand = DEFAULT_THEME.colors.blue;

export const FONT_BODY = "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";

export const theme = createTheme({
  primaryColor: 'brand',
  primaryShade: { light: 6, dark: 5 },
  defaultRadius: 'md',
  colors: {
    brand,
  },
  fontFamily: FONT_BODY,
  headings: {
    fontFamily: FONT_BODY,
    fontWeight: '700',
  },
  components: {
    Button: {
      defaultProps: { radius: 'md' },
    },
    ActionIcon: {
      defaultProps: { radius: 'md' },
    },
    Card: {
      defaultProps: { radius: 'md' },
    },
    Paper: {
      defaultProps: { radius: 'md' },
    },
    Alert: {
      defaultProps: { radius: 'md' },
    },
    Modal: {
      defaultProps: { radius: 'md', centered: true },
    },
    Tooltip: {
      defaultProps: { withArrow: true },
    },
  },
});

export default theme;
