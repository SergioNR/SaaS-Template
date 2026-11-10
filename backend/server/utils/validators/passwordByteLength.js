//* bcrypt only hashes the first 72 BYTES of a password - anything after is
//* silently ignored, so a 64-character password made of multi-byte characters
//* could share a hash with every password sharing its first 72 bytes.
//* Character-based `isLength` cannot see that, so every schema that SETS a
//* password also bounds its UTF-8 byte length
export const BCRYPT_MAX_PASSWORD_BYTES = 72;

export const passwordByteLengthValidator = {
  custom: (value) => Buffer.byteLength(String(value), 'utf8') <= BCRYPT_MAX_PASSWORD_BYTES,
  errorMessage: `Password must not exceed ${BCRYPT_MAX_PASSWORD_BYTES} bytes`,
};
