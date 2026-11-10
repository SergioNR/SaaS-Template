import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router';
import { MAIN_CONTENT_ID } from './SkipLink.jsx';

const HEADING_SELECTOR = 'h1, h2';
//* Lazy routes render after their chunk arrives - keep looking briefly
const MAX_ATTEMPTS = 20;
const RETRY_MS = 50;

//* SPA navigations don't move focus, so screen reader and keyboard users
//* stay on the clicked link with no cue the page changed. On every pathname
//* change (not the first load) focus moves to the new page's main heading,
//* falling back to <main>. Renders nothing; mounted once inside the router
export function RouteFocus() {
  const { pathname } = useLocation();
  const firstRenderRef = useRef(true);

  useEffect(() => {
    if (firstRenderRef.current) {
      firstRenderRef.current = false;
      return undefined;
    }

    let attempts = 0;
    let timer = null;

    const focusTarget = () => {
      const main = document.getElementById(MAIN_CONTENT_ID);
      const heading = main?.querySelector(HEADING_SELECTOR);

      if (!heading && attempts < MAX_ATTEMPTS) {
        attempts += 1;
        timer = setTimeout(focusTarget, RETRY_MS);
        return;
      }

      const target = heading ?? main;

      if (!target) {
        return;
      }

      //* Headings are not focusable by default; -1 keeps them out of the tab order
      if (!target.hasAttribute('tabindex')) {
        target.setAttribute('tabindex', '-1');
      }

      target.focus({ preventScroll: false });
    };

    timer = setTimeout(focusTarget, 0);

    return () => clearTimeout(timer);
  }, [pathname]);

  return null;
}

export default RouteFocus;
