import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router';
import PageNotFound from './pages/index/404.jsx';
import './index.css';
import './i18n/index.js';
import Login from './pages/auth/LoginPage.jsx';
import Register from './pages/auth/RegisterPage.jsx';
import RestorePasswordPage from './pages/auth/RestorePasswordPage.jsx';
import TerminosCondiciones from './pages/index/terminos-condiciones.jsx';
import IndexWrapper from './pages/index/IndexWrapper.jsx';
import Homepage from './pages/index/Homepage.jsx';
import AdminOverview from './pages/admin/AdminOverview.jsx';
import AdminDashboardWrapper from './pages/admin/AdminDashboardWrapper.jsx';
import AdminUsersList from './pages/admin/AdminUsersList.jsx';
import AdminUserDetail from './pages/admin/AdminUserDetail.jsx';
import AdminCompaniesList from './pages/admin/AdminCompaniesList.jsx';
import AdminCompanyDetail from './pages/admin/AdminCompanyDetail.jsx';
import CustomerProfile from './pages/user/CustomerProfile.jsx';
import UserWrapper from './pages/user/UserWrapper.jsx';
import UserDashboard from './pages/user/UserDashboard.jsx';
import Team from './pages/user/Team.jsx';
import AcceptInvitePage from './pages/auth/AcceptInvitePage.jsx';
import RecoverPasswordPage from './pages/auth/RecoverPasswordPage.jsx';
import FAQPage from './pages/index/FAQPage.jsx';
import AuthWrapper from './pages/auth/AuthWrapper.jsx';
import { MantineProvider } from '@mantine/core';
import '@mantine/core/styles.css';
import { Notifications } from '@mantine/notifications';
import '@mantine/notifications/styles.css';
import UserBilling from './pages/user/UserBilling.jsx';
import { PricingPage } from './pages/index/PricingPage.jsx';
import { RoutedErrorBoundary } from './components/ErrorBoundary.jsx';

import { ConsentBanner } from './components/ConsentBanner.jsx';
import { scheduleAnalytics } from './analytics/posthog.js';

//* posthog-js is dynamic-imported after first paint, and only for visitors
//* who accepted analytics - it never ships in the entry chunk
scheduleAnalytics();

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <MantineProvider>
        <Notifications />
        <BrowserRouter>
          <RoutedErrorBoundary>
            <Routes>

              <Route path="/" element={<IndexWrapper />}>

                <Route index element={<Homepage />} />

                <Route path='terminos-condiciones' element={<TerminosCondiciones />} />
                <Route path='preguntas-frecuentes' element={<FAQPage />} />
                <Route path='pricing' element={<PricingPage />} />
              </Route>

              <Route path='/admin' element={<AdminDashboardWrapper />} >
                <Route index element={<AdminOverview />} />
                <Route path='users' element={<AdminUsersList />} />
                <Route path='users/:userId' element={<AdminUserDetail />} />
                <Route path='companies' element={<AdminCompaniesList />} />
                <Route path='companies/:companyId' element={<AdminCompanyDetail />} />
              </Route>

              {/* One pathless layout for the whole user area so moving between
                  /dashboard and /user/* keeps the wrapper (session check,
                  subscription context) mounted */}
              <Route element={<UserWrapper />}>
                <Route path='dashboard' element={<UserDashboard />} />
                <Route path='user'>
                  <Route index element={<Navigate to="/dashboard" replace />} />
                  <Route path='profile' element={<CustomerProfile />} />
                  <Route path='billing' element={<UserBilling />} />
                  <Route path='team' element={<Team />} />
                </Route>
              </Route>

              <Route path="/auth" element={<AuthWrapper />}>
                <Route index element={<Login />} />
                <Route path="login" element={<Login />} />
                <Route path="register" element={<Register />} />
                <Route path='recover-password' element={<RecoverPasswordPage />} />
                <Route path='restore-password' element={<RestorePasswordPage />} />
                <Route path='accept-invite' element={<AcceptInvitePage />} />
              </Route>

              <Route path="/*" element={<PageNotFound />} />
            </Routes>
          </RoutedErrorBoundary>
          <ConsentBanner />
        </BrowserRouter>
    </MantineProvider>
  </StrictMode>
);
