import { Outlet } from 'react-router';
import { Box } from '@mantine/core';
import AuthNavBar from '../../components/partials/AuthNavBar';
import { SiteFooter } from '../../components/partials/SiteFooter';
import { MAIN_CONTENT_ID, SkipLink } from '../../components/SkipLink.jsx';

const AuthWrapper = () => {
  return (
    <>
      <SkipLink />
      <AuthNavBar />

      {/* tabIndex -1: the skip link and RouteFocus can focus it programmatically */}
      <Box component="main" id={MAIN_CONTENT_ID} tabIndex={-1}>
        <Outlet />
      </Box>

      <SiteFooter />
    </>
  );
};

export default AuthWrapper;
