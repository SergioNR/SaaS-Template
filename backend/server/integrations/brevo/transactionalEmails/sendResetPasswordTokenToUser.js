import {
  brevoClient,
  commonTemplateParams,
  companyEmails,
  frontendUrl,
  templateIds,
} from './brevo.js';
import { logError } from '../../../config/loggerFunctions.js';

export const sendResetPasswordTokenToUser = async (userEmail, passwordResetToken) => {
  try {
    return await brevoClient.transactionalEmails.sendTransacEmail({
      sender: {
        // name: "XXX", //* Managed in the template
        email: companyEmails.support,
      },
      to: [{
        email: userEmail,
      }],
      templateId: templateIds.resetPassword, //* Brevo dashboard --> https://my.brevo.com/camp/template/<id>/setup
      //* The template links to {{ params.resetPasswordUrl }} - built here so the
      //* path always matches the SPA's restore page. The raw token stays
      //* available for templates that still build the link themselves
      params: {
        ...commonTemplateParams(),
        resetPasswordUrl: frontendUrl('/auth/restore-password', { passwordResetToken }),
        passwordResetToken: passwordResetToken,
      },
    });
  } catch (error) {
    return logError('error sending sendResetPasswordTokenToUser', error); //* NOT throwing an error since req-res
    //*  flow should not be interrupted with this email send operation
  }
};
