import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { renderWithProviders } from '../../test/renderWithProviders.jsx';

vi.mock('../../config/API/axiosConfig.js', () => ({ default: { delete: vi.fn() } }));
vi.mock('../../utils/notifications.js', () => ({ notifySuccess: vi.fn(), notifyError: vi.fn() }));
vi.mock('../../utils/sessionCaches.js', () => ({ invalidateSessionCaches: vi.fn() }));
vi.mock('../../analytics/posthog.js', () => ({ resetAnalyticsUser: vi.fn() }));

const { default: apiClient } = await import('../../config/API/axiosConfig.js');
const { notifyError, notifySuccess } = await import('../../utils/notifications.js');
const { invalidateSessionCaches } = await import('../../utils/sessionCaches.js');
const { resetAnalyticsUser } = await import('../../analytics/posthog.js');
const { AccountActionsForm } = await import('./AccountActionsForm.jsx');
const { deletionErrorKey } = await import('./accountDeletion.js');

const httpError = (status, code) =>
  Object.assign(new Error(`HTTP ${status}`), { response: { status, data: { code } } });

const Where = () => {
  const { pathname } = useLocation();

  return <p data-testid="where">{pathname}</p>;
};

const renderForm = (variant) =>
  renderWithProviders(
    <MemoryRouter initialEntries={['/admin/account']}>
      <Routes>
        <Route path="/admin/account" element={<AccountActionsForm variant={variant} />} />
        <Route path="*" element={<Where />} />
      </Routes>
    </MemoryRouter>,
  );

const confirmDeletion = async () => {
  fireEvent.click(screen.getByRole('button', { name: 'Eliminar mi cuenta' }));
  const dialog = await screen.findByRole('dialog');
  const buttons = dialog.querySelectorAll('button');
  fireEvent.click([...buttons].find((button) => button.textContent === 'Eliminar mi cuenta'));
};

describe('deletionErrorKey', () => {
  it.each([
    [httpError(409, 'USER_LAST_COMPANY_OWNER'), 'user.accountActions.deleteLastOwner'],
    [httpError(409, 'LAST_SUPERADMIN'), 'user.accountActions.deleteLastSuperadmin'],
    [httpError(409, 'SOMETHING_ELSE'), 'user.accountActions.deleteError'],
    [httpError(500), 'user.accountActions.deleteError'],
    [new Error('Network Error'), 'user.accountActions.deleteError'],
  ])('maps %o', (err, key) => {
    expect(deletionErrorKey(err)).toBe(key);
  });
});

describe('AccountActionsForm', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('clears caches and analytics identity and lands on / after deletion', async () => {
    apiClient.delete.mockResolvedValue({ status: 200, data: {} });
    renderForm('user');

    await confirmDeletion();

    expect(await screen.findByTestId('where')).toHaveTextContent(/^\/$/);
    expect(apiClient.delete).toHaveBeenCalledWith('/api/v1/user');
    expect(invalidateSessionCaches).toHaveBeenCalledTimes(1);
    expect(resetAnalyticsUser).toHaveBeenCalledTimes(1);
    expect(notifySuccess).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['USER_LAST_COMPANY_OWNER', /único propietario de la empresa/],
    ['LAST_SUPERADMIN', /único superadministrador de la plataforma/],
  ])('keeps the user signed in on 409 %s with its own message', async (code, message) => {
    apiClient.delete.mockRejectedValue(httpError(409, code));
    renderForm('superadmin');

    await confirmDeletion();

    await waitFor(() => expect(notifyError).toHaveBeenCalledWith(expect.stringMatching(message)));
    expect(invalidateSessionCaches).not.toHaveBeenCalled();
    expect(resetAnalyticsUser).not.toHaveBeenCalled();
    expect(screen.queryByTestId('where')).not.toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('shows the generic message for other failures', async () => {
    apiClient.delete.mockRejectedValue(httpError(500));
    renderForm('user');

    await confirmDeletion();

    await waitFor(() =>
      expect(notifyError).toHaveBeenCalledWith('No se pudo eliminar tu cuenta. Por favor, inténtalo de nuevo.'),
    );
  });

  it('uses the superadmin wording and warning in the superadmin variant', async () => {
    renderForm('superadmin');

    expect(screen.getByText(/Elimina tu cuenta de superadministrador/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Eliminar mi cuenta' }));

    expect(await screen.findByText(/Perderás inmediatamente el acceso/)).toBeInTheDocument();
  });
});
