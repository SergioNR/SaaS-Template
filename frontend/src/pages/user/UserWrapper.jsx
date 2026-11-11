import { useNavigate } from 'react-router';
import { useState, useEffect, useRef, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import apiClient from '../../config/API/axiosConfig.js';
import { identifyUser } from '../../analytics/posthog.js';
import { IconHomeFilled, IconUserCircle, IconCreditCardFilled, IconUsersGroup } from '@tabler/icons-react';
import AreaShell from '../../components/partials/AreaShell.jsx';
import PageLoader from '../../components/PageLoader.jsx';
import SessionCheckError from '../../components/SessionCheckError.jsx';
import { SubscriptionProvider } from '../../contexts/SubscriptionContext.jsx';
import { currentPath, loginRedirectPath } from '../../utils/safeNext.js';
import { invalidateSessionCaches } from '../../utils/sessionCaches.js';

const UserWrapper = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [sessionUser, setSessionUser] = useState(null);
  //* GET /api/v1/user (email, created_at, last_login_at), loaded once per
  //* area mount and shared with every page through the outlet context
  const [user, setUser] = useState(null);
  const [userLoading, setUserLoading] = useState(true);
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

        setSessionUser(response.data.user);
        setLoading(false);
      } catch (err) {
        if (cancelled) {
          return;
        }

        //* Only a rejected session sends the user to login; a network/server
        //* error keeps them here with a retry
        if (err?.response?.status === 401) {
          //* The session probe sits under /api/v1/auth/, which the axios 401
          //* interceptor skips - clear per-session caches here before the
          //* client-side navigation (no reload) to login
          invalidateSessionCaches();
          navigateRef.current(loginRedirectPath(currentPath()), { replace: true });
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

  const userId = sessionUser?.id ?? null;

  //* The profile is secondary data - a failure leaves the pages' fallbacks
  //* ('—' dates, generic greeting) instead of blocking the area
  useEffect(() => {
    if (!userId) {
      return undefined;
    }

    const controller = new AbortController();

    setUserLoading(true);

    apiClient
      .get('/api/v1/user', { signal: controller.signal })
      .then((response) => setUser(response.data?.user ?? null))
      .catch(() => {
        if (!controller.signal.aborted) {
          setUser(null);
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setUserLoading(false);
        }
      });

    return () => controller.abort();
  }, [userId]);

  //* Only reaches PostHog once the visitor consented (analytics/posthog.js)
  useEffect(() => {
    if (userId) {
      identifyUser(userId);
    }
  }, [userId]);

  const links = useMemo(
    () => [
      { to: '/dashboard', label: t('nav.user.dashboard'), icon: IconHomeFilled },
      { to: '/user/profile', label: t('nav.user.profile'), icon: IconUserCircle },
      { to: '/user/billing', label: t('nav.user.plans'), icon: IconCreditCardFilled },
      { to: '/user/team', label: t('nav.user.team'), icon: IconUsersGroup },
    ],
    [t],
  );

  const outletContext = useMemo(() => ({ sessionUser, user, userLoading }), [sessionUser, user, userLoading]);

  //* Nothing (including SubscriptionProvider's billing fetch) mounts until the
  //* session check passes
  if (loading) {
    return <PageLoader />;
  }

  if (error) {
    return <SessionCheckError onRetry={() => setAttempt((n) => n + 1)} />;
  }

  //* Child pages read { sessionUser, user, userLoading } via useOutletContext()
  return (
    <SubscriptionProvider>
      <AreaShell homeTo="/dashboard" title={t('user.panelTitle')} links={links} outletContext={outletContext} />
    </SubscriptionProvider>
  );
};

export default UserWrapper;
