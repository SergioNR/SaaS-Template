import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Outlet, Route, Routes } from 'react-router';
import { renderWithProviders } from '../../test/renderWithProviders.jsx';

vi.mock('../../config/API/axiosConfig.js', () => ({ default: { get: vi.fn(), delete: vi.fn() } }));
vi.mock('../../utils/notifications.js', () => ({ notifySuccess: vi.fn(), notifyError: vi.fn() }));

const { default: apiClient } = await import('../../config/API/axiosConfig.js');
const { notifyError } = await import('../../utils/notifications.js');
const { default: AdminUsersList } = await import('./AdminUsersList.jsx');

const httpError = (status, code) =>
  Object.assign(new Error(`HTTP ${status}`), { response: { status, data: { code } } });

const users = [
  { id: 'a1', email: 'me@example.com', role: 'superadmin', created_at: '2026-01-01T00:00:00.000Z' },
  { id: 'a2', email: 'other-admin@example.com', role: 'superadmin', created_at: '2026-01-02T00:00:00.000Z' },
];

const AdminLayout = () => <Outlet context={{ sessionUser: { id: 'a1', role: 'superadmin' } }} />;

const renderList = () =>
  renderWithProviders(
    <MemoryRouter initialEntries={['/admin/users']}>
      <Routes>
        <Route path="/admin" element={<AdminLayout />}>
          <Route path="users" element={<AdminUsersList />} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );

const deleteOtherAdmin = async () => {
  fireEvent.click(await screen.findByRole('button', { name: 'Eliminar a other-admin@example.com' }));
  const dialog = await screen.findByRole('dialog');
  fireEvent.click(within(dialog).getByRole('button', { name: 'Eliminar' }));
};

describe('AdminUsersList deletion feedback', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    apiClient.get.mockResolvedValue({ data: { users, userCount: users.length, nextCursor: null } });
  });

  it('locks the delete action on the signed-in admin row with a tooltip pointing to the account page', async () => {
    renderList();

    const own = await screen.findByRole('button', { name: 'Eliminar a me@example.com' });

    expect(own).toBeDisabled();
    //* LockedTooltip wires the label through aria-describedby on its wrapper
    const wrapper = own.closest('[aria-describedby]');
    const description = document.getElementById(wrapper.getAttribute('aria-describedby'));
    expect(description).toHaveTextContent('«Mi cuenta»');
  });

  it.each([
    [httpError(409, 'LAST_SUPERADMIN'), 'Es el único superadministrador de la plataforma'],
    [httpError(409, 'LAST_COMPANY_OWNER'), 'Este usuario es el único propietario de su empresa'],
    [httpError(409, 'OTHER'), 'No se puede eliminar esta cuenta desde aquí'],
    [httpError(404), 'El usuario ya no existe.'],
  ])('maps %o to its own message', async (err, message) => {
    apiClient.delete.mockRejectedValue(err);
    renderList();

    await deleteOtherAdmin();

    await waitFor(() => expect(notifyError).toHaveBeenCalledWith(expect.stringContaining(message)));
  });
});
