/**
 * Tests for server shutdown behavior
 */
const { ServerManager } = require('../../src/server/serverManager');
const Net = require('net');

describe('Server Shutdown Behavior', () => {
  let server;
  let testPort;

  beforeEach(() => {
    // Use a random port to avoid conflicts
    testPort = Math.floor(Math.random() * 10000) + 20000;
    server = new ServerManager({
      port: testPort,
      host: 'localhost',
      maxConnections: 10,
      connectionTimeout: 5000,
      shutdownTimeout: 5000,
      shutdownDrainTimeout: 2000,
      enableLogging: false,
      logLevel: 'error',
    });
  });

  afterEach(async () => {
    if (server && server.isServerRunning()) {
      await server.stop();
    }
  });

  describe('Basic Shutdown', () => {
    test('should stop server gracefully when no connections', async () => {
      await server.start();
      expect(server.isServerRunning()).toBe(true);
      expect(server.isServerShuttingDown()).toBe(false);

      await server.stop();

      expect(server.isServerRunning()).toBe(false);
      expect(server.isServerShuttingDown()).toBe(false);
    });

    test('should prevent multiple shutdown attempts', async () => {
      await server.start();

      const stop1 = server.stop();
      const stop2 = server.stop();

      // Both should resolve to the same promise
      expect(stop1).toStrictEqual(stop2);

      await stop1;
      expect(server.isServerRunning()).toBe(false);
    });

    test('should return resolved promise when already stopped', async () => {
      const result = await server.stop();
      expect(result).toBeUndefined();
    });
  });

  describe('Connection Handling During Shutdown', () => {
    test('should reject new connections during shutdown', async () => {
      await server.start();

      // Start shutdown
      const shutdownPromise = server.stop();

      // Try to connect during shutdown
      const client = new Net.Socket();
      const connectionPromise = new Promise((resolve, reject) => {
        client.on('connect', () => resolve('connected'));
        client.on('error', err => reject(err));
        client.connect(testPort, 'localhost');
      });

      // Should reject the connection
      await expect(connectionPromise).rejects.toThrow();

      client.destroy();
      await shutdownPromise;
    });

    test('should notify existing connections of shutdown', async () => {
      await server.start();

      // Create a mock connection
      const mockSocket = {
        write: jest.fn(),
        destroyed: false,
        end: jest.fn(),
        destroy: jest.fn(),
      };

      const mockConnState = {
        isInTransaction: jest.fn().mockReturnValue(false),
        rollbackTransaction: jest.fn(),
        close: jest.fn(),
      };

      // Add connection to server
      const connectionId = 'test_conn';
      server.connections.set(connectionId, {
        id: connectionId,
        socket: mockSocket,
        connState: mockConnState,
        connectedAt: new Date(),
      });

      await server.stop();

      // Should have sent shutdown notification
      expect(mockSocket.write).toHaveBeenCalled();
      expect(mockConnState.close).toHaveBeenCalled();
    });

    test('should rollback transactions during shutdown', async () => {
      await server.start();

      // Create a mock connection in transaction
      const mockSocket = {
        write: jest.fn(),
        destroyed: false,
        end: jest.fn(),
        destroy: jest.fn(),
      };

      const mockConnState = {
        isInTransaction: jest.fn().mockReturnValue(true),
        rollbackTransaction: jest.fn(),
        close: jest.fn(),
      };

      // Add connection to server
      const connectionId = 'test_conn';
      server.connections.set(connectionId, {
        id: connectionId,
        socket: mockSocket,
        connState: mockConnState,
        connectedAt: new Date(),
      });

      await server.stop();

      // Should have rolled back transaction
      expect(mockConnState.rollbackTransaction).toHaveBeenCalled();
      expect(mockConnState.close).toHaveBeenCalled();
    });
  });

  describe('Connection Draining', () => {
    test('should wait for connections to drain', async () => {
      await server.start();

      // Create a mock connection that closes after a delay
      const mockSocket = {
        write: jest.fn(),
        destroyed: false,
        end: jest.fn(),
        destroy: jest.fn(),
      };

      const mockConnState = {
        isInTransaction: jest.fn().mockReturnValue(false),
        rollbackTransaction: jest.fn(),
        close: jest.fn(),
      };

      const connectionId = 'test_conn';
      server.connections.set(connectionId, {
        id: connectionId,
        socket: mockSocket,
        connState: mockConnState,
        connectedAt: new Date(),
      });

      // Simulate connection closing after 100ms
      setTimeout(() => {
        server.connections.delete(connectionId);
      }, 100);

      const startTime = Date.now();
      await server.stop();
      const duration = Date.now() - startTime;

      // Should have waited for the connection to close
      expect(duration).toBeGreaterThan(90);
      expect(server.getActiveConnectionCount()).toBe(0);
    });

    test('should force close connections after drain timeout', async () => {
      await server.start();

      // Create a mock connection that never closes
      const mockSocket = {
        write: jest.fn(),
        destroyed: false,
        end: jest.fn(),
        destroy: jest.fn(),
      };

      const mockConnState = {
        isInTransaction: jest.fn().mockReturnValue(false),
        rollbackTransaction: jest.fn(),
        close: jest.fn(),
      };

      const connectionId = 'test_conn';
      server.connections.set(connectionId, {
        id: connectionId,
        socket: mockSocket,
        connState: mockConnState,
        connectedAt: new Date(),
      });

      const startTime = Date.now();
      await server.stop();
      const duration = Date.now() - startTime;

      // Should have force closed after drain timeout
      expect(duration).toBeGreaterThan(server.config.shutdownDrainTimeout);
      expect(mockSocket.destroy).toHaveBeenCalled();
      expect(server.getActiveConnectionCount()).toBe(0);
    });
  });

  describe('Shutdown Status', () => {
    test('should provide shutdown status information', async () => {
      await server.start();

      let status = server.getShutdownStatus();
      expect(status.isShuttingDown).toBe(false);
      expect(status.activeConnections).toBe(0);
      expect(status.shutdownTimeout).toBe(5000);
      expect(status.drainTimeout).toBe(2000);

      // Add a connection
      const mockSocket = { write: jest.fn(), destroyed: false };
      const mockConnState = { isInTransaction: () => false, close: jest.fn() };
      server.connections.set('test', {
        id: 'test',
        socket: mockSocket,
        connState: mockConnState,
        connectedAt: new Date(),
      });

      status = server.getShutdownStatus();
      expect(status.activeConnections).toBe(1);

      // Start shutdown
      const shutdownPromise = server.stop();
      expect(server.isServerShuttingDown()).toBe(true);

      await shutdownPromise;
      expect(server.isServerShuttingDown()).toBe(false);
    });
  });

  describe('Error Handling During Shutdown', () => {
    test('should handle errors during shutdown gracefully', async () => {
      await server.start();

      // Create a mock connection that throws errors
      const mockSocket = {
        write: jest.fn().mockImplementation(() => {
          throw new Error('Socket write error');
        }),
        destroyed: false,
        end: jest.fn(),
        destroy: jest.fn(),
      };

      const mockConnState = {
        isInTransaction: jest.fn().mockReturnValue(false),
        rollbackTransaction: jest.fn(),
        close: jest.fn().mockImplementation(() => {
          throw new Error('Connection close error');
        }),
      };

      const connectionId = 'test_conn';
      server.connections.set(connectionId, {
        id: connectionId,
        socket: mockSocket,
        connState: mockConnState,
        connectedAt: new Date(),
      });

      // Should not throw even with errors
      await expect(server.stop()).resolves.toBeUndefined();
      expect(server.isServerRunning()).toBe(false);
    });
  });

  describe('Configuration', () => {
    test('should use custom shutdown timeouts', () => {
      const customServer = new ServerManager({
        shutdownTimeout: 10000,
        shutdownDrainTimeout: 5000,
      });

      expect(customServer.config.shutdownTimeout).toBe(10000);
      expect(customServer.config.shutdownDrainTimeout).toBe(5000);
    });

    test('should use default shutdown timeouts when not specified', () => {
      const defaultServer = new ServerManager({});

      expect(defaultServer.config.shutdownTimeout).toBe(30000);
      expect(defaultServer.config.shutdownDrainTimeout).toBe(10000);
    });
  });

  describe('Resource Cleanup', () => {
    test('should clean up all resources after shutdown', async () => {
      await server.start();

      // Add some connections
      for (let i = 0; i < 3; i++) {
        const mockSocket = { write: jest.fn(), destroyed: false };
        const mockConnState = { isInTransaction: () => false, close: jest.fn() };
        server.connections.set(`conn_${i}`, {
          id: `conn_${i}`,
          socket: mockSocket,
          connState: mockConnState,
          connectedAt: new Date(),
        });
      }

      expect(server.getActiveConnectionCount()).toBe(3);
      expect(server.cleanupInterval).toBeTruthy();

      await server.stop();

      expect(server.getActiveConnectionCount()).toBe(0);
      expect(server.cleanupInterval).toBeNull();
      expect(server.isRunning).toBe(false);
      expect(server.isShuttingDown).toBe(false);
    });
  });
});
