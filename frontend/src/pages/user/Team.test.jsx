import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { BrowserRouter } from 'react-router';
import { renderWithProviders } from '../../test/renderWithProviders.jsx';

vi.mock('../../config/API/axiosConfig.js', () => ({
  default: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() },
}));
vi.mock('../../utils/notifications.js', () => ({ notifySuccess: vi.fn(), notifyError: vi.fn() }));

const { default: apiClient } = await import('../../config/API/axiosConfig.js');
const { default: Team } = await import('./Team.jsx');

const teamPayload = {
  members: [
    {
      id: 'u1',
      email: 'owner@example.com',
      companyRoles: ['company_owner'],
      created_at: '2026-01-01T00:00:00.000Z',
      manageable: false,
    },
  ],
  invites: [
    {
      id: 'i1',
      email: 'pending@example.com',
      role: 'company_member',
      //* Already in the past - the page must not badge it as expired
      token_expires: '2020-01-01T00:00:00.000Z',
      manageable: true,
    },
  ],
  callerPermissions: ['team.invite', 'team.remove', 'team.manage_roles'],
  assignableRoles: ['company_admin', 'company_member'],
  callerId: 'u1',
};

const renderTeam = () =>
  renderWithProviders(
    <BrowserRouter>
      <Team />
    </BrowserRouter>,
  );

const openInviteModal = async () => {
  const button = await screen.findByRole('button', { name: 'Invitar al equipo' });
  await waitFor(() => expect(button).toBeEnabled());
  fireEvent.click(button);

  return screen.findByRole('dialog');
};

describe('Team invite modal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    apiClient.get.mockResolvedValue({ data: teamPayload });
  });

  it('shows the role error when submitted without a role', async () => {
    renderTeam();

    const dialog = await openInviteModal();
    fireEvent.change(within(dialog).getByLabelText(/^Email/), { target: { value: 'new@example.com' } });
    fireEvent.submit(
      within(dialog)
        .getByLabelText(/^Email/)
        .closest('form'),
    );

    expect(await within(dialog).findByText('Selecciona un rol para la invitación')).toBeInTheDocument();
    expect(apiClient.post).not.toHaveBeenCalled();
  });

  it('clears the role error after Cancel and reopen', async () => {
    renderTeam();

    let dialog = await openInviteModal();
    fireEvent.submit(
      within(dialog)
        .getByLabelText(/^Email/)
        .closest('form'),
    );
    await within(dialog).findByText('Selecciona un rol para la invitación');

    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancelar' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

    dialog = await openInviteModal();

    expect(within(dialog).queryByText('Selecciona un rol para la invitación')).not.toBeInTheDocument();
  });

  it('renders invite rows without an expired badge', async () => {
    renderTeam();

    const row = (await screen.findByText('pending@example.com')).closest('tr');

    expect(within(row).queryByText('Caducada')).not.toBeInTheDocument();
  });
});
