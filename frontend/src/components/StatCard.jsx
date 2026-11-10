import PropTypes from 'prop-types';
import { Card, Group, Text, ThemeIcon } from '@mantine/core';

//* Dashboard KPI tile (user dashboard, admin overview): label + icon header
//* over arbitrary content (a value, a badge, a Skeleton while loading)
export function StatCard({ icon, label, children }) {
  return (
    <Card withBorder p="lg" radius="md">
      <Group justify="space-between" mb="xs">
        <Text c="dimmed" size="sm" fw={500}>
          {label}
        </Text>
        <ThemeIcon variant="light" size="lg" radius="md" aria-hidden>
          {icon}
        </ThemeIcon>
      </Group>
      {children}
    </Card>
  );
}

StatCard.propTypes = {
  icon: PropTypes.node,
  label: PropTypes.string,
  children: PropTypes.node,
};

export default StatCard;
