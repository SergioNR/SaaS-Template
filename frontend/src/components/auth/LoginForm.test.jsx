import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen } from '@testing-library/react';
import { BrowserRouter, Route, Routes, useLocation } from 'react-router';
import { renderWithProviders } from '../../test/renderWithProviders.jsx';

vi.mock('../../config/API/axiosConfig.js', () => ({ default: { post: vi.fn(), get: vi.fn() } }));

const { default: apiClient } = await import('../../config/API/axiosConfig.js');
const { default: LoginForm } = await import('./LoginForm.jsx');

const Where = () => {
  const { pathname, search } = useLocation();

  return <p data-testid="where">{`${pathname}${search}`}</p>;
};

const renderLogin = (search) => {
  window.history.replaceState(null, '', `/auth/login${search}`);

  return renderWithProviders(
    <BrowserRouter>
      <Routes>
        <Route path="/auth/login" element={<LoginForm />} />
        <Route path="*" element={<Where />} />
      </Routes>
    </BrowserRouter>,
  );
};

const submit = () => {
  fireEvent.change(screen.getByLabelText(/Correo electrónico/), { target: { value: 'user@example.com' } });
  fireEvent.change(screen.getByLabelText(/Contraseña/), { target: { value: 'correct horse' } });
  fireEvent.click(screen.getByRole('button', { name: 'Iniciar sesión' }));
};

describe('LoginForm next redirect', () => {
  beforeEach(() => {
    apiClient.post.mockReset();
  });

  it('returns to a safe same-origin next path after login', async () => {
    apiClient.post.mockResolvedValue({ data: { user: { role: 'user' } } });

    renderLogin(`?next=${encodeURIComponent('/user/team?tab=invites')}`);
    submit();

    expect(await screen.findByTestId('where')).toHaveTextContent('/user/team?tab=invites');
  });

  it.each(['//evil.example.com', 'https://evil.example.com', '/auth/register', '/\\evil.example.com'])(
    'ignores the unsafe next %s and uses the role home',
    async (next) => {
      apiClient.post.mockResolvedValue({ data: { user: { role: 'user' } } });

      renderLogin(`?next=${encodeURIComponent(next)}`);
      submit();

      expect(await screen.findByTestId('where')).toHaveTextContent(/^\/dashboard$/);
    },
  );

  it('sends superadmins to /admin without a next param', async () => {
    apiClient.post.mockResolvedValue({ data: { user: { role: 'superadmin' } } });

    renderLogin('');
    submit();

    expect(await screen.findByTestId('where')).toHaveTextContent(/^\/admin$/);
  });

  it('submits once even when clicked twice', async () => {
    apiClient.post.mockReturnValue(new Promise(() => {}));

    renderLogin('');
    submit();
    fireEvent.click(screen.getByRole('button', { name: 'Iniciar sesión' }));

    expect(apiClient.post).toHaveBeenCalledTimes(1);
  });

  it('explains an unverified email on 403 EMAIL_NOT_VERIFIED and resends to the typed address', async () => {
    apiClient.post
      .mockRejectedValueOnce({ response: { status: 403, data: { code: 'EMAIL_NOT_VERIFIED' } } })
      .mockResolvedValueOnce({ data: {} });

    renderLogin('');
    submit();

    expect(await screen.findByText(/confirmar tu correo electrónico antes de iniciar sesión/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Reenviar el correo de confirmación/)).toHaveValue('user@example.com');

    fireEvent.click(screen.getByRole('button', { name: 'Enviar nuevo enlace' }));

    expect(await screen.findByText(/recibirás un nuevo enlace/)).toBeInTheDocument();
    expect(apiClient.post).toHaveBeenLastCalledWith('/api/v1/auth/email-verification/resend', {
      email: 'user@example.com',
    });
  });

  it('shows the too-many-attempts message when the resend is throttled', async () => {
    apiClient.post
      .mockRejectedValueOnce({ response: { status: 403, data: { code: 'EMAIL_NOT_VERIFIED' } } })
      .mockRejectedValueOnce({ response: { status: 429 } });

    renderLogin('');
    submit();

    fireEvent.click(await screen.findByRole('button', { name: 'Enviar nuevo enlace' }));

    expect(await screen.findByText(/Demasiados intentos/)).toBeInTheDocument();
  });
});
