import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen } from '@testing-library/react';
import { BrowserRouter, Outlet, Route, Routes, useLocation } from 'react-router';
import { renderWithProviders } from '../../test/renderWithProviders.jsx';

vi.mock('../../config/API/axiosConfig.js', () => ({
  default: { get: vi.fn(), patch: vi.fn(), delete: vi.fn() },
}));
vi.mock('../../utils/notifications.js', () => ({ notifySuccess: vi.fn(), notifyError: vi.fn() }));

const { default: apiClient } = await import('../../config/API/axiosConfig.js');
const { default: AdminAccount } = await import('./AdminAccount.jsx');

const httpError = (status) => Object.assign(new Error(`HTTP ${status}`), { response: { status, data: {} } });

const Where = () => {
  const { pathname, search } = useLocation();

  return <p data-testid="where">{`${pathname}${search}`}</p>;
};

//* Stands in for AdminDashboardWrapper's outlet context
const AdminLayout = () => <Outlet context={{ sessionUser: { id: 'a1', role: 'superadmin' } }} />;

const renderPage = () => {
  window.history.replaceState(null, '', '/admin/account');

  return renderWithProviders(
    <BrowserRouter>
      <Routes>
        <Route path="/admin" element={<AdminLayout />}>
          <Route path="account" element={<AdminAccount />} />
        </Route>
        <Route path="*" element={<Where />} />
      </Routes>
    </BrowserRouter>,
  );
};

describe('AdminAccount', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    apiClient.get.mockResolvedValue({ data: { user: { id: 'a1', email: 'admin@example.com' } } });
  });

  it('renders the email, the password form and the deletion card', async () => {
    renderPage();

    expect(await screen.findByText('admin@example.com')).toBeInTheDocument();
    expect(apiClient.get).toHaveBeenCalledWith('/api/v1/user', expect.any(Object));
    expect(screen.getByLabelText(/^Contraseña actual/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cambiar contraseña' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Eliminar mi cuenta' })).toBeInTheDocument();
  });

  it('sends the password change to the account endpoint', async () => {
    apiClient.patch.mockResolvedValue({ status: 200, data: {} });
    renderPage();

    await screen.findByText('admin@example.com');
    fireEvent.change(screen.getByLabelText(/^Contraseña actual/), { target: { value: 'OldPassw0rd' } });
    fireEvent.change(screen.getByLabelText(/^Nueva contraseña/), { target: { value: 'NewPassw0rd' } });
    fireEvent.click(screen.getByRole('button', { name: 'Cambiar contraseña' }));

    expect(apiClient.patch).toHaveBeenCalledWith('/api/v1/user/password', {
      currentPassword: 'OldPassw0rd',
      newPassword: 'NewPassw0rd',
    });
    expect(screen.queryByTestId('where')).not.toBeInTheDocument();
  });

  it('keeps the forms usable when the profile cannot be loaded', async () => {
    apiClient.get.mockRejectedValue(httpError(500));
    renderPage();

    expect(await screen.findByText('No se pudo cargar tu email.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cambiar contraseña' })).toBeInTheDocument();
  });
});
