/**
 * Tests for Connection Pooling functionality
 * Following contribution guidelines for pg-wire-mock
 */

const { ServerManager } = require('../src/server/serverManager');
const { ConnectionPool } = require('../src/connection/connectionPool');

describe('Connection Pooling', () => {
  let server;
  const testPort = 5434; // Use different port for testing

  beforeEach(() => {
    // Create server with connection pooling enabled
    server = new ServerManager({
      port: testPort,
      host: 'localhost',
      enableConnectionPooling: true,
      poolConfig: {
        maxConnections: 5,
        minConnections: 2,
        idleTimeoutMs: 2000, // 2 seconds for testing
        enableLogging: false, // Disable logging during tests
      },
      enableLogging: false,
      http: {
        enabled: false,
      },
    });
  });

  afterEach(async () => {
    // Clean up server after each test
    if (server && server.isServerRunning()) {
      await server.stop();
    }
    // Give extra time for cleanup
    await new Promise(resolve => setTimeout(resolve, 100));
  });

  describe('Pool Initialization', () => {
    test('should initialize connection pool when enabled', async () => {
      await server.start();

      expect(server.connectionPool).toBeDefined();
      expect(server.connectionPool).toBeInstanceOf(ConnectionPool);

      const stats = server.getStats();
      expect(stats.config.enableConnectionPooling).toBe(true);
      expect(stats.connectionPool).toBeDefined();
    });

    test('should not initialize pool when disabled', async () => {
      const serverWithoutPool = new ServerManager({
        port: 5433, // Use different port to avoid conflicts
        enableConnectionPooling: false,
        enableLogging: false,
        http: {
          enabled: false,
        },
      });

      try {
        await serverWithoutPool.start();

        expect(serverWithoutPool.connectionPool).toBe(null);
        const stats = serverWithoutPool.getStats();
        expect(stats.config.enableConnectionPooling).toBe(false);
      } finally {
        await serverWithoutPool.stop();
        // Wait a bit for port to be fully released
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    });
  });

  describe('Server Statistics', () => {
    beforeEach(async () => {
      await server.start();
      // Wait for pool initialization
      await new Promise(resolve => setTimeout(resolve, 500));
    });

    test('should provide comprehensive statistics', () => {
      const stats = server.getStats();

      expect(stats).toHaveProperty('connectionsAccepted');
      expect(stats).toHaveProperty('connectionsRejected');
      expect(stats).toHaveProperty('activeConnections');
      expect(stats).toHaveProperty('uptime');
      expect(stats).toHaveProperty('config');
      expect(stats.config).toHaveProperty('enableConnectionPooling');

      if (stats.connectionPool) {
        expect(stats.connectionPool).toHaveProperty('totalConnections');
        expect(stats.connectionPool).toHaveProperty('activeConnections');
        expect(stats.connectionPool).toHaveProperty('idleConnections');
      }
    });

    test('should show pool is initialized and active', () => {
      const stats = server.getStats();

      // Verify connection pool is active
      expect(stats.config.enableConnectionPooling).toBe(true);

      // Verify pool statistics are available
      if (stats.connectionPool) {
        expect(stats.connectionPool.totalConnections).toBeGreaterThanOrEqual(0);
        expect(stats.connectionPool.connectionsCreated).toBeGreaterThanOrEqual(0);
      }
    });
  });

  describe('Connection Pool Configuration', () => {
    test('should use custom pool configuration', async () => {
      const customServer = new ServerManager({
        port: testPort + 2,
        enableConnectionPooling: true,
        poolConfig: {
          maxConnections: 10,
          minConnections: 3,
          idleTimeoutMs: 5000,
          enableLogging: false,
        },
        enableLogging: false,
        http: {
          enabled: false,
        },
      });

      try {
        await customServer.start();

        expect(customServer.connectionPool).toBeDefined();
        expect(customServer.config.poolConfig.maxConnections).toBe(10);
        expect(customServer.config.poolConfig.minConnections).toBe(3);

        const stats = customServer.getStats();
        expect(stats.config.enableConnectionPooling).toBe(true);
      } finally {
        await customServer.stop();
      }
    });
  });

  describe('Server Integration', () => {
    test('should start and stop server with pool successfully', async () => {
      await server.start();

      expect(server.isServerRunning()).toBe(true);
      expect(server.connectionPool).toBeDefined();

      await server.stop();

      expect(server.isServerRunning()).toBe(false);
    });

    test('should handle server startup errors gracefully', async () => {
      // Try to start server on same port twice
      await server.start();

      const duplicateServer = new ServerManager({
        port: testPort, // Same port
        enableConnectionPooling: true,
        enableLogging: false,
        http: {
          enabled: false,
        },
      });

      await expect(duplicateServer.start()).rejects.toThrow();
    });
  });
});
