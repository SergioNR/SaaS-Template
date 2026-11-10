import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { IconHome } from '@tabler/icons-react';
import { renderWithProviders } from '../../test/renderWithProviders.jsx';

vi.mock('../../config/API/axiosConfig.js', () => ({ default: { post: vi.fn() } }));

const posthogMock = vi.hoisted(() => ({
  analyticsEnabled: false,
  resetAnalyticsConsent: vi.fn(),
  resetAnalyticsUser: vi.fn(),
}));

//* `analyticsEnabled` is read at render time, so a getter lets each test flip it
vi.mock('../../analytics/posthog.js', () => ({
  get analyticsEnabled() {
    return posthogMock.analyticsEnabled;
  },
  resetAnalyticsConsent: posthogMock.resetAnalyticsConsent,
  resetAnalyticsUser: posthogMock.resetAnalyticsUser,
}));

const { default: AreaShell } = await import('./AreaShell.jsx');

const renderShell = () =>
  renderWithProviders(
    <MemoryRouter initialEntries={['/area']}>
      <Routes>
        <Route
          element={<AreaShell homeTo="/area" title="Area" links={[{ to: '/area', label: 'Inicio', icon: IconHome }]} />}
        >
          <Route path="/area" element={<h2>Contenido</h2>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );

describe('AreaShell cookie-preferences control', () => {
  afterEach(() => {
    posthogMock.analyticsEnabled = false;
    vi.clearAllMocks();
  });

  it('renders next to logout when analytics is configured and resets consent on click', () => {
    posthogMock.analyticsEnabled = true;

    renderShell();

    const control = screen.getByRole('button', { name: 'Preferencias de cookies' });
    expect(screen.getByRole('button', { name: 'Cerrar sesión' })).toBeInTheDocument();

    fireEvent.click(control);

    expect(posthogMock.resetAnalyticsConsent).toHaveBeenCalledTimes(1);
  });

  it('is absent when analytics is not configured', () => {
    renderShell();

    expect(screen.queryByRole('button', { name: 'Preferencias de cookies' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cerrar sesión' })).toBeInTheDocument();
  });
});
