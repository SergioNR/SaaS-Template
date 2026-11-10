import { Component } from 'react';
import { useLocation } from 'react-router';
import PropTypes from 'prop-types';
import { Button, Container, Stack, Text, Title } from '@mantine/core';
import { t } from 'i18next';
import { captureException } from '../analytics/posthog.js';

export class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, info) {
    //* No-op unless analytics is configured and the visitor consented
    captureException(error, { componentStack: info?.componentStack });
  }

  componentDidUpdate(prevProps) {
    if (this.state.hasError && prevProps.resetKey !== this.props.resetKey) {
      this.setState({ hasError: false });
    }
  }

  render() {
    if (this.state.hasError) {
      return (
        <Container size="sm" py="xl">
          <Stack align="center" gap="sm" ta="center">
            <Title order={1}>{t('errorBoundary.title')}</Title>
            <Text c="dimmed" maw={480}>
              {t('errorBoundary.description')}
            </Text>
            <Button onClick={() => window.location.reload()}>
              {t('errorBoundary.reload')}
            </Button>
          </Stack>
        </Container>
      );
    }

    return this.props.children;
  }
}

ErrorBoundary.propTypes = {
  resetKey: PropTypes.string,
  children: PropTypes.node,
};

export const RoutedErrorBoundary = ({ children }) => {
  const { pathname } = useLocation();
  return <ErrorBoundary resetKey={pathname}>{children}</ErrorBoundary>;
};

RoutedErrorBoundary.propTypes = {
  children: PropTypes.node,
};

export default ErrorBoundary;
