/**
 * Tests for query logging integration
 */

const {
  executeQuery,
  executeQueryString,
  configureQueryLogger,
} = require('../../src/handlers/queryHandlers');
const { ConnectionState } = require('../../src/connection/connectionState');

describe('Query Logging Integration', () => {
  let mockSocket;
  let mockConnState;

  beforeEach(() => {
    mockSocket = {
      write: jest.fn(),
      end: jest.fn(),
      destroy: jest.fn(),
      remoteAddress: '127.0.0.1',
      remotePort: 12345,
    };

    mockConnState = new ConnectionState('test-conn', mockSocket);
    mockConnState.authenticated = true;
    mockConnState.currentUser = 'test_user';
    mockConnState.currentDatabase = 'test_db';

    // Configure query logger for testing
    configureQueryLogger({
      enabled: true,
      level: 'info',
      queryLogging: {
        enableDetailedLogging: true,
        logParameters: true,
        logExecutionTime: true,
        slowQueryThreshold: 100,
        enableAnalytics: true,
      },
    });
  });

  test('should execute query without errors', () => {
    expect(() => {
      executeQuery('SELECT 1', mockSocket, mockConnState);
    }).not.toThrow();
  });

  test('should execute query string without errors', () => {
    expect(() => {
      executeQueryString('SELECT 1; SELECT 2;', mockSocket, mockConnState);
    }).not.toThrow();
  });

  test('should handle invalid queries gracefully', () => {
    expect(() => {
      executeQuery('INVALID SQL', mockSocket, mockConnState);
    }).not.toThrow();
  });
});
