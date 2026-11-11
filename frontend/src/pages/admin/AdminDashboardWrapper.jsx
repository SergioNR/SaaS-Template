import { useNavigate } from 'react-router';
import { useState, useEffect, useRef, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { IconLayoutDashboard, IconUsers, IconBuilding, IconUserCircle } from '@tabler/icons-react';
import apiClient from '../../config/API/axiosConfig.js';
import { identifyUser } from '../../analytics/posthog.js';
import PageLoader from '../../components/PageLoader.jsx';
import SessionCheckError from '../../components/SessionCheckError.jsx';
import AreaShell from '../../components/partials/AreaShell.jsx';
import { currentPath, loginRedirectPath } from '../../utils/safeNext.js';
import { invalidateSessionCaches } from '../../utils/sessionCaches.js';

export const AdminDashboardWrapper = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [sessionUser, setSessionUser] = useState(null);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  //* `navigate` changes identity on every pathname change; reading it through
  //* a ref keeps the session check from re-running on each admin navigation
  const navigateRef = useRef(navigate);

  useEffect(() => {
    navigateRef.current = navigate;
  }, [navigate]);

  useEffect(() => {
    let cancelled = false;

    const checkAuth = async () => {
      setError(false);

      try {
        const response = await apiClient.get('/api/v1/auth/session');

        if (cancelled) {
          return;
        }

        if (response.data?.user?.role === 'superadmin') {
          setSessionUser(response.data.user);
        } else {
          navigateRef.current('/dashboard', { replace: true });
        }
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
        }
      }
    };

    checkAuth();

    return () => {
      cancelled = true;
    };
  }, [attempt]);

  const sessionUserId = sessionUser?.id ?? null;

  //* Only reaches PostHog once the visitor consented (analytics/posthog.js);
  //* remembered so consent given later still identifies the admin
  useEffect(() => {
    if (sessionUserId) {
      identifyUser(sessionUserId);
    }
  }, [sessionUserId]);

  const links = useMemo(
    () => [
      { to: '/admin', label: t('admin.nav.overview'), icon: IconLayoutDashboard, end: true },
      { to: '/admin/users', label: t('admin.nav.users'), icon: IconUsers },
      { to: '/admin/companies', label: t('admin.nav.companies'), icon: IconBuilding },
      { to: '/admin/account', label: t('admin.nav.account'), icon: IconUserCircle },
    ],
    [t],
  );

  const outletContext = useMemo(() => ({ sessionUser }), [sessionUser]);

  if (error) {
    return <SessionCheckError onRetry={() => setAttempt((n) => n + 1)} />;
  }

  if (!sessionUser) {
    return <PageLoader />;
  }

  //* Child pages read the signed-in admin via useOutletContext()
  return <AreaShell homeTo="/admin" title={t('admin.areaTitle')} links={links} outletContext={outletContext} />;
};

export default AdminDashboardWrapper;
