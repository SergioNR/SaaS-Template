import js from '@eslint/js';
import globals from 'globals';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';

export default [
  { ignores: ['dist'] },
  {
    // Build tooling runs in Node
    files: ['*.config.js'],
    languageOptions: {
      globals: globals.node,
    },
  },
  {
    files: ['**/*.{js,jsx}'],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
      parserOptions: {
        ecmaVersion: 'latest',
        ecmaFeatures: { jsx: true },
        sourceType: 'module',
      },
    },
    settings: { react: { version: 'detect' } },
    plugins: {
      react,
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...js.configs.recommended.rules,
      ...react.configs.recommended.rules,
      ...react.configs['jsx-runtime'].rules,
      ...reactHooks.configs.recommended.rules,
      'react/jsx-no-target-blank': 'off',
      // Axios/backend errors expose raw English strings (err.message, response
      // bodies) that must never reach the UI - map status + code to t() keys
      'no-restricted-syntax': [
        'error',
        {
          selector: "MemberExpression[property.name='message'][object.name=/^(err|error|e)$/]",
          message: 'Never render axios/backend error messages — map status/code to t() keys.',
        },
        {
          // Backend response bodies: `response.data.message`, `err.response?.data?.message`, ...
          selector:
            "MemberExpression[property.name='message'][object.type='MemberExpression'][object.property.name='data']",
          message: 'Never render backend response messages (`*.data.message`) — map status/code to t() keys.',
        },
      ],
      // Axios errors carry request bodies (passwords) - log through
      // utils/logApiError.js, which only prints { status, code }
      'no-console': 'error',
      // The codebase fetches on mount in effects (see SubscriptionContext);
      // this rule cannot trace setState past async boundaries and false-flags it
      'react-hooks/set-state-in-effect': 'off',
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
    },
  },
];
