/**
 * Tests for server.js main file
 */
const { parseConfig } = require('../server');

describe('Server Configuration', () => {
  // Save original process.env and argv
  const originalEnv = process.env;
  const originalArgv = process.argv;

  beforeEach(() => {
    // Reset process.env and argv before each test
    jest.resetModules();
    process.env = { ...originalEnv };
    process.argv = [...originalArgv];
  });

  afterAll(() => {
    // Restore original process.env and argv after all tests
    process.env = originalEnv;
    process.argv = originalArgv;
  });

  test('should use default configuration when no overrides provided', () => {
    const config = parseConfig();

    expect(config).toEqual({
      port: 5432,
      host: 'localhost',
      maxConnections: 100,
      connectionTimeout: 300000,
      enableLogging: true,
      logLevel: 'info',
    });
  });

  test('should use environment variables when provided', () => {
    process.env.PG_MOCK_PORT = '5433';
    process.env.PG_MOCK_HOST = '0.0.0.0';
    process.env.PG_MOCK_MAX_CONNECTIONS = '50';
    process.env.PG_MOCK_LOG_LEVEL = 'debug';

    const config = parseConfig();

    expect(config).toEqual({
      port: 5433,
      host: '0.0.0.0',
      maxConnections: 50,
      connectionTimeout: 300000,
      enableLogging: true,
      logLevel: 'debug',
    });
  });

  test('should use command line arguments when provided', () => {
    process.argv = [
      'node',
      'server.js',
      '--port',
      '5434',
      '--host',
      '127.0.0.1',
      '--max-connections',
      '200',
      '--log-level',
      'error',
    ];

    const config = parseConfig();

    expect(config).toEqual({
      port: 5434,
      host: '127.0.0.1',
      maxConnections: 200,
      connectionTimeout: 300000,
      enableLogging: true,
      logLevel: 'error',
    });
  });

  test('should disable logging when quiet flag is provided', () => {
    process.argv = ['node', 'server.js', '--quiet'];

    const config = parseConfig();

    expect(config.enableLogging).toBe(false);
  });
});
