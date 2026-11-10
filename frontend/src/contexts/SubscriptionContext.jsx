import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import PropTypes from 'prop-types';
import apiClient from '../config/API/axiosConfig.js';
import { SubscriptionContext } from './useSubscription.js';

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

  const expiresInFuture = Boolean(
    subscription?.expires_at && new Date(subscription.expires_at) > new Date()
  );

  //* `is_paid` is only true for a paid Stripe subscription; the free trial has
  //* an `expires_at` too but no payment behind it
  const hasPaidSubscription = Boolean(subscription?.is_paid) && expiresInFuture;
  const isTrial = Boolean(subscription) && !subscription.is_paid && expiresInFuture;

  //* Access to the platform: either a paid subscription or a running trial
  const hasActiveSubscription = hasPaidSubscription || isTrial;

  //* Companies get a Stripe customer id only when a checkout session is
  //* started - the customer portal rejects companies without one (409)
  const hasBillingId = Boolean(subscription?.has_billing_id);

  const value = {
    subscription,
    hasActiveSubscription,
    hasPaidSubscription,
    isTrial,
    hasBillingId,
    loading,
    error,
    refresh: fetchSubscription,
  };

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
