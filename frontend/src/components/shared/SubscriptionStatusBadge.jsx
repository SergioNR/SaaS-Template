import { useTranslation } from 'react-i18next';
import { Badge } from '@mantine/core';
import PropTypes from 'prop-types';
import { subscriptionStatus } from '../../utils/subscriptionStatus.js';

const BADGES = {
  paid: { color: 'teal', key: 'billing.statusActive' },
  trial: { color: 'yellow', key: 'billing.statusTrial' },
  inactive: { color: 'red', key: 'billing.statusInactive' },
};

//* Same rules and labels as the user's billing page (SubscriptionContext +
//* utils/subscriptionStatus.js), computed during render - no first paint with
//* a wrong "inactive" badge
export const SubscriptionStatusBadge = ({ subscription }) => {
  const { t } = useTranslation();
  const badge = BADGES[subscriptionStatus(subscription)];

  return (
    <Badge color={badge.color} variant="light">
      {t(badge.key)}
    </Badge>
  );
};

SubscriptionStatusBadge.propTypes = {
  subscription: PropTypes.shape({
    status: PropTypes.oneOf(['paid', 'trial', 'inactive']),
  }),
};

export default SubscriptionStatusBadge;
