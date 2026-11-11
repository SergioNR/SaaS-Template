import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { renderWithProviders } from '../../test/renderWithProviders.jsx';

vi.mock('../../config/API/axiosConfig.js', () => ({ default: { get: vi.fn(), post: vi.fn() } }));

const { default: apiClient } = await import('../../config/API/axiosConfig.js');
const { SubscriptionProvider } = await import('../../contexts/SubscriptionContext.jsx');
const { invalidateCompanyPermissionsCache } = await import('../../hooks/useCompanyPermissions.js');
const { default: UserBilling } = await import('./UserBilling.jsx');

const failure = (status, code) => Object.assign(new Error('request failed'), { response: { status, data: { code } } });

//* GET /api/v1/team feeds the permission hook; GET /api/v1/billing the page
const mockApi = (billingResponses) => {
  const queue = [...billingResponses];

  apiClient.get.mockImplementation((url) => {
    if (url === '/api/v1/team') {
      return Promise.resolve({ data: { callerPermissions: ['billing.manage'] } });
    }

    const next = queue.length > 1 ? queue.shift() : queue[0];

    return next instanceof Error ? Promise.reject(next) : Promise.resolve(next);
  });
};

const renderBilling = () =>
  renderWithProviders(
    <MemoryRouter initialEntries={['/user/billing']}>
      <SubscriptionProvider>
        <UserBilling />
      </SubscriptionProvider>
    </MemoryRouter>,
  );

const billingCalls = () => apiClient.get.mock.calls.filter(([url]) => url === '/api/v1/billing');

describe('UserBilling load errors', () => {
  beforeEach(() => {
    apiClient.get.mockReset();
    invalidateCompanyPermissionsCache();
  });

  it('offers a retry on a transient load failure that re-fetches the status', async () => {
    mockApi([
      failure(500),
      {
        data: {
          subscriptionData: {
            status: 'paid',
            is_paid: true,
            has_billing_id: true,
            created_at: '2026-01-01T00:00:00Z',
            expires_at: '2999-01-01T00:00:00Z',
          },
        },
      },
    ]);

    renderBilling();

    expect(await screen.findByText('No se pudo obtener la información de la suscripción')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));

    expect(await screen.findByText('Activa')).toBeInTheDocument();
    expect(billingCalls()).toHaveLength(2);
  });

  it('shows the membership error without a retry', async () => {
    mockApi([failure(403, 'COMPANY_MEMBERSHIP_REQUIRED')]);

    renderBilling();

    expect(await screen.findByText(/no pertenece a ninguna empresa/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Reintentar' })).not.toBeInTheDocument();
  });
});
