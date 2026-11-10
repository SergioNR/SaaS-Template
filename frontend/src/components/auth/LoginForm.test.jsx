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
});
