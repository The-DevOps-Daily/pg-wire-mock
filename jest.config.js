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

  // Coverage thresholds - Set to current achievable levels
  // These represent good test coverage while allowing for future improvement
  coverageThreshold: {
    global: {
      branches: 39,
      functions: 54,
      lines: 53,
      statements: 52,
    },
    './src/protocol/': {
      branches: 60,
      functions: 80,
      lines: 75,
      statements: 75,
    },
    './src/handlers/': {
      branches: 35,
      functions: 65,
      lines: 50,
      statements: 50,
    },
  },

  // Test timeout
  testTimeout: 10000,

  // Setup files
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],

  // Ignore patterns
  testPathIgnorePatterns: ['/node_modules/', '/coverage/'],

  // Module paths
  modulePaths: ['<rootDir>'],
};
