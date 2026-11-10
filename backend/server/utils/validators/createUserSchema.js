import { passwordByteLengthValidator } from './passwordByteLength.js';

export const createUserValidationSchema = {
  username: {
    in: ['body'],
    //* First and bailing: `["a@b.co"]` would otherwise pass isEmail per
    //* element and reach Prisma as an array
    isString: {
      errorMessage: 'Username must be a string',
      bail: true,
    },
    notEmpty: {
      errorMessage: 'Username is required',
    },
    isEmail: {
      errorMessage: 'Please enter a valid email address',
      bail: true,
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
    //* Runs AFTER normalization (express-validator applies the chain in key
    //* order) and compares lower-cased, so `User@TempMail.com` or a
    //* googlemail alias cannot slip past the domain block
    custom: {
      options: (value) => {
        const blockedDomains = ['tempmail.com', 'throwaway.com'];
        const domain = String(value).split('@')[1]?.toLowerCase();
        if (blockedDomains.includes(domain)) {
          throw new Error('This email domain is not allowed');
        }
        return true;
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
  //* Optional so clients built before onboarding asked for it keep working -
  //* without it the company is created unnamed. When sent it must be valid
  companyName: {
    in: ['body'],
    optional: {
      options: {
        values: 'null',
      },
    },
    isString: {
      errorMessage: 'Company name must be a string',
      bail: true,
    },
    trim: true,
    isLength: {
      options: {
        min: 2,
        max: 100,
      },
      errorMessage: 'Company name must be between 2-100 characters long',
    },
  },
  password: {
    in: ['body'],
    isString: {
      errorMessage: 'Password must be a string',
      bail: true,
    },
    notEmpty: {
      errorMessage: 'Password is required',
    },
    isLength: {
      options: {
        min: 8,
        max: 64,
      },
      errorMessage: 'Password must be between 8-64 characters long',
    },
    isWithinBcryptByteLimit: passwordByteLengthValidator,
    isStrongPassword: {
      options: {
        minLength: 8,
        minLowercase: 1,
        minUppercase: 1,
        minNumbers: 1,
        minSymbols: 0,
      },
      errorMessage: 'Password must contain at least one lowercase letter, one uppercase letter and one number',
    },
  },
};
