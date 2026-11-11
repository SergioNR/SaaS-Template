import { describe, expect, it } from 'vitest';
import { isAuthPath, loginRedirectPath, safeNextPath } from './safeNext.js';

const ORIGIN = 'https://app.example.com';

describe('safeNextPath', () => {
  it.each([
    ['/dashboard', '/dashboard'],
    ['/user/team', '/user/team'],
    ['/user/billing?status=paid', '/user/billing?status=paid'],
    ['/admin/users/42#activity', '/admin/users/42#activity'],
    ['/user/../dashboard', '/dashboard'],
  ])('accepts the same-origin path %s', (raw, expected) => {
    expect(safeNextPath(raw, ORIGIN)).toBe(expected);
  });

  it.each([
    ['protocol-relative URL', '//evil.example.com/phish'],
    ['backslash protocol-relative URL', '/\\evil.example.com'],
    ['absolute URL', 'https://evil.example.com/'],
    ['same-origin absolute URL', `${ORIGIN}/dashboard`],
    ['javascript: URL', 'javascript:alert(1)'],
    ['relative path', 'dashboard'],
    ['empty string', ''],
    ['tab-smuggled protocol-relative URL', '/\t/evil.example.com'],
    ['newline-smuggled path', '/dash\nboard'],
    ['the login page itself', '/auth/login'],
    ['another auth page', '/auth/accept-invite?inviteToken=x'],
  ])('rejects a %s', (_label, raw) => {
    expect(safeNextPath(raw, ORIGIN)).toBeNull();
  });

  it.each([null, undefined, 42, {}, ['/dashboard']])('rejects the non-string %j', (raw) => {
    expect(safeNextPath(raw, ORIGIN)).toBeNull();
  });

  it('rejects overly long values', () => {
    expect(safeNextPath(`/${'a'.repeat(3000)}`, ORIGIN)).toBeNull();
  });
});

describe('loginRedirectPath', () => {
  it('attaches the current path as an encoded next param', () => {
    expect(loginRedirectPath('/user/billing?status=paid')).toBe(
      `/auth/login?next=${encodeURIComponent('/user/billing?status=paid')}`,
    );
  });

  it('drops an unsafe current path', () => {
    expect(loginRedirectPath('/auth/login')).toBe('/auth/login');
    expect(loginRedirectPath('//evil.example.com')).toBe('/auth/login');
  });
});

describe('isAuthPath', () => {
  it.each(['/auth', '/auth/', '/auth/login', '/auth/accept-invite'])('treats %s as an auth page', (pathname) => {
    expect(isAuthPath(pathname)).toBe(true);
  });

  it.each(['/', '/authors-page', '/authx', '/user/auth', '', undefined])('treats %s as a non-auth page', (pathname) => {
    expect(isAuthPath(pathname)).toBe(false);
  });

  it('keeps safeNextPath rejecting the bare /auth route', () => {
    expect(safeNextPath('/auth', ORIGIN)).toBeNull();
    expect(safeNextPath('/authors-page', ORIGIN)).toBe('/authors-page');
  });
});
