import { useId } from 'react';
import PropTypes from 'prop-types';
import { Tooltip, VisuallyHidden } from '@mantine/core';

//* Permission-locked controls render disabled with an explanatory tooltip,
//* never hidden. Disabled controls fire no pointer events and are skipped by
//* the keyboard, so the wrapper span takes their place: it is focusable
//* (tabIndex=0, the tooltip opens on focus too) and points screen readers at
//* the reason through aria-describedby. Unlocked, the control renders as is
//* `block` stretches the wrapper for full-width controls
export function LockedTooltip({ locked, label, block = false, children }) {
  const descriptionId = useId();

  if (!locked) {
    return children;
  }

  return (
    <Tooltip label={label} events={{ hover: true, focus: true, touch: true }}>
      <span
        tabIndex={0}
        aria-describedby={descriptionId}
        style={block ? { display: 'flex', width: '100%' } : { display: 'inline-flex' }}
      >
        {children}
        <VisuallyHidden id={descriptionId}>{label}</VisuallyHidden>
      </span>
    </Tooltip>
  );
}

LockedTooltip.propTypes = {
  locked: PropTypes.bool,
  label: PropTypes.string.isRequired,
  block: PropTypes.bool,
  children: PropTypes.node.isRequired,
};

export default LockedTooltip;
