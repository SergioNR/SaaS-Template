import { Link, NavLink, Outlet } from 'react-router';
import PropTypes from 'prop-types';
import { useTranslation } from 'react-i18next';
import { AppShell, Anchor, Box, Burger, Group, Image, Text } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import classes from './AreaShell.module.css';
import LogOutButton from '../navBarElements/LogOutButton';
import { MAIN_CONTENT_ID, SkipLink } from '../SkipLink.jsx';

const AREA_NAV_ID = 'area-navbar';

//* Shared AppShell for the private areas (user, admin): header with brand and
//* burger, sidebar with the area's links and logout as the only exit
export const AreaShell = ({ homeTo, title, links, sections, outletContext }) => {
  const { t } = useTranslation();
  const [opened, { toggle, close }] = useDisclosure();

  //* `sections` groups the sidebar into labelled blocks; the flat `links`
  //* prop renders a single block under the generic "Navigation" label
  const navSections = sections ?? [{ label: t('nav.navigation'), links: links ?? [] }];

  const renderLink = (item) => (
    <NavLink
      to={item.to}
      end={item.end}
      key={item.to}
      onClick={close}
      className={({ isActive }) => `${classes.link}${isActive ? ` ${classes.activeLink}` : ''}`}
    >
      <item.icon className={classes.linkIcon} stroke={1.5} aria-hidden />
      <span>{item.label}</span>
    </NavLink>
  );

  return (
    <AppShell
      header={{ height: 60 }}
      navbar={{
        width: 300,
        breakpoint: 'sm',
        collapsed: { mobile: !opened },
      }}
      padding="md"
    >
      <SkipLink />
      <AppShell.Header>
        <Group h="100%" px="md" gap="sm" wrap="nowrap">
          <Burger
            opened={opened}
            onClick={toggle}
            hiddenFrom="sm"
            size="sm"
            aria-label={t('nav.menu')}
            aria-controls={AREA_NAV_ID}
            aria-expanded={opened}
          />
          <Anchor component={Link} to={homeTo} underline="never" inherit>
            <Group gap="xs" wrap="nowrap">
              <Image src="/logo.svg" alt={t('common.logoAlt')} h={28} w={28} />
              <Text fw={600} size="lg" component="span">{title}</Text>
            </Group>
          </Anchor>
        </Group>
      </AppShell.Header>

      {/* AppShell.Navbar provides the <nav> landmark, width, padding and border */}
      <AppShell.Navbar p="md" id={AREA_NAV_ID} aria-label={t('nav.navigation')}>
        <AppShell.Section grow>
          {navSections.map((section) => (
            <Box key={section.label} pb="lg">
              <Text size="xs" fw={700} tt="uppercase" c="dimmed" pb="md">
                {section.label}
              </Text>
              {section.links.map(renderLink)}
            </Box>
          ))}
        </AppShell.Section>

        <AppShell.Section pt="md">
          <LogOutButton />
        </AppShell.Section>
      </AppShell.Navbar>

      {/* tabIndex -1: the skip link and RouteFocus can focus it programmatically */}
      <AppShell.Main id={MAIN_CONTENT_ID} tabIndex={-1}>
        {/* Area pages read wrapper data (e.g. the signed-in admin) through useOutletContext() */}
        <Outlet context={outletContext} />
      </AppShell.Main>
    </AppShell>
  );
};

const linkShape = PropTypes.shape({
  to: PropTypes.string.isRequired,
  label: PropTypes.string.isRequired,
  icon: PropTypes.elementType.isRequired,
  end: PropTypes.bool,
});

//* Pass either `links` (one block) or `sections` (labelled blocks)
AreaShell.propTypes = {
  homeTo: PropTypes.string.isRequired,
  title: PropTypes.string.isRequired,
  links: PropTypes.arrayOf(linkShape),
  sections: PropTypes.arrayOf(
    PropTypes.shape({
      label: PropTypes.string.isRequired,
      links: PropTypes.arrayOf(linkShape).isRequired,
    }),
  ),
  outletContext: PropTypes.object,
};

export default AreaShell;
