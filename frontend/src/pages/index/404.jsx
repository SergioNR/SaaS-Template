import { Button, Container, Group, Text, Title } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import classes from './NotFoundTitle.module.css';
import { Link } from 'react-router';
import { SiteFooter } from '../../components/partials/SiteFooter';
import Seo from '../../components/Seo.jsx';
import { MAIN_CONTENT_ID, SkipLink } from '../../components/SkipLink.jsx';

const PageNotFound = () => {
  const { t } = useTranslation();

  return (
    <>
      <Seo title={t('seo.pages.notFound')} />
      <SkipLink />
      <Container component="main" id={MAIN_CONTENT_ID} tabIndex={-1} className={classes.root}>
        <div className={classes.label}>404</div>
        <Title className={classes.title}>{t('notFound.title')}</Title>
        <Text c="dimmed" size="lg" ta="center" className={classes.description}>
          {t('notFound.description')}
        </Text>
        <Group justify="center">
          <Button component={Link} to="/" variant="subtle" size="md">
            {t('notFound.backHome')}
          </Button>
        </Group>
      </Container>
      <SiteFooter />
    </>
  );
};

export default PageNotFound;
