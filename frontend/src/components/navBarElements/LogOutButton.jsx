import { useState } from 'react';
import { useNavigate } from 'react-router';
import { useTranslation } from 'react-i18next';
import { UnstyledButton } from '@mantine/core';
import apiClient from '../../config/API/axiosConfig.js';
import { usePostHog } from 'posthog-js/react';
import { IconLogout } from '@tabler/icons-react';
import classes from '../partials/AreaShell.module.css';
import { notifyError } from '../../utils/notifications.js';

const analyticsEnabled = Boolean(import.meta.env.VITE_PUBLIC_POSTHOG_KEY);

const LogOutButton = () => {
  const { t } = useTranslation();
  const posthog = usePostHog();
  const navigate = useNavigate();
  //* Blocks double submits while the logout POST is in flight
  const [loggingOut, setLoggingOut] = useState(false);

  const handleLogout = async () => {
    if (loggingOut) {
      return;
    }

    setLoggingOut(true);

    try {
      await apiClient.post('/api/v1/auth/logout');
    } catch (error) {
      //* The session is still alive server-side - stay put so the user can retry
      console.error('Logout failed:', error);
      notifyError(t('errors.logoutFailed'));
      setLoggingOut(false);
      return;
    }

    // Reset PostHog to clear user session and prevent tracking continuity
    if (analyticsEnabled) {
      posthog?.reset();
    }

    navigate('/');
  };

  return (
    <UnstyledButton
      type="button"
      className={classes.link}
      onClick={handleLogout}
      disabled={loggingOut}
      aria-busy={loggingOut}
    >
      <IconLogout className={classes.linkIcon} stroke={1.5} />
      <span>{t('nav.logout')}</span>
    </UnstyledButton>
  );
};

export default LogOutButton;
