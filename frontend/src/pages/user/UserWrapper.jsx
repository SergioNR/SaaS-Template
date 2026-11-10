import { useNavigate } from 'react-router';
import { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import apiClient from '../../config/API/axiosConfig.js';
import { identifyUser } from '../../analytics/posthog.js';
import {
  IconHomeFilled,
  IconUserCircle,
  IconCreditCardFilled,
  IconUsersGroup
} from '@tabler/icons-react';
import AreaShell from '../../components/partials/AreaShell.jsx';
import PageLoader from '../../components/PageLoader.jsx';
import SessionCheckError from '../../components/SessionCheckError.jsx';
import { SubscriptionProvider } from '../../contexts/SubscriptionContext.jsx';

const UserWrapper = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [userId, setUserId] = useState(null);
  //* `navigate` changes identity on every pathname change; reading it through
  //* a ref keeps the session check from re-running (and unmounting the whole
  //* layout behind PageLoader) on each sidebar click
  const navigateRef = useRef(navigate);

  useEffect(() => {
    navigateRef.current = navigate;
  }, [navigate]);

  useEffect(() => {
    let cancelled = false;

    const checkSession = async () => {
      //* The first check starts with loading=true; only retries flip back
      if (attempt > 0) {
        setLoading(true);
      }
      setError(false);

      try {
        const response = await apiClient.get('/api/v1/auth/session');

        if (cancelled) {
          return;
        }

        //* Superadmins have no company - their area is /admin
        if (response.data?.user?.role === 'superadmin') {
          navigateRef.current('/admin', { replace: true });
          return;
        }

        setUserId(response.data.user.id);
        setLoading(false);
      } catch (err) {
        if (cancelled) {
          return;
        }

        //* Only a rejected session sends the user to login; a network/server
        //* error keeps them here with a retry
        if (err?.response?.status === 401) {
          navigateRef.current('/auth/login', { replace: true });
        } else {
          setError(true);
          setLoading(false);
        }
      }
    };

    checkSession();

    return () => {
      cancelled = true;
    };
  }, [attempt]);

  //* Only reaches PostHog once the visitor consented (analytics/posthog.js)
  useEffect(() => {
    if (userId) {
      identifyUser(userId);
    }
  }, [userId]);

  const links = [
    { to: '/dashboard', label: t('nav.user.dashboard'), icon: IconHomeFilled },
    { to: '/user/profile', label: t('nav.user.profile'), icon: IconUserCircle },
    { to: '/user/billing', label: t('nav.user.plans'), icon: IconCreditCardFilled },
    { to: '/user/team', label: t('nav.user.team'), icon: IconUsersGroup },
  ];

  //* Nothing (including SubscriptionProvider's billing fetch) mounts until the
  //* session check passes
  if (loading) {
    return <PageLoader />;
  }

  if (error) {
    return <SessionCheckError onRetry={() => setAttempt((n) => n + 1)} />;
  }

  return (
    <SubscriptionProvider>
      <AreaShell homeTo="/dashboard" title={t('user.panelTitle')} links={links} />
    </SubscriptionProvider>
  );
};

export default UserWrapper;
