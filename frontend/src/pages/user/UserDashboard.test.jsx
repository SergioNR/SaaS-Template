import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Outlet, Route, Routes } from 'react-router';
import { renderWithProviders } from '../../test/renderWithProviders.jsx';

vi.mock('../../config/API/axiosConfig.js', () => ({ default: { get: vi.fn() } }));

const { default: apiClient } = await import('../../config/API/axiosConfig.js');
const { SubscriptionProvider } = await import('../../contexts/SubscriptionContext.jsx');
const { default: UserDashboard } = await import('./UserDashboard.jsx');

const user = { email: 'owner@acme.test', created_at: '2026-01-01T00:00:00Z', last_login_at: null };

const renderDashboard = () =>
  renderWithProviders(
    <MemoryRouter initialEntries={['/dashboard']}>
      <Routes>
        <Route element={<Outlet context={{ user, userLoading: false }} />}>
          <Route
            path="/dashboard"
            element={
              <SubscriptionProvider>
                <UserDashboard />
              </SubscriptionProvider>
            }
          />
        </Route>
      </Routes>
    </MemoryRouter>,
  );

const failure = (status, code) => Object.assign(new Error('request failed'), { response: { status, data: { code } } });

describe('UserDashboard subscription load states', () => {
  beforeEach(() => {
    apiClient.get.mockReset();
  });

  it('shows an unknown state with a retry on a 5xx - no inactive badge, banner or choose-a-plan prompt', async () => {
    apiClient.get.mockRejectedValue(failure(500));

    renderDashboard();

    expect(await screen.findByRole('button', { name: 'Reintentar' })).toBeInTheDocument();
    expect(screen.getAllByText('Desconocido').length).toBeGreaterThan(0);
    expect(screen.queryByText('Inactiva')).not.toBeInTheDocument();
    expect(screen.queryByText('Suscripción inactiva')).not.toBeInTheDocument();
    expect(screen.queryByText(/Elige tu plan aquí/)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Ver planes disponibles' })).not.toBeInTheDocument();
  });

  it('retries the subscription load and then renders the real status', async () => {
    apiClient.get.mockRejectedValueOnce(failure(503)).mockResolvedValueOnce({
      data: {
        subscriptionData: {
          status: 'trial',
          is_paid: false,
          created_at: '2026-01-01T00:00:00Z',
          expires_at: '2999-01-01T00:00:00Z',
        },
      },
    });

    renderDashboard();

    fireEvent.click(await screen.findByRole('button', { name: 'Reintentar' }));

    expect(await screen.findAllByText('Prueba gratuita')).not.toHaveLength(0);
    expect(apiClient.get).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole('button', { name: 'Reintentar' })).not.toBeInTheDocument();
  });

  it('keeps the inactive state, banner and choose-a-plan note for a company without a subscription (404)', async () => {
    apiClient.get.mockRejectedValue(failure(404));

    renderDashboard();

    expect(await screen.findByText('Suscripción inactiva')).toBeInTheDocument();
    expect(screen.getAllByText('Inactiva').length).toBeGreaterThan(0);
    expect(screen.getByText(/Elige tu plan aquí/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Reintentar' })).not.toBeInTheDocument();
  });

  it('shows the membership message without a retry on 403 COMPANY_MEMBERSHIP_REQUIRED', async () => {
    apiClient.get.mockRejectedValue(failure(403, 'COMPANY_MEMBERSHIP_REQUIRED'));

    renderDashboard();

    expect(await screen.findByText(/no pertenece a ninguna empresa/)).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: 'Reintentar' })).not.toBeInTheDocument();
    });
    expect(screen.queryByText(/Elige tu plan aquí/)).not.toBeInTheDocument();
  });
});
