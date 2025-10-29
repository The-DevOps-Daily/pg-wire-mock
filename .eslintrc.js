/**
 * ESLint configuration for pg-wire-mock
 */
module.exports = {
  env: {
    node: true,
    es6: true,
    jest: true,
  },
  extends: ['eslint:recommended'],
  parserOptions: {
    ecmaVersion: 2020,
    sourceType: 'module',
  },
  rules: {
    'no-console': 'off', // Allow console for this project as it's a CLI tool
    'no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    'no-trailing-spaces': 'error',
    semi: ['error', 'always'],
    quotes: ['error', 'single', { avoidEscape: true }],
    indent: ['error', 2, { SwitchCase: 1 }],
    'arrow-spacing': 'error',
    'space-before-blocks': 'error',
    'keyword-spacing': 'error',
    'eol-last': ['error', 'always'],
    'max-len': ['warn', { code: 120, ignoreComments: true }],
  },
  ignorePatterns: ['node_modules', 'coverage'],
};
