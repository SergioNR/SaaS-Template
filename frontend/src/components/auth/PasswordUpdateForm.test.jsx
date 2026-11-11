import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { BrowserRouter, Route, Routes, useLocation } from 'react-router';
import { renderWithProviders } from '../../test/renderWithProviders.jsx';

vi.mock('../../config/API/axiosConfig.js', () => ({ default: { patch: vi.fn() } }));
vi.mock('../../utils/notifications.js', () => ({ notifySuccess: vi.fn(), notifyError: vi.fn() }));
vi.mock('../../utils/sessionCaches.js', () => ({ invalidateSessionCaches: vi.fn() }));

const { default: apiClient } = await import('../../config/API/axiosConfig.js');
const { notifySuccess } = await import('../../utils/notifications.js');
const { invalidateSessionCaches } = await import('../../utils/sessionCaches.js');
const { default: PasswordUpdateForm } = await import('./PasswordUpdateForm.jsx');

const httpError = (status, code) =>
  Object.assign(new Error(`HTTP ${status}`), { response: { status, data: { code } } });

const Where = () => {
  const { pathname, search } = useLocation();

  return <p data-testid="where">{`${pathname}${search}`}</p>;
};

const renderAndSubmit = () => {
  window.history.replaceState(null, '', '/user/profile');

  renderWithProviders(
    <BrowserRouter>
      <Routes>
        <Route path="/user/profile" element={<PasswordUpdateForm />} />
        <Route path="*" element={<Where />} />
      </Routes>
    </BrowserRouter>,
  );

  fireEvent.change(screen.getByLabelText(/^Contraseña actual/), { target: { value: 'OldPassw0rd' } });
  fireEvent.change(screen.getByLabelText(/^Nueva contraseña/), { target: { value: 'NewPassw0rd' } });
  fireEvent.click(screen.getByRole('button', { name: 'Cambiar contraseña' }));
};

describe('PasswordUpdateForm', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('sends the values read through form.elements and confirms success', async () => {
    apiClient.patch.mockResolvedValue({ status: 200, data: {} });

    renderAndSubmit();

    expect(apiClient.patch).toHaveBeenCalledWith(expect.any(String), {
      currentPassword: 'OldPassw0rd',
      newPassword: 'NewPassw0rd',
    });
    await waitFor(() => expect(notifySuccess).toHaveBeenCalledTimes(1));
  });

  it.each([
    [400, 'AUTH_CURRENT_PASSWORD_INCORRECT', 'La contraseña actual es incorrecta'],
    [400, 'AUTH_PASSWORD_UNCHANGED', 'La nueva contraseña debe ser diferente de la contraseña actual'],
    [400, undefined, 'Los datos introducidos no son válidos. Por favor, inténtalo de nuevo.'],
    [422, undefined, 'Los datos introducidos no son válidos. Por favor, inténtalo de nuevo.'],
    [500, undefined, 'Ha ocurrido un error inesperado. Por favor, inténtalo de nuevo.'],
  ])('maps %i %s to its message', async (status, code, message) => {
    apiClient.patch.mockRejectedValue(httpError(status, code));

    renderAndSubmit();

    expect(await screen.findByText(message)).toBeInTheDocument();
  });

  it('clears session caches and returns to login with next on 401', async () => {
    apiClient.patch.mockRejectedValue(httpError(401));

    renderAndSubmit();

    expect(await screen.findByTestId('where')).toHaveTextContent('/auth/login?next=%2Fuser%2Fprofile');
    expect(invalidateSessionCaches).toHaveBeenCalledTimes(1);
  });
});
