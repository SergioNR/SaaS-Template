import PropTypes from 'prop-types';
import { Group, Text } from '@mantine/core';

//* Label / value row for detail cards (admin user and company detail)
export function DetailRow({ label, children }) {
  return (
    <Group justify="space-between" py="xs" wrap="nowrap">
      <Text c="dimmed" size="sm">
        {label}
      </Text>
      {children}
    </Group>
  );
}

DetailRow.propTypes = {
  label: PropTypes.string,
  children: PropTypes.node,
};

export default DetailRow;
