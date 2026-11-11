import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen } from '@testing-library/react';
import { BrowserRouter } from 'react-router';
import { renderWithProviders } from '../../test/renderWithProviders.jsx';

vi.mock('../../config/API/axiosConfig.js', () => ({ default: { post: vi.fn() } }));

const { default: apiClient } = await import('../../config/API/axiosConfig.js');
const { default: CustomerRegistrationForm } = await import('./CustomerRegistrationForm.jsx');

const httpError = (status) => Object.assign(new Error(`HTTP ${status}`), { response: { status } });

const renderAndSubmit = () => {
  renderWithProviders(
    <BrowserRouter>
      <CustomerRegistrationForm />
    </BrowserRouter>,
  );

  fireEvent.change(screen.getByLabelText(/Correo electrónico/), { target: { value: 'owner@example.com' } });
  fireEvent.change(screen.getByLabelText(/Nombre de la empresa/), { target: { value: 'Acme' } });
  fireEvent.change(screen.getByLabelText(/^Contraseña/), { target: { value: 'Str0ngPassword' } });
  fireEvent.click(screen.getByRole('button', { name: 'Crear cuenta' }));
};

describe('CustomerRegistrationForm', () => {
  beforeEach(() => {
    apiClient.post.mockReset();
  });

  it('sends the form values read through form.elements', async () => {
    apiClient.post.mockResolvedValue({ status: 201, data: {} });

    renderAndSubmit();

    expect(apiClient.post).toHaveBeenCalledWith('/api/v1/auth/register', {
      username: 'owner@example.com',
      companyName: 'Acme',
      password: 'Str0ngPassword',
    });
    expect(await screen.findByText(/Te hemos enviado un correo para confirmar tu dirección/)).toBeInTheDocument();
  });

  it.each([
    [422, 'Por favor, proporcione un correo electrónico, nombre de empresa y contraseña válidos'],
    [429, 'Demasiados intentos. Espera unos minutos e inténtalo de nuevo.'],
    [500, 'Error interno, por favor intentálo en unos minutos'],
  ])('maps a %i to its message', async (status, message) => {
    apiClient.post.mockRejectedValue(httpError(status));

    renderAndSubmit();

    expect(await screen.findByText(message)).toBeInTheDocument();
  });
});
