import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { BrowserRouter, Route, Routes, useLocation, useOutletContext } from 'react-router';
import { renderWithProviders } from '../test/renderWithProviders.jsx';

vi.mock('../config/API/axiosConfig.js', () => ({ default: { get: vi.fn(), post: vi.fn() } }));

const { default: apiClient } = await import('../config/API/axiosConfig.js');
const { default: UserWrapper } = await import('./user/UserWrapper.jsx');
const { default: AdminDashboardWrapper } = await import('./admin/AdminDashboardWrapper.jsx');

const httpError = (status) => Object.assign(new Error(`HTTP ${status}`), { response: { status } });

//* Routes the API mock by URL; `session` is the /api/v1/auth/session outcome
const mockApi = ({ session }) => {
  apiClient.get.mockImplementation((url) => {
    if (url === '/api/v1/auth/session') {
      return session instanceof Error ? Promise.reject(session) : Promise.resolve({ data: { user: session } });
    }

    if (url === '/api/v1/user') {
      return Promise.resolve({ data: { user: { email: 'user@example.com' } } });
    }

    if (url === '/api/v1/billing') {
      return Promise.resolve({ data: { subscriptionData: null } });
    }

    return Promise.reject(httpError(404));
  });
};

const Where = ({ label }) => {
  const { pathname, search } = useLocation();

  return <p data-testid="where">{`${label} ${pathname}${search}`}</p>;
};

const UserPage = () => {
  const { sessionUser } = useOutletContext();

  return <p data-testid="where">{`user-page ${sessionUser.id}`}</p>;
};

const AdminPage = () => {
  const { sessionUser } = useOutletContext();

  return <p data-testid="where">{`admin-page ${sessionUser.id}`}</p>;
};

const renderAt = (path) => {
  window.history.replaceState(null, '', path);

  return renderWithProviders(
    <BrowserRouter>
      <Routes>
        <Route element={<UserWrapper />}>
          <Route path="dashboard" element={<UserPage />} />
          <Route path="user/team" element={<UserPage />} />
        </Route>
        <Route path="/admin" element={<AdminDashboardWrapper />}>
          <Route index element={<AdminPage />} />
          <Route path="users" element={<AdminPage />} />
        </Route>
        <Route path="/auth/login" element={<Where label="login" />} />
      </Routes>
    </BrowserRouter>,
  );
};

describe('UserWrapper guard', () => {
  beforeEach(() => {
    apiClient.get.mockReset();
  });

  it('renders the page for a signed-in user and shares the session user', async () => {
    mockApi({ session: { id: 'u1', role: 'user' } });

    renderAt('/dashboard');

    expect(await screen.findByText('user-page u1')).toBeInTheDocument();
  });

  it('sends an expired session to login with next=<path>', async () => {
    mockApi({ session: httpError(401) });

    renderAt('/user/team');

    expect(await screen.findByTestId('where')).toHaveTextContent(
      `login /auth/login?next=${encodeURIComponent('/user/team')}`,
    );
  });

  it('sends superadmins to /admin', async () => {
    mockApi({ session: { id: 'a1', role: 'superadmin' } });

    renderAt('/dashboard');

    expect(await screen.findByText('admin-page a1')).toBeInTheDocument();
  });

  it('keeps the user on the page with a retry when the check fails for another reason', async () => {
    mockApi({ session: httpError(503) });

    renderAt('/dashboard');

    expect(await screen.findByRole('button', { name: 'Reintentar' })).toBeInTheDocument();
    expect(window.location.pathname).toBe('/dashboard');
  });
});

describe('AdminDashboardWrapper guard', () => {
  beforeEach(() => {
    apiClient.get.mockReset();
  });

  it('renders admin pages for a superadmin', async () => {
    mockApi({ session: { id: 'a1', role: 'superadmin' } });

    renderAt('/admin/users');

    expect(await screen.findByText('admin-page a1')).toBeInTheDocument();
  });

  it('sends regular users to /dashboard', async () => {
    mockApi({ session: { id: 'u1', role: 'user' } });

    renderAt('/admin');

    expect(await screen.findByText('user-page u1')).toBeInTheDocument();
  });

  it('sends an expired session to login with next=<path>', async () => {
    mockApi({ session: httpError(401) });

    renderAt('/admin/users');

    expect(await screen.findByTestId('where')).toHaveTextContent(
      `login /auth/login?next=${encodeURIComponent('/admin/users')}`,
    );
  });
});
