import PropTypes from 'prop-types';
import { useTranslation } from 'react-i18next';
import { Group, Table, UnstyledButton } from '@mantine/core';
import { IconArrowDown, IconArrowUp, IconArrowsSort } from '@tabler/icons-react';
import { ariaSortFor } from './adminFilterValues.js';

//* Table header that sorts its column on activation and exposes the current
//* direction to assistive technology through `aria-sort`
export function SortableTh({ sortKey, current, onSort, children }) {
  const { t } = useTranslation();
  const ariaSort = ariaSortFor(current, sortKey);
  let Icon = IconArrowsSort;

  if (ariaSort === 'ascending') Icon = IconArrowUp;
  if (ariaSort === 'descending') Icon = IconArrowDown;

  return (
    <Table.Th aria-sort={ariaSort}>
      <UnstyledButton
        onClick={() => onSort(sortKey)}
        aria-label={t('admin.filters.sortBy', { column: typeof children === 'string' ? children : sortKey })}
        fw={700}
        fz="sm"
      >
        <Group gap={4} wrap="nowrap">
          {children}
          <Icon size={14} stroke={1.5} aria-hidden="true" />
        </Group>
      </UnstyledButton>
    </Table.Th>
  );
}

SortableTh.propTypes = {
  sortKey: PropTypes.string.isRequired,
  current: PropTypes.shape({
    sort: PropTypes.string,
    order: PropTypes.string,
  }).isRequired,
  onSort: PropTypes.func.isRequired,
  children: PropTypes.node.isRequired,
};

export default SortableTh;
