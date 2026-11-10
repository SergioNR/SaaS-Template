import js from '@eslint/js';
import { FlatCompat } from '@eslint/eslintrc';
import globals from 'globals';

const compat = new FlatCompat({
  baseDirectory: import.meta.dirname,
  recommendedConfig: js.configs.recommended,
});

export default [
  {
    ignores: ['server/config/generated/**'],
  },
  ...compat.extends('airbnb-base'),
  {
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      //* Server code runs on Node only - browser globals (window, document,
      //* location, ...) would silently resolve instead of failing lint
      globals: {
        ...globals.node,
      },
    },
    rules: {
      'import/prefer-default-export': 'off',
      'no-underscore-dangle': 'off',
      'import/extensions': 'off',
      'object-shorthand': 'off',
      'import/no-relative-packages': 'off',
      'no-case-declarations': 'off',
      'max-len': 'off',
      'no-plusplus': 'off',
      'no-return-await': 'off',
      //* Everything goes through the pino helpers in config/loggerFunctions.js
      //* (redaction, levels, Telegram). CLI scripts disable it per line
      'no-console': 'error',
    },
  },
  {
    files: ['**/*.spec.js', 'tests/helpers/**/*.js'],
    languageOptions: {
      globals: globals.jest,
    },
    rules: {
      'no-await-in-loop': 'off', // Disable the rule for await inside loops in spec files (and their shared helpers)
      'no-restricted-syntax': 'off',
      'consistent-return': 'off',
    },
  },
  {
    //* Tooling config files run only in development, so importing devDependencies is expected
    files: ['eslint.config.js'],
    rules: {
      'import/no-extraneous-dependencies': ['error', { devDependencies: true }],
    },
  },
  {
    //* Files that legitimately iterate sequentially: the seed awaits row by
    //* row and the S3 batcher deletes batch by batch (both need ordered
    //* awaits), the rest only walk maps/arrays with for..of. Scoped here
    //* instead of repo-wide so the airbnb guardrails keep applying everywhere
    //* else
    files: [
      'prisma/**/*.js',
      'server/integrations/s3/deleteS3Objects.js',
      'server/integrations/telegram/sendLogsToTelegram.js',
      'server/config/planPrices.js',
      'server/utils/companyRoleHierarchy.js',
    ],
    rules: {
      'no-await-in-loop': 'off',
      'no-restricted-syntax': 'off',
    },
  },
];
