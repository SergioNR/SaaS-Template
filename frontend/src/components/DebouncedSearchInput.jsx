import { useEffect, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import { TextInput } from '@mantine/core';
import { useDebouncedValue } from '@mantine/hooks';
import { IconSearch } from '@tabler/icons-react';

export const SEARCH_DEBOUNCE_MS = 400;

//* Search box that owns its keystroke state, so typing only re-renders this
//* input - the page re-renders (and refetches) once per debounced, trimmed
//* value. `label` is the accessible name; it is visually hidden by default
export function DebouncedSearchInput({ onSearch, label, placeholder, delay = SEARCH_DEBOUNCE_MS, ...inputProps }) {
  const [value, setValue] = useState('');
  const [debounced] = useDebouncedValue(value.trim(), delay);
  const onSearchRef = useRef(onSearch);
  const lastSentRef = useRef('');

  useEffect(() => {
    onSearchRef.current = onSearch;
  }, [onSearch]);

  useEffect(() => {
    if (debounced === lastSentRef.current) {
      return;
    }

    lastSentRef.current = debounced;
    onSearchRef.current(debounced);
  }, [debounced]);

  return (
    <TextInput
      type="search"
      value={value}
      onChange={(event) => setValue(event.currentTarget.value)}
      aria-label={label}
      placeholder={placeholder}
      leftSection={<IconSearch size={16} stroke={1.5} aria-hidden />}
      {...inputProps}
    />
  );
}

DebouncedSearchInput.propTypes = {
  onSearch: PropTypes.func.isRequired,
  label: PropTypes.string.isRequired,
  placeholder: PropTypes.string,
  delay: PropTypes.number,
};

export default DebouncedSearchInput;
