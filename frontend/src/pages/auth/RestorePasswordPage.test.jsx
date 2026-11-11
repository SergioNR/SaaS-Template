import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen } from '@testing-library/react';
import { BrowserRouter, Route, Routes } from 'react-router';
import { renderWithProviders } from '../../test/renderWithProviders.jsx';

vi.mock('../../config/API/axiosConfig.js', () => ({ default: { get: vi.fn(), patch: vi.fn() } }));

const { default: apiClient } = await import('../../config/API/axiosConfig.js');
const { default: RestorePasswordPage } = await import('./RestorePasswordPage.jsx');

const renderPage = () => {
  window.history.replaceState(null, '', '/auth/restore-password?passwordResetToken=reset123');

  return renderWithProviders(
    <BrowserRouter>
      <Routes>
        <Route path="/auth/restore-password" element={<RestorePasswordPage />} />
      </Routes>
    </BrowserRouter>,
  );
};

const fillForm = async (newPassword, confirmNewPassword) => {
  const first = await screen.findByLabelText(/^Nueva contraseña/);
  const second = screen.getByLabelText(/^Confirmar nueva contraseña/);
  fireEvent.change(first, { target: { value: newPassword } });
  fireEvent.change(second, { target: { value: confirmNewPassword } });

  return first.closest('form');
};

describe('RestorePasswordPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    apiClient.get.mockResolvedValue({ data: {} });
  });

  it('blocks the submit when the passwords do not match', async () => {
    renderPage();

    fireEvent.submit(await fillForm('Str0ngPassword', 'Different1'));

    expect(await screen.findByText('Las contraseñas no coinciden')).toBeInTheDocument();
    expect(apiClient.patch).not.toHaveBeenCalled();
  });

  it('sends one request when the form is submitted twice before re-rendering', async () => {
    apiClient.patch.mockReturnValue(new Promise(() => {}));
    renderPage();

    const form = await fillForm('Str0ngPassword', 'Str0ngPassword');
    fireEvent.submit(form);
    fireEvent.submit(form);

    expect(apiClient.patch).toHaveBeenCalledTimes(1);
    expect(apiClient.patch).toHaveBeenCalledWith('/api/v1/auth/password-reset', {
      passwordResetToken: 'reset123',
      newPassword: 'Str0ngPassword',
      confirmNewPassword: 'Str0ngPassword',
    });
  });

  it('shows the success state on 200', async () => {
    apiClient.patch.mockResolvedValue({ status: 200, data: {} });
    renderPage();

    fireEvent.submit(await fillForm('Str0ngPassword', 'Str0ngPassword'));

    expect(await screen.findByText('Tu contraseña ha sido actualizada correctamente')).toBeInTheDocument();
  });
});
