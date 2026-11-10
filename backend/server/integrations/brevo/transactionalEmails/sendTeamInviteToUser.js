import {
  brevoClient,
  commonTemplateParams,
  companyEmails,
  frontendUrl,
  templateIds,
} from './brevo.js';
import { logError } from '../../../config/loggerFunctions.js';

export const sendTeamInviteToUser = async (userEmail, inviteToken, companyName, inviterEmail) => {
  try {
    return await brevoClient.transactionalEmails.sendTransacEmail({
      sender: {
        // name: "XXX", //* Managed in the template
        email: companyEmails.support,
      },
      to: [{
        email: userEmail,
      }],
      templateId: templateIds.teamInvite, //* Brevo dashboard --> https://my.brevo.com/camp/template/<id>/setup
      //* The template links to {{ params.acceptInviteUrl }} - built here so the
      //* path always matches the SPA's accept-invite page. The raw token stays
      //* available for templates that still build the link themselves
      params: {
        ...commonTemplateParams(),
        acceptInviteUrl: frontendUrl('/auth/accept-invite', { inviteToken }),
        inviteToken: inviteToken,
        companyName: companyName,
        inviterEmail: inviterEmail,
      },
    });
  } catch (error) {
    return logError('error sending sendTeamInviteToUser', error); //* NOT throwing an error since req-res
    //*  flow should not be interrupted with this email send operation
  }
};
