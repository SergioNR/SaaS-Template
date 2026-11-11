import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { renderWithProviders } from '../../test/renderWithProviders.jsx';

vi.mock('../../config/API/axiosConfig.js', () => ({ default: { get: vi.fn(), post: vi.fn() } }));
vi.mock('../../utils/notifications.js', () => ({ notifySuccess: vi.fn(), notifyError: vi.fn(), notifyInfo: vi.fn() }));

const { default: apiClient } = await import('../../config/API/axiosConfig.js');
const { notifyError } = await import('../../utils/notifications.js');
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

const INACTIVE = { data: { subscriptionData: { status: 'inactive', has_billing_id: false, expires_at: null } } };
const PAGE_HEADING = { level: 2, name: 'Facturación' };

describe('UserBilling heading', () => {
  beforeEach(() => {
    apiClient.get.mockReset();
    invalidateCompanyPermissionsCache();
  });

  it('starts the loading state with the page heading', () => {
    apiClient.get.mockImplementation(() => new Promise(() => {}));

    renderBilling();

    expect(screen.getByRole('heading', PAGE_HEADING)).toBeInTheDocument();
  });

  it('starts the error state with the page heading', async () => {
    mockApi([failure(500)]);

    renderBilling();

    expect(await screen.findByText('No se pudo obtener la información de la suscripción')).toBeInTheDocument();
    expect(screen.getByRole('heading', PAGE_HEADING)).toBeInTheDocument();
  });

  it('starts the loaded page with the page heading', async () => {
    mockApi([INACTIVE]);

    renderBilling();

    expect(await screen.findByText('Inactiva')).toBeInTheDocument();
    expect(screen.getByRole('heading', PAGE_HEADING)).toBeInTheDocument();
  });
});

describe('UserBilling checkout errors', () => {
  beforeEach(() => {
    apiClient.get.mockReset();
    apiClient.post.mockReset();
    notifyError.mockReset();
    invalidateCompanyPermissionsCache();
  });

  it('tells the user a checkout is already in progress on a 409 CHECKOUT_IN_PROGRESS', async () => {
    mockApi([INACTIVE]);
    apiClient.post.mockRejectedValue(failure(409, 'CHECKOUT_IN_PROGRESS'));

    renderBilling();

    fireEvent.click(await screen.findByRole('button', { name: 'Elegir mensual' }));

    await waitFor(() =>
      expect(notifyError).toHaveBeenCalledWith('Ya hay un pago en curso. Espera unos segundos e inténtalo de nuevo.'),
    );
    expect(apiClient.post).toHaveBeenCalledWith('/api/v1/billing/checkout-session', {
      planName: expect.any(String),
      planBillingCycle: 'monthly',
    });
  });

  it('keeps the generic invalid message for other 409 codes', async () => {
    mockApi([INACTIVE]);
    apiClient.post.mockRejectedValue(failure(409, 'SOMETHING_ELSE'));

    renderBilling();

    fireEvent.click(await screen.findByRole('button', { name: 'Elegir mensual' }));

    await waitFor(() =>
      expect(notifyError).toHaveBeenCalledWith(
        'Los datos de la solicitud no son válidos. Por favor, inténtalo de nuevo.',
      ),
    );
  });
});
