import { Outlet } from 'react-router';
import SiteNavBar from '../../components/partials/SiteNavBar';
import { SiteFooter } from '../../components/partials/SiteFooter';

const IndexWrapper = () => {
  return (
    <>
      <SiteNavBar />

      <Outlet />

      <SiteFooter />
    </>
  );
};

export default IndexWrapper;
