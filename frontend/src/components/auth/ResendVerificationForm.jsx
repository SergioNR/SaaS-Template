import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import PropTypes from 'prop-types';
import { Alert, Button, TextInput } from '@mantine/core';
import { IconAlertCircle, IconCheck } from '@tabler/icons-react';
import apiClient from '../../config/API/axiosConfig.js';
import { resendFailureKey } from '../../pages/auth/emailVerification.js';

//* Requests a new verification email. The API answers the same 200 for any
//* address, so the success copy never claims an account exists
export function ResendVerificationForm({ defaultEmail = '' }) {
  const { t } = useTranslation();
  const [sent, setSent] = useState(false);
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (submittingRef.current) {
      return;
    }

    submittingRef.current = true;
    setSubmitting(true);
    setError(null);

    const { email } = e.currentTarget.elements;

    try {
      await apiClient.post('/api/v1/auth/email-verification/resend', { email: email.value });
      setSent(true);
    } catch (err) {
      setError(t(resendFailureKey(err)));
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      {sent && (
        <Alert icon={<IconCheck size={16} />} color="green" mb="md">
          {t('auth.resendVerification.success')}
        </Alert>
      )}

      {error && (
        <Alert icon={<IconAlertCircle size={16} />} color="red" mb="md">
          {error}
        </Alert>
      )}

      <TextInput
        name="email"
        type="email"
        autoComplete="email"
        label={t('auth.resendVerification.label')}
        placeholder={t('auth.fields.emailPlaceholder')}
        defaultValue={defaultEmail}
        required
      />
      <Button type="submit" fullWidth mt="md" loading={submitting}>
        {t('auth.resendVerification.submit')}
      </Button>
    </form>
  );
}

ResendVerificationForm.propTypes = {
  defaultEmail: PropTypes.string,
};

export default ResendVerificationForm;
