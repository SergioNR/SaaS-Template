export const resendVerificationSchema = {
  email: {
    in: ['body'],
    //* First and bailing: `["a@b.co"]` would otherwise pass isEmail per
    //* element and reach Prisma as an array
    isString: {
      errorMessage: 'Email must be a string',
      bail: true,
    },
    notEmpty: {
      errorMessage: 'Email is required',
    },
    isEmail: {
      errorMessage: 'Please enter a valid email address',
      bail: true,
    },
    //* Same normalization as registration, so the lookup finds the stored address
    normalizeEmail: {
      options: {
        lowercase: true,
        gmail_remove_dots: true,
        gmail_remove_subaddress: true,
        gmail_convert_googlemaildotcom: true,
        outlookdotcom_remove_subaddress: true,
        yahoo_remove_subaddress: true,
        icloud_remove_subaddress: true,
      },
    },
    isLength: {
      options: {
        max: 254,
        min: 3,
      },
      errorMessage: 'Email must not exceed 254 characters',
    },
  },
};
