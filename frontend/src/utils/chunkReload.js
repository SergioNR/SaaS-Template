//* After a deploy, an open tab still references the previous build's hashed
//* chunks, which no longer exist - the next lazy route fails to load. One
//* full reload picks up the new index.html; the timestamp guard stops a
//* reload loop when the chunk is genuinely unreachable (offline, CDN down)
const RELOAD_KEY = 'chunk-reload-at';
const RELOAD_WINDOW_MS = 10000;

const CHUNK_ERROR_PATTERN =
  /Failed to fetch dynamically imported module|error loading dynamically imported module|Importing a module script failed|Unable to preload CSS/i;

export const isChunkLoadError = (failure) => {
  if (!failure) {
    return false;
  }

  if (failure.name === 'ChunkLoadError') {
    return true;
  }

  return CHUNK_ERROR_PATTERN.test(String(failure.message ?? failure));
};

//* Returns true when a reload was triggered, false when one already ran in
//* the last few seconds (the caller then shows its error UI instead)
export const reloadOnce = () => {
  let lastReload = 0;

  try {
    lastReload = Number(window.sessionStorage.getItem(RELOAD_KEY)) || 0;
  } catch {
    // Storage blocked - fall through and allow a single reload
  }

  if (Date.now() - lastReload < RELOAD_WINDOW_MS) {
    return false;
  }

  try {
    window.sessionStorage.setItem(RELOAD_KEY, String(Date.now()));
  } catch {
    // Without storage we cannot guard against loops - do not auto-reload
    return false;
  }

  window.location.reload();
  return true;
};

//* Vite fires `vite:preloadError` when a dynamic import's chunk (or its
//* preloaded CSS) fails; preventDefault stops it from surfacing as an error
//* while the page reloads
export const installPreloadErrorHandler = () => {
  window.addEventListener('vite:preloadError', (event) => {
    if (reloadOnce()) {
      event.preventDefault();
    }
  });
};
