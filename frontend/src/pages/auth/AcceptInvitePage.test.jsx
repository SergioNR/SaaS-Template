import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { BrowserRouter, Route, Routes, useLocation } from 'react-router';
import { renderWithProviders } from '../../test/renderWithProviders.jsx';

vi.mock('../../config/API/axiosConfig.js', () => ({ default: { get: vi.fn(), post: vi.fn() } }));
vi.mock('../../utils/notifications.js', () => ({ notifySuccess: vi.fn(), notifyError: vi.fn() }));

const { default: apiClient } = await import('../../config/API/axiosConfig.js');
const { notifyError, notifySuccess } = await import('../../utils/notifications.js');
const { default: AcceptInvitePage } = await import('./AcceptInvitePage.jsx');

const httpError = (status, code) =>
  Object.assign(new Error(`HTTP ${status}`), { response: { status, data: { code } } });

const Where = () => {
  const { pathname } = useLocation();

  return <p data-testid="where">{pathname}</p>;
};

const renderPage = () => {
  window.history.replaceState(null, '', '/auth/accept-invite?inviteToken=tok123');

  return renderWithProviders(
    <BrowserRouter>
      <Routes>
        <Route path="/auth/accept-invite" element={<AcceptInvitePage />} />
        <Route path="*" element={<Where />} />
      </Routes>
    </BrowserRouter>,
  );
};

const fillAndGetForm = async () => {
  const input = await screen.findByLabelText(/Contraseña/);
  fireEvent.change(input, { target: { value: 'Str0ngPassword' } });

  return input.closest('form');
};

describe('AcceptInvitePage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    apiClient.get.mockResolvedValue({
      data: { email: 'new@example.com', companyName: 'Acme', roleName: 'company_member' },
    });
  });

  it('sends one request when the form is submitted twice before re-rendering', async () => {
    apiClient.post.mockReturnValue(new Promise(() => {}));
    renderPage();

    const form = await fillAndGetForm();
    fireEvent.submit(form);
    fireEvent.submit(form);

    expect(apiClient.post).toHaveBeenCalledTimes(1);
    expect(apiClient.post).toHaveBeenCalledWith('/api/v1/auth/invite-accept', {
      inviteToken: 'tok123',
      password: 'Str0ngPassword',
    });
    expect(notifyError).not.toHaveBeenCalled();
  });

  it('shows a success notice and navigates to login on 201', async () => {
    apiClient.post.mockResolvedValue({ status: 201, data: {} });
    renderPage();

    fireEvent.submit(await fillAndGetForm());

    expect(await screen.findByTestId('where')).toHaveTextContent('/auth/login');
    expect(notifySuccess).toHaveBeenCalledTimes(1);
  });

  it('swaps to the inviter-invalid state on 400 INVITER_INVALID', async () => {
    apiClient.post.mockRejectedValue(httpError(400, 'INVITER_INVALID'));
    renderPage();

    fireEvent.submit(await fillAndGetForm());

    expect(await screen.findByText('Invitación no válida')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Crear cuenta y unirme' })).not.toBeInTheDocument();
  });

  it('allows a retry after a failed submit', async () => {
    apiClient.post.mockRejectedValueOnce(httpError(500)).mockReturnValue(new Promise(() => {}));
    renderPage();

    const form = await fillAndGetForm();
    fireEvent.submit(form);
    await waitFor(() => expect(notifyError).toHaveBeenCalledTimes(1));
    fireEvent.submit(form);

    expect(apiClient.post).toHaveBeenCalledTimes(2);
  });
});
