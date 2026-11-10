export const userLoginValidationSchema = {
  username: {
    //* First and bailing: an array would otherwise be validated (and
    //* normalized) per element and reach the strategy as a non-string
    isString: {
      errorMessage: 'Invalid email or password',
      bail: true,
    },
    trim: true,
    isEmail: {
      errorMessage: 'Invalid email or password',
    },
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
      options: { max: 254 },
      errorMessage: 'Invalid email or password',
    },
  },
  password: {
    //* Bound the input so bcrypt never hashes attacker-sized payloads
    //* (bcrypt only uses the first 72 bytes anyway)
    isString: {
      errorMessage: 'Invalid email or password',
      bail: true,
    },
    notEmpty: {
      errorMessage: 'Invalid email or password',
    },
    isLength: {
      options: { max: 128 },
      errorMessage: 'Invalid email or password',
    },
  },
};
