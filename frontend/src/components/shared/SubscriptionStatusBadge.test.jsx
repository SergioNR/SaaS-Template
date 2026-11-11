import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '../../test/renderWithProviders.jsx';
import { SubscriptionStatusBadge } from './SubscriptionStatusBadge.jsx';

describe('SubscriptionStatusBadge', () => {
  it.each([
    ['paid', 'Activa'],
    ['trial', 'Prueba gratuita'],
    ['inactive', 'Inactiva'],
  ])('labels the server status %s as %s', (status, label) => {
    renderWithProviders(<SubscriptionStatusBadge subscription={{ status }} />);

    expect(screen.getByText(label)).toBeInTheDocument();
  });

  it('shows a missing subscription as inactive', () => {
    renderWithProviders(<SubscriptionStatusBadge subscription={null} />);

    expect(screen.getByText('Inactiva')).toBeInTheDocument();
  });
});
