import { StrictMode, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router';
import { MantineProvider } from '@mantine/core';
import '@mantine/core/styles.css';
import { Notifications } from '@mantine/notifications';
import '@mantine/notifications/styles.css';
//* Self-hosted (CSP font-src 'self') - see src/theme/theme.js
import '@fontsource/inter/400.css';
import '@fontsource/inter/500.css';
import '@fontsource/inter/600.css';
import '@fontsource/inter/700.css';
import { theme } from './theme/theme.js';
import './index.css';
import './i18n/index.js';
import IndexWrapper from './pages/index/IndexWrapper.jsx';
import Homepage from './pages/index/Homepage.jsx';
import AuthWrapper from './pages/auth/AuthWrapper.jsx';
import Login from './pages/auth/LoginPage.jsx';
import PageLoader from './components/PageLoader.jsx';
import { RoutedErrorBoundary } from './components/ErrorBoundary.jsx';
import { ConsentBanner } from './components/ConsentBanner.jsx';
import { RouteFocus } from './components/RouteFocus.jsx';
import { scheduleAnalytics } from './analytics/posthog.js';
import { installPreloadErrorHandler } from './utils/chunkReload.js';
import {
  PricingPage,
  FAQPage,
  TerminosCondiciones,
  PageNotFound,
  Register,
  RecoverPasswordPage,
  RestorePasswordPage,
  AcceptInvitePage,
  UserWrapper,
  UserDashboard,
  CustomerProfile,
  UserBilling,
  Team,
  AdminDashboardWrapper,
  AdminOverview,
  AdminUsersList,
  AdminUserDetail,
  AdminCompaniesList,
  AdminCompanyDetail,
  AdminAccount,
} from './routes/lazyPages.js';

//* A stale tab after a deploy reloads once instead of failing on a missing chunk
installPreloadErrorHandler();

//* posthog-js is dynamic-imported after first paint, and only for visitors
//* who accepted analytics - it never ships in the entry chunk
scheduleAnalytics();

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <MantineProvider theme={theme}>
      <Notifications />
      <BrowserRouter>
        <RoutedErrorBoundary>
          {/* Every lazy route (routes/lazyPages.js) suspends here */}
          <Suspense fallback={<PageLoader />}>
            <Routes>
              <Route path="/" element={<IndexWrapper />}>
                <Route index element={<Homepage />} />
                <Route path="terminos-condiciones" element={<TerminosCondiciones />} />
                <Route path="preguntas-frecuentes" element={<FAQPage />} />
                <Route path="pricing" element={<PricingPage />} />
              </Route>

              <Route path="/admin" element={<AdminDashboardWrapper />}>
                <Route index element={<AdminOverview />} />
                <Route path="users" element={<AdminUsersList />} />
                <Route path="users/:userId" element={<AdminUserDetail />} />
                <Route path="companies" element={<AdminCompaniesList />} />
                <Route path="companies/:companyId" element={<AdminCompanyDetail />} />
                <Route path="account" element={<AdminAccount />} />
              </Route>

              {/* One pathless layout for the whole user area so moving between
                  /dashboard and /user/* keeps the wrapper (session check,
                  subscription context) mounted */}
              <Route element={<UserWrapper />}>
                <Route path="dashboard" element={<UserDashboard />} />
                <Route path="user">
                  <Route index element={<Navigate to="/dashboard" replace />} />
                  <Route path="profile" element={<CustomerProfile />} />
                  <Route path="billing" element={<UserBilling />} />
                  <Route path="team" element={<Team />} />
                </Route>
              </Route>

              <Route path="/auth" element={<AuthWrapper />}>
                <Route index element={<Login />} />
                <Route path="login" element={<Login />} />
                <Route path="register" element={<Register />} />
                <Route path="recover-password" element={<RecoverPasswordPage />} />
                <Route path="restore-password" element={<RestorePasswordPage />} />
                <Route path="accept-invite" element={<AcceptInvitePage />} />
              </Route>

              <Route path="/*" element={<PageNotFound />} />
            </Routes>
          </Suspense>
        </RoutedErrorBoundary>
        <RouteFocus />
        <ConsentBanner />
      </BrowserRouter>
    </MantineProvider>
  </StrictMode>,
);
