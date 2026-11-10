import { describe, expect, it } from 'vitest';
import { sanitizeEvent, stripQueryAndHash } from './sanitizeUrl.js';

describe('stripQueryAndHash', () => {
  it.each([
    [
      'https://app.example.com/auth/restore-password?passwordResetToken=secret',
      'https://app.example.com/auth/restore-password',
    ],
    ['https://app.example.com/auth/accept-invite?inviteToken=abc#x', 'https://app.example.com/auth/accept-invite'],
    ['https://app.example.com/pricing#faq', 'https://app.example.com/pricing'],
    ['/user/billing?status=paid', '/user/billing'],
    ['https://app.example.com/dashboard', 'https://app.example.com/dashboard'],
    ['$direct', '$direct'],
    ['', ''],
  ])('%s -> %s', (input, expected) => {
    expect(stripQueryAndHash(input)).toBe(expected);
  });

  it.each([null, undefined, 42])('passes %j through', (input) => {
    expect(stripQueryAndHash(input)).toBe(input);
  });
});

describe('sanitizeEvent (PostHog before_send)', () => {
  const tokenUrl = 'https://app.example.com/auth/restore-password?passwordResetToken=secret';

  it('strips query strings and fragments from every URL property', () => {
    const event = {
      event: '$pageview',
      properties: {
        $current_url: tokenUrl,
        $pathname: '/auth/restore-password?passwordResetToken=secret',
        $referrer: 'https://mail.example.com/inbox?id=1#msg',
        $initial_current_url: tokenUrl,
        $session_entry_url: tokenUrl,
        $prev_pageview_pathname: '/auth/accept-invite?inviteToken=abc',
        $host: 'app.example.com',
        custom: 'kept?as=is',
      },
    };

    const sanitized = sanitizeEvent(event);

    expect(sanitized.properties).toEqual({
      $current_url: 'https://app.example.com/auth/restore-password',
      $pathname: '/auth/restore-password',
      $referrer: 'https://mail.example.com/inbox',
      $initial_current_url: 'https://app.example.com/auth/restore-password',
      $session_entry_url: 'https://app.example.com/auth/restore-password',
      $prev_pageview_pathname: '/auth/accept-invite',
      $host: 'app.example.com',
      custom: 'kept?as=is',
    });
  });

  it('sanitizes person properties and autocapture hrefs', () => {
    const sanitized = sanitizeEvent({
      event: '$autocapture',
      properties: {
        $elements: [{ tag_name: 'a', attr__href: '/auth/accept-invite?inviteToken=abc' }, { tag_name: 'div' }],
      },
      $set: { $current_url: tokenUrl },
      $set_once: { $initial_referrer: 'https://mail.example.com/?t=1', $initial_current_url: tokenUrl },
    });

    expect(sanitized.properties.$elements).toEqual([
      { tag_name: 'a', attr__href: '/auth/accept-invite' },
      { tag_name: 'div' },
    ]);
    expect(sanitized.$set.$current_url).toBe('https://app.example.com/auth/restore-password');
    expect(sanitized.$set_once).toEqual({
      $initial_referrer: 'https://mail.example.com/',
      $initial_current_url: 'https://app.example.com/auth/restore-password',
    });
  });

  it('does not mutate the original event', () => {
    const event = { event: '$pageview', properties: { $current_url: tokenUrl } };

    sanitizeEvent(event);

    expect(event.properties.$current_url).toBe(tokenUrl);
  });

  it('passes a dropped (null) event through', () => {
    expect(sanitizeEvent(null)).toBeNull();
  });
});
