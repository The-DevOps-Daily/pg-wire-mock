/**
 * Jest configuration for pg-wire-mock
 */
module.exports = {
  testEnvironment: 'node',
  coverageDirectory: 'coverage',
  collectCoverageFrom: [
    'src/**/*.js',
    '!**/node_modules/**',
    '!src/tests/**', // Exclude test utilities
  ],
  coverageReporters: ['text', 'lcov', 'html', 'json-summary'],
  testMatch: ['**/__tests__/**/*.js', '**/?(*.)+(spec|test).js'],
  verbose: false,
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
};
