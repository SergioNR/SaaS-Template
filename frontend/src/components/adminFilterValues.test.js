import { describe, expect, it } from 'vitest';
import {
  ADMIN_LIST_FILTER_FIELDS,
  ariaSortFor,
  countActiveFilters,
  emptyFilterValues,
  filterParams,
  filterValuesFromForm,
  filterValuesFromSearchParams,
  listRequestParams,
  mergeListSearchParams,
  nextSort,
  sortFromSearchParams,
} from './adminFilterValues.js';

const USERS = ADMIN_LIST_FILTER_FIELDS.users;

describe('adminFilterValues', () => {
  it('builds an empty value per query parameter, date ranges split in two', () => {
    expect(emptyFilterValues(USERS)).toEqual({
      role: '',
      company_id: '',
      created_from: '',
      created_to: '',
      last_login_from: '',
      last_login_to: '',
    });
  });

  it('reads only its own parameters from the URL', () => {
    const values = filterValuesFromSearchParams(
      ADMIN_LIST_FILTER_FIELDS.companies,
      new URLSearchParams('stripe_linked=true&search=acme&password=x'),
    );

    expect(values).toEqual({ stripe_linked: 'true', created_from: '', created_to: '' });
  });

  it('trims form values', () => {
    const elements = { role: { value: 'user' }, company_id: { value: '  abc ' } };

    expect(filterValuesFromForm(USERS, elements)).toMatchObject({ role: 'user', company_id: 'abc', created_from: '' });
  });

  it('drops empty values from request parameters', () => {
    expect(filterParams({ role: 'user', company_id: '', created_to: '2026-01-01' })).toEqual({
      role: 'user',
      created_to: '2026-01-01',
    });
  });

  it('counts a date range once whichever bounds are set', () => {
    expect(countActiveFilters(USERS, { ...emptyFilterValues(USERS), created_to: '2026-01-01', role: 'user' })).toBe(2);
    expect(countActiveFilters(USERS, emptyFilterValues(USERS))).toBe(0);
  });

  it('ignores a sort key outside the whitelist and defaults to ascending', () => {
    expect(sortFromSearchParams('users', new URLSearchParams('sort=password&order=desc'))).toEqual({
      sort: null,
      order: 'asc',
    });
    expect(sortFromSearchParams('users', new URLSearchParams('sort=email&order=sideways'))).toEqual({
      sort: 'email',
      order: 'asc',
    });
  });

  it('starts a new column ascending and flips the active one', () => {
    expect(nextSort({ sort: null, order: 'asc' }, 'email')).toEqual({ sort: 'email', order: 'asc' });
    expect(nextSort({ sort: 'email', order: 'asc' }, 'email')).toEqual({ sort: 'email', order: 'desc' });
    expect(nextSort({ sort: 'email', order: 'desc' }, 'created_at')).toEqual({ sort: 'created_at', order: 'asc' });
  });

  it('exposes the sort to assistive technology', () => {
    expect(ariaSortFor({ sort: 'email', order: 'desc' }, 'email')).toBe('descending');
    expect(ariaSortFor({ sort: 'email', order: 'asc' }, 'email')).toBe('ascending');
    expect(ariaSortFor({ sort: 'email', order: 'asc' }, 'created_at')).toBe('none');
  });

  it('replaces filters and sort in the URL and keeps other parameters', () => {
    const current = new URLSearchParams('role=user&created_from=2026-01-01&tab=x&sort=email&order=desc');

    const filtered = mergeListSearchParams(current, USERS, {
      filters: { ...emptyFilterValues(USERS), role: 'superadmin' },
    });
    expect(filtered.toString()).toBe('tab=x&sort=email&order=desc&role=superadmin');

    const unsorted = mergeListSearchParams(current, USERS, { sort: { sort: null, order: 'asc' } });
    expect(unsorted.get('sort')).toBeNull();
    expect(unsorted.get('role')).toBe('user');
  });

  it('builds request parameters from filters and sort', () => {
    expect(
      listRequestParams({ filters: { role: 'user', company_id: '' }, sort: { sort: 'email', order: 'desc' } }),
    ).toEqual({
      role: 'user',
      sort: 'email',
      order: 'desc',
    });
    expect(listRequestParams({ filters: {}, sort: { sort: null, order: 'asc' } })).toEqual({});
  });
});
