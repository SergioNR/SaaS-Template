import MainHero from './sections/Hero.jsx';
import HowItWorks from './sections/HowItWorks.jsx';
import Features from './sections/Features.jsx';
import FAQ from './sections/FAQ.jsx';
import DashboardExample from './sections/DashboardExample.jsx';
import Seo from '../../components/Seo.jsx';
import { useTranslation } from 'react-i18next';

const Homepage = () => {
  const { t } = useTranslation();

  return (
    <>
      <Seo title={t('seo.homeTitle')} description={t('index.hero.subtitle')} path="/" />
      <MainHero />
      <HowItWorks />
      <DashboardExample />
      <Features />
      <FAQ />
    </>
  );
};

export default Homepage;
