import { render } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { theme } from '../theme/theme.js';

//* Mantine components need their provider; routing is left to each test
export const renderWithProviders = (ui) => render(<MantineProvider theme={theme}>{ui}</MantineProvider>);

export default renderWithProviders;
