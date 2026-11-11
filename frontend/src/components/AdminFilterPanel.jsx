import { useState } from 'react';
import PropTypes from 'prop-types';
import { useTranslation } from 'react-i18next';
import { Badge, Button, Card, Group, NativeSelect, SimpleGrid, Text, TextInput } from '@mantine/core';
import { IconFilter } from '@tabler/icons-react';
import { countActiveFilters, emptyFilterValues, filterValuesFromForm } from './adminFilterValues.js';

//* Always-visible filter panel above an admin list table. Edits are staged in
//* the uncontrolled form and cost nothing; only Apply hands the values to the
//* page (one request), Revert restores the applied values, Clear applies the
//* empty set. `fields` come from ADMIN_LIST_FILTER_FIELDS; labels from
//* admin.filters.fields.<name>
export function AdminFilterPanel({ fields, applied, onApply }) {
  const { t } = useTranslation();
  //* Remounting the form resets every input to the applied values
  const [revision, setRevision] = useState(0);
  const activeCount = countActiveFilters(fields, applied);
  const formKey = `${revision}:${JSON.stringify(applied)}`;

  const handleSubmit = (e) => {
    e.preventDefault();
    onApply(filterValuesFromForm(fields, e.currentTarget.elements));
  };

  const optionLabel = (field, option) =>
    field.name === 'role' ? t(`admin.roles.${option}`) : t(`admin.filters.options.${field.name}.${option}`);

  const renderField = (field) => {
    const label = t(`admin.filters.fields.${field.name}`);

    if (field.kind === 'select') {
      return (
        <NativeSelect
          key={field.name}
          name={field.name}
          label={label}
          defaultValue={applied[field.name] ?? ''}
          data={[
            { value: '', label: t('admin.filters.anyOption') },
            ...field.options.map((option) => ({ value: option, label: optionLabel(field, option) })),
          ]}
        />
      );
    }

    if (field.kind === 'dateRange') {
      return [
        <TextInput
          key={`${field.name}_from`}
          type="date"
          name={`${field.name}_from`}
          label={t('admin.filters.rangeFrom', { field: label })}
          defaultValue={applied[`${field.name}_from`] ?? ''}
        />,
        <TextInput
          key={`${field.name}_to`}
          type="date"
          name={`${field.name}_to`}
          label={t('admin.filters.rangeTo', { field: label })}
          defaultValue={applied[`${field.name}_to`] ?? ''}
        />,
      ];
    }

    return (
      <TextInput
        key={field.name}
        name={field.name}
        label={label}
        placeholder={t(`admin.filters.placeholders.${field.name}`)}
        defaultValue={applied[field.name] ?? ''}
      />
    );
  };

  return (
    <Card withBorder padding="md" radius="md">
      <form key={formKey} onSubmit={handleSubmit} aria-label={t('admin.filters.title')}>
        <Group justify="space-between" mb="sm">
          <Group gap="xs">
            <IconFilter size={16} stroke={1.5} />
            <Text fw={600} size="sm">
              {t('admin.filters.title')}
            </Text>
            {activeCount > 0 && (
              <Badge variant="light" aria-live="polite">
                {t('admin.filters.activeCount', { count: activeCount })}
              </Badge>
            )}
          </Group>
        </Group>

        <SimpleGrid cols={{ base: 1, sm: 2, md: 4 }} spacing="sm">
          {fields.flatMap((field) => renderField(field))}
        </SimpleGrid>

        <Group justify="flex-end" mt="sm" gap="xs">
          <Button variant="subtle" onClick={() => onApply(emptyFilterValues(fields))} disabled={activeCount === 0}>
            {t('admin.filters.clear')}
          </Button>
          <Button variant="default" onClick={() => setRevision((value) => value + 1)}>
            {t('admin.filters.revert')}
          </Button>
          <Button type="submit">{t('admin.filters.apply')}</Button>
        </Group>
      </form>
    </Card>
  );
}

AdminFilterPanel.propTypes = {
  fields: PropTypes.arrayOf(
    PropTypes.shape({
      name: PropTypes.string.isRequired,
      kind: PropTypes.oneOf(['select', 'text', 'dateRange']).isRequired,
      options: PropTypes.arrayOf(PropTypes.string),
    }),
  ).isRequired,
  applied: PropTypes.objectOf(PropTypes.string).isRequired,
  onApply: PropTypes.func.isRequired,
};

export default AdminFilterPanel;
