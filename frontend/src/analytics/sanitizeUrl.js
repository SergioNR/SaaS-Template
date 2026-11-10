//* Query strings and fragments carry secrets in this app (password reset and
//* invite tokens, Stripe return params) - they must never reach analytics.
//* Every URL-shaped property PostHog attaches is reduced to origin + path
const URL_PROPERTIES = [
  '$current_url',
  '$pathname',
  '$referrer',
  '$initial_current_url',
  '$initial_referrer',
  '$initial_pathname',
  '$prev_pageview_pathname',
  '$prev_pageview_url',
  '$session_entry_url',
  '$session_entry_referrer',
  '$session_entry_pathname',
  '$href',
];

//* Strips `?...` and `#...` from an absolute URL or a path. Non-URL strings
//* ('$direct' referrers, ids) pass through untouched
export const stripQueryAndHash = (value) => {
  if (typeof value !== 'string' || value === '') {
    return value;
  }

  const cut = value.search(/[?#]/);

  return cut === -1 ? value : value.slice(0, cut);
};

const sanitizeProperties = (properties) => {
  if (!properties || typeof properties !== 'object') {
    return properties;
  }

  const sanitized = { ...properties };

  for (const key of URL_PROPERTIES) {
    if (key in sanitized) {
      sanitized[key] = stripQueryAndHash(sanitized[key]);
    }
  }

  //* Autocapture element chains carry the clicked link's href
  if (Array.isArray(sanitized.$elements)) {
    sanitized.$elements = sanitized.$elements.map((element) =>
      element && typeof element.attr__href === 'string'
        ? { ...element, attr__href: stripQueryAndHash(element.attr__href) }
        : element,
    );
  }

  return sanitized;
};

//* PostHog `before_send` hook: returns a copy of the event with every URL
//* property sanitized (event properties and the person $set/$set_once bags)
export const sanitizeEvent = (event) => {
  if (!event) {
    return event;
  }

  return {
    ...event,
    properties: sanitizeProperties(event.properties),
    ...(event.$set ? { $set: sanitizeProperties(event.$set) } : {}),
    ...(event.$set_once ? { $set_once: sanitizeProperties(event.$set_once) } : {}),
  };
};

export default sanitizeEvent;
