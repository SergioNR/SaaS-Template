import { useTranslation } from 'react-i18next';
import { Badge } from '@mantine/core';
import PropTypes from 'prop-types';
import { subscriptionStatus } from '../../utils/subscriptionStatus.js';

const BADGES = {
  paid: { color: 'teal', key: 'billing.statusPaid' },
  active: { color: 'teal', key: 'billing.statusActive' },
  trial: { color: 'yellow', key: 'billing.statusTrial' },
  inactive: { color: 'red', key: 'billing.statusInactive' },
};

//* Same rules as SubscriptionContext (utils/subscriptionStatus.js), computed
//* during render - no first paint with a wrong "inactive" badge
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
    expires_at: PropTypes.string,
    status: PropTypes.oneOf(['paid', 'trial', 'inactive']),
    is_paid: PropTypes.bool,
  }),
};

export default SubscriptionStatusBadge;
