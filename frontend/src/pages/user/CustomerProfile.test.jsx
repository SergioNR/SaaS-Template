import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { MemoryRouter, Outlet, Route, Routes } from 'react-router';
import { renderWithProviders } from '../../test/renderWithProviders.jsx';

vi.mock('../../config/API/axiosConfig.js', () => ({ default: { patch: vi.fn(), delete: vi.fn() } }));
vi.mock('../../utils/notifications.js', () => ({ notifySuccess: vi.fn(), notifyError: vi.fn() }));

const { default: CustomerProfile } = await import('./CustomerProfile.jsx');

//* Stands in for UserWrapper's outlet context
const UserLayout = () => <Outlet context={{ user: { email: 'user@example.com' }, userLoading: false }} />;

describe('CustomerProfile', () => {
  it('starts with the page heading so RouteFocus can focus it', () => {
    renderWithProviders(
      <MemoryRouter initialEntries={['/user/profile']}>
        <Routes>
          <Route element={<UserLayout />}>
            <Route path="/user/profile" element={<CustomerProfile />} />
          </Route>
        </Routes>
      </MemoryRouter>,
    );

    const headings = screen.getAllByRole('heading');

    expect(headings[0]).toHaveTextContent('Mi perfil');
    expect(screen.getByRole('heading', { level: 2, name: 'Mi perfil' })).toBeInTheDocument();
  });
});
