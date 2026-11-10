import { Outlet } from 'react-router';
import AuthNavBar from '../../components/partials/AuthNavBar';
import { SiteFooter } from '../../components/partials/SiteFooter';

const AuthWrapper = () => {
  return (
    <>
      <AuthNavBar />

      <Outlet />
      <SiteFooter />
    </>
  );
};

export default AuthWrapper;
