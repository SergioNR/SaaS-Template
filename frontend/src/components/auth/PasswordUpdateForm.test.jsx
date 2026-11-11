import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen } from '@testing-library/react';
import { MemoryRouter, Outlet, Route, Routes } from 'react-router';
import { renderWithProviders } from '../../test/renderWithProviders.jsx';

vi.mock('../../config/API/axiosConfig.js', () => ({ default: { patch: vi.fn() } }));

const { default: apiClient } = await import('../../config/API/axiosConfig.js');
const { default: PasswordUpdateForm } = await import('./PasswordUpdateForm.jsx');

const renderForm = () =>
  renderWithProviders(
    <MemoryRouter initialEntries={['/user/profile']}>
      <Routes>
        <Route element={<Outlet context={{ user: { email: 'user@example.com' } }} />}>
          <Route path="/user/profile" element={<PasswordUpdateForm />} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );

const submit = () => {
  fireEvent.change(screen.getByLabelText(/Contraseña actual/), { target: { value: 'WrongPassword1' } });
  fireEvent.change(screen.getByLabelText(/Nueva contraseña/), { target: { value: 'NewPassword123' } });
  fireEvent.click(screen.getByRole('button', { name: 'Cambiar contraseña' }));
};

describe('PasswordUpdateForm errors', () => {
  beforeEach(() => {
    apiClient.patch.mockReset();
  });

  it('shows a too-many-attempts message on 429', async () => {
    apiClient.patch.mockRejectedValue({ response: { status: 429, data: { message: 'raw server text' } } });

    renderForm();
    submit();

    expect(await screen.findByText(/Demasiados intentos fallidos/)).toBeInTheDocument();
    expect(screen.queryByText('raw server text')).not.toBeInTheDocument();
  });

  it('still maps a wrong current password to its own message', async () => {
    apiClient.patch.mockRejectedValue({
      response: { status: 400, data: { code: 'AUTH_CURRENT_PASSWORD_INCORRECT' } },
    });

    renderForm();
    submit();

    expect(await screen.findByText('La contraseña actual es incorrecta')).toBeInTheDocument();
  });
});
