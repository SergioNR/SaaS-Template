import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { BrowserRouter, Route, Routes } from 'react-router';
import { renderWithProviders } from '../../test/renderWithProviders.jsx';

vi.mock('../../config/API/axiosConfig.js', () => ({ default: { post: vi.fn(), get: vi.fn() } }));

const { default: apiClient } = await import('../../config/API/axiosConfig.js');
const { default: VerifyEmailPage } = await import('./VerifyEmailPage.jsx');

const TOKEN = 'a'.repeat(43);

const renderPage = (search) => {
  window.history.replaceState(null, '', `/auth/verify-email${search}`);

  return renderWithProviders(
    <BrowserRouter>
      <Routes>
        <Route path="/auth/verify-email" element={<VerifyEmailPage />} />
      </Routes>
    </BrowserRouter>,
  );
};

describe('VerifyEmailPage', () => {
  beforeEach(() => {
    apiClient.post.mockReset();
  });

  it('posts the token once, scrubs it from the address bar and shows the success state', async () => {
    apiClient.post.mockResolvedValue({ data: {} });

    renderPage(`?emailVerificationToken=${TOKEN}`);

    expect(await screen.findByText('¡Correo confirmado!')).toBeInTheDocument();
    expect(apiClient.post).toHaveBeenCalledTimes(1);
    expect(apiClient.post).toHaveBeenCalledWith('/api/v1/auth/email-verification', { emailVerificationToken: TOKEN });
    expect(window.location.search).toBe('');
    expect(screen.getByRole('link', { name: /Ir al inicio de sesión/ })).toHaveAttribute('href', '/auth/login');
  });

  it('shows the invalid state with a resend form on 400', async () => {
    apiClient.post.mockRejectedValueOnce({ response: { status: 400, data: { code: 'EMAIL_VERIFICATION_INVALID' } } });

    renderPage(`?emailVerificationToken=${TOKEN}`);

    expect(await screen.findByText('Enlace inválido')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Enviar nuevo enlace' })).toBeInTheDocument();
  });

  it('shows the invalid state without calling the API when the link has no token', async () => {
    renderPage('');

    expect(await screen.findByText('Enlace inválido')).toBeInTheDocument();
    expect(apiClient.post).not.toHaveBeenCalled();
  });

  it('offers a retry on network or server errors and re-posts the token', async () => {
    apiClient.post.mockRejectedValueOnce({ response: { status: 500 } }).mockResolvedValueOnce({ data: {} });

    renderPage(`?emailVerificationToken=${TOKEN}`);

    fireEvent.click(await screen.findByRole('button', { name: 'Reintentar' }));

    expect(await screen.findByText('¡Correo confirmado!')).toBeInTheDocument();
    expect(apiClient.post).toHaveBeenCalledTimes(2);
  });

  it('requests a new verification email from the invalid state', async () => {
    apiClient.post.mockRejectedValueOnce({ response: { status: 400 } }).mockResolvedValueOnce({ data: {} });

    renderPage(`?emailVerificationToken=${TOKEN}`);

    fireEvent.change(await screen.findByLabelText(/Reenviar el correo de confirmación/), {
      target: { value: 'me@example.com' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Enviar nuevo enlace' }));

    await waitFor(() => {
      expect(apiClient.post).toHaveBeenLastCalledWith('/api/v1/auth/email-verification/resend', {
        email: 'me@example.com',
      });
    });
    expect(await screen.findByText(/recibirás un nuevo enlace/)).toBeInTheDocument();
  });
});
