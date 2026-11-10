import { lazy } from 'react';

//* Everything but the landing page and login ships as separate lazy chunks:
//* the public bundle never carries the user/admin/billing/team areas, and a
//* signed-in user never downloads the marketing pages. Declared in one
//* import-only module (no component definitions) so Fast Refresh stays happy
//* and the route tree in main.jsx stays readable. main.jsx mounts a single
//* <Suspense fallback={<PageLoader />}> above the routes

// Public site
export const PricingPage = lazy(() => import('../pages/index/PricingPage.jsx'));
export const FAQPage = lazy(() => import('../pages/index/FAQPage.jsx'));
export const TerminosCondiciones = lazy(() => import('../pages/index/terminos-condiciones.jsx'));
export const PageNotFound = lazy(() => import('../pages/index/404.jsx'));

// Auth (login stays eager - it is the main entry point)
export const Register = lazy(() => import('../pages/auth/RegisterPage.jsx'));
export const RecoverPasswordPage = lazy(() => import('../pages/auth/RecoverPasswordPage.jsx'));
export const RestorePasswordPage = lazy(() => import('../pages/auth/RestorePasswordPage.jsx'));
export const AcceptInvitePage = lazy(() => import('../pages/auth/AcceptInvitePage.jsx'));
export const VerifyEmailPage = lazy(() => import('../pages/auth/VerifyEmailPage.jsx'));

// User area
export const UserWrapper = lazy(() => import('../pages/user/UserWrapper.jsx'));
export const UserDashboard = lazy(() => import('../pages/user/UserDashboard.jsx'));
export const CustomerProfile = lazy(() => import('../pages/user/CustomerProfile.jsx'));
export const UserBilling = lazy(() => import('../pages/user/UserBilling.jsx'));
export const Team = lazy(() => import('../pages/user/Team.jsx'));

// Admin area
export const AdminDashboardWrapper = lazy(() => import('../pages/admin/AdminDashboardWrapper.jsx'));
export const AdminOverview = lazy(() => import('../pages/admin/AdminOverview.jsx'));
export const AdminUsersList = lazy(() => import('../pages/admin/AdminUsersList.jsx'));
export const AdminUserDetail = lazy(() => import('../pages/admin/AdminUserDetail.jsx'));
export const AdminCompaniesList = lazy(() => import('../pages/admin/AdminCompaniesList.jsx'));
export const AdminCompanyDetail = lazy(() => import('../pages/admin/AdminCompanyDetail.jsx'));
