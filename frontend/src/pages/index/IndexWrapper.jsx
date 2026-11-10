import { Outlet } from 'react-router';
import { Box } from '@mantine/core';
import SiteNavBar from '../../components/partials/SiteNavBar';
import { SiteFooter } from '../../components/partials/SiteFooter';
import { MAIN_CONTENT_ID, SkipLink } from '../../components/SkipLink.jsx';

const IndexWrapper = () => {
  return (
    <>
      <SkipLink />
      <SiteNavBar />

      {/* tabIndex -1: the skip link and RouteFocus can focus it programmatically */}
      <Box component="main" id={MAIN_CONTENT_ID} tabIndex={-1}>
        <Outlet />
      </Box>

      <SiteFooter />
    </>
  );
};

export default IndexWrapper;
