import { useState, useEffect, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import PropTypes from 'prop-types';
import apiClient from '../config/API/axiosConfig.js';
import { SubscriptionContext } from './useSubscription.js';
import { subscriptionStatus } from '../utils/subscriptionStatus.js';

export const SubscriptionProvider = ({ children }) => {
  const { t } = useTranslation();
  const [subscription, setSubscription] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  //* `silent` re-fetches in the background (post-checkout polling) without
  //* flipping the page back to its loader. A failed silent refresh keeps the
  //* last good data and never touches `error`
  const fetchSubscription = useCallback(async ({ silent = false } = {}) => {
    if (!silent) {
      setLoading(true);
      setError(null);
    }

    try {
      const response = await apiClient.get('/api/v1/billing');

      setSubscription(response.data?.subscriptionData ?? null);
    } catch (err) {
      if (silent) {
        return;
      }

      const status = err?.response?.status;
      const code = err?.response?.data?.code;

      //* 404 = the company has no subscription row yet - a valid "inactive" state
      if (status === 404) {
        setSubscription(null);
      } else if (status === 403 && code === 'COMPANY_MEMBERSHIP_REQUIRED') {
        setSubscription(null);
        setError(t('billing.errors.membershipRequired'));
      } else {
        setError(t('billing.errors.load'));
      }
    } finally {
      if (!silent) {
        setLoading(false);
      }
    }
  }, [t]);

  useEffect(() => {
    fetchSubscription();
  }, [fetchSubscription]);

  //* Memoized so consumers only re-render when the subscription state
  //* actually changes, not on every provider render. Expiry is evaluated
  //* when the subscription is (re)loaded
  const value = useMemo(() => {
    //* The page state comes from the API's `status` (paid | trial |
    //* inactive) - utils/subscriptionStatus.js, shared with
    //* SubscriptionStatusBadge, falls back to the dates only without it
    const status = subscriptionStatus(subscription);
    const hasPaidSubscription = status === 'paid';
    const isTrial = status === 'trial';

    return {
      subscription,
      //* Access to the platform: either a paid subscription or a running trial
      hasActiveSubscription: status !== 'inactive',
      hasPaidSubscription,
      isTrial,
      //* Companies get a Stripe customer id only when a checkout session is
      //* started - the customer portal rejects companies without one (409)
      hasBillingId: Boolean(subscription?.has_billing_id),
      loading,
      error,
      refresh: fetchSubscription,
    };
  }, [subscription, loading, error, fetchSubscription]);

  return (
    <SubscriptionContext.Provider value={value}>
      {children}
    </SubscriptionContext.Provider>
  );
};

SubscriptionProvider.propTypes = {
  children: PropTypes.node.isRequired,
};

export default SubscriptionProvider;
