import { useState } from 'react';
import { useNavigate } from 'react-router';
import { useTranslation } from 'react-i18next';
import { UnstyledButton } from '@mantine/core';
import apiClient from '../../config/API/axiosConfig.js';
import { resetAnalyticsUser } from '../../analytics/posthog.js';
import { IconLogout } from '@tabler/icons-react';
import classes from '../partials/AreaShell.module.css';
import { notifyError } from '../../utils/notifications.js';
import { logApiError } from '../../utils/logApiError.js';
import { invalidateSessionCaches } from '../../utils/sessionCaches.js';

export const LogOutButton = () => {
  const { t } = useTranslation();
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
      logApiError('Logout failed', error);
      notifyError(t('errors.logoutFailed'));
      setLoggingOut(false);
      return;
    }

    invalidateSessionCaches();
    // Clear the analytics identity so the next user on this browser is not linked
    resetAnalyticsUser();

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
