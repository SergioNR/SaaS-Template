import { Component } from 'react';
import { useLocation } from 'react-router';
import PropTypes from 'prop-types';
import { Button, Container, Stack, Text, Title } from '@mantine/core';
import { t } from 'i18next';
import { captureException } from '../analytics/posthog.js';
import { isChunkLoadError, reloadOnce } from '../utils/chunkReload.js';

export class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, chunkError: false };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, chunkError: isChunkLoadError(error) };
  }

  componentDidCatch(error, info) {
    //* A lazy route chunk from a previous deploy - reload once to pick up the
    //* new build instead of reporting it. If a reload already ran, the
    //* chunk is genuinely unreachable: report it and show the fallback
    if (isChunkLoadError(error) && reloadOnce()) {
      return;
    }

    //* No-op unless analytics is configured and the visitor consented
    captureException(error, { componentStack: info?.componentStack });
  }

  componentDidUpdate(prevProps) {
    if (this.state.hasError && prevProps.resetKey !== this.props.resetKey) {
      this.setState({ hasError: false, chunkError: false });
    }
  }

  render() {
    if (this.state.hasError) {
      const { chunkError } = this.state;

      return (
        <Container size="sm" py="xl">
          <Stack align="center" gap="sm" ta="center">
            <Title order={1}>{chunkError ? t('errorBoundary.chunkTitle') : t('errorBoundary.title')}</Title>
            <Text c="dimmed" maw={480}>
              {chunkError ? t('errorBoundary.chunkDescription') : t('errorBoundary.description')}
            </Text>
            <Button onClick={() => window.location.reload()}>{t('errorBoundary.reload')}</Button>
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
