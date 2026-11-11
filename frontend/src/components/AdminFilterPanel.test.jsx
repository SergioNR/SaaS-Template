import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Outlet, Route, Routes } from 'react-router';
import { renderWithProviders } from '../test/renderWithProviders.jsx';

vi.mock('../config/API/axiosConfig.js', () => ({ default: { get: vi.fn(), delete: vi.fn() } }));

const { default: apiClient } = await import('../config/API/axiosConfig.js');
const { default: AdminUsersList } = await import('../pages/admin/AdminUsersList.jsx');
const { default: AdminCompaniesList } = await import('../pages/admin/AdminCompaniesList.jsx');

const renderPage = (element, path, initialEntry) =>
  renderWithProviders(
    <MemoryRouter initialEntries={[initialEntry ?? path]}>
      <Routes>
        <Route element={<Outlet context={{ sessionUser: { id: 'admin-1' } }} />}>
          <Route path={path} element={element} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );

const lastParams = () => apiClient.get.mock.calls.at(-1)[1].params;

describe('AdminFilterPanel on the admin users list', () => {
  beforeEach(() => {
    apiClient.get.mockReset();
    apiClient.get.mockResolvedValue({ data: { users: [], userCount: 0 } });
  });

  it('sends no request while editing and exactly one on apply, from the first page', async () => {
    renderPage(<AdminUsersList />, '/admin/users');
    await waitFor(() => expect(apiClient.get).toHaveBeenCalledTimes(1));

    fireEvent.change(screen.getByLabelText('Rol'), { target: { value: 'superadmin' } });
    fireEvent.change(screen.getByLabelText('Último acceso hasta'), { target: { value: '2026-08-12' } });

    expect(apiClient.get).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: 'Aplicar filtros' }));

    await waitFor(() => expect(apiClient.get).toHaveBeenCalledTimes(2));
    expect(lastParams()).toEqual({ limit: 25, role: 'superadmin', last_login_to: '2026-08-12' });
    expect(await screen.findByText('2 filtros activos')).toBeInTheDocument();
  });

  it('clears the applied filters with one request', async () => {
    renderPage(<AdminUsersList />, '/admin/users', '/admin/users?role=user');
    await waitFor(() => expect(apiClient.get).toHaveBeenCalledTimes(1));
    expect(lastParams()).toMatchObject({ role: 'user' });

    fireEvent.click(screen.getByRole('button', { name: 'Quitar filtros' }));

    await waitFor(() => expect(apiClient.get).toHaveBeenCalledTimes(2));
    expect(lastParams()).toEqual({ limit: 25 });
  });

  it('reverts staged edits without a request', async () => {
    renderPage(<AdminUsersList />, '/admin/users', '/admin/users?role=user');
    await waitFor(() => expect(apiClient.get).toHaveBeenCalledTimes(1));

    fireEvent.change(screen.getByLabelText('Rol'), { target: { value: 'superadmin' } });
    fireEvent.click(screen.getByRole('button', { name: 'Deshacer cambios' }));

    expect(screen.getByLabelText('Rol')).toHaveValue('user');
    expect(apiClient.get).toHaveBeenCalledTimes(1);
  });

  it('sorts from a header and announces the direction', async () => {
    renderPage(<AdminUsersList />, '/admin/users');
    await waitFor(() => expect(apiClient.get).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByRole('button', { name: 'Ordenar por Email' }));

    await waitFor(() => expect(apiClient.get).toHaveBeenCalledTimes(2));
    expect(lastParams()).toEqual({ limit: 25, sort: 'email', order: 'asc' });
    expect(screen.getByRole('columnheader', { name: /Email/ })).toHaveAttribute('aria-sort', 'ascending');

    fireEvent.click(screen.getByRole('button', { name: 'Ordenar por Email' }));

    await waitFor(() => expect(apiClient.get).toHaveBeenCalledTimes(3));
    expect(lastParams()).toMatchObject({ sort: 'email', order: 'desc' });
    expect(screen.getByRole('columnheader', { name: /Email/ })).toHaveAttribute('aria-sort', 'descending');
  });

  it('shows an inline error when the API rejects the filters with 422', async () => {
    apiClient.get.mockRejectedValue({ response: { status: 422, data: { errors: [] } } });

    renderPage(<AdminUsersList />, '/admin/users', '/admin/users?created_from=2026-02-01&created_to=2026-01-01');

    expect(await screen.findByText(/Algún filtro u orden no es válido/)).toBeInTheDocument();
  });
});

describe('AdminFilterPanel on the admin companies list', () => {
  beforeEach(() => {
    apiClient.get.mockReset();
    apiClient.get.mockResolvedValue({ data: { companies: [], companyCount: 0 } });
  });

  it('filters Stripe-linked companies sorted by name', async () => {
    renderPage(<AdminCompaniesList />, '/admin/companies');
    await waitFor(() => expect(apiClient.get).toHaveBeenCalledTimes(1));

    fireEvent.change(screen.getByLabelText('Cliente de Stripe'), { target: { value: 'true' } });
    fireEvent.click(screen.getByRole('button', { name: 'Aplicar filtros' }));
    await waitFor(() => expect(apiClient.get).toHaveBeenCalledTimes(2));

    fireEvent.click(screen.getByRole('button', { name: 'Ordenar por Empresa' }));
    await waitFor(() => expect(apiClient.get).toHaveBeenCalledTimes(3));

    expect(lastParams()).toEqual({ limit: 25, stripe_linked: 'true', sort: 'name', order: 'asc' });
  });
});
