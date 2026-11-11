import {
  brevoClient,
  commonTemplateParams,
  companyEmails,
  frontendUrl,
  templateIds,
} from './brevo.js';
import { logError } from '../../../config/loggerFunctions.js';

export const sendEmailVerificationToUser = async (userEmail, emailVerificationToken) => {
  try {
    return await brevoClient.transactionalEmails.sendTransacEmail({
      sender: {
        // name: "XXX", //* Managed in the template
        email: companyEmails.support,
      },
      to: [{
        email: userEmail,
      }],
      templateId: templateIds.verifyEmail, //* Brevo dashboard --> https://my.brevo.com/camp/template/<id>/setup
      //* The template links to {{ params.emailVerificationUrl }} - built here so
      //* the path always matches the SPA's verification page. The SPA posts
      //* the token (never a GET - mail scanners prefetch links)
      params: {
        ...commonTemplateParams(),
        emailVerificationUrl: frontendUrl('/auth/verify-email', { emailVerificationToken }),
      },
    });
  } catch (error) {
    return logError('error sending sendEmailVerificationToUser', error); //* NOT throwing an error since req-res
    //*  flow should not be interrupted with this email send operation
  }
};
