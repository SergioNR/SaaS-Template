//* Full-page navigation (drops all in-memory state). Its own module so tests
//* can mock it - jsdom's window.location cannot be stubbed
export const hardRedirect = (url) => {
  window.location.assign(url);
};

export default hardRedirect;
