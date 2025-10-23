const {
  formatPrometheusMetrics,
  formatStatusResponse,
  formatConnectionsResponse,
  generateHealthStatus,
} = require('../../src/utils/metricsFormatter');

const { version } = require('../../package.json');

function createServerManager(overrides = {}) {
  const stats = overrides.stats || {
    connectionsAccepted: 10,
    connectionsRejected: 1,
    activeConnections: overrides.activeConnections ?? 2,
    messagesProcessed: 100,
    queriesExecuted: 50,
    errors: 0,
    bytesReceived: 1024,
    bytesSent: 2048,
    uptime: 2000,
    uptimeString: '2s',
  };

  const config = {
    port: 5432,
    host: 'localhost',
    maxConnections: 100,
    enableConnectionPooling: false,
    authMethod: 'trust',
    logLevel: 'info',
    http: {
      enabled: true,
      port: 8080,
      host: '127.0.0.1',
      healthCheckTimeout: 5000,
      customHealthChecks: [],
      ...(overrides.config?.http || {}),
    },
    ...overrides.config,
  };

  return {
    getStats: jest.fn().mockReturnValue(stats),
    config,
    getAddress: jest.fn().mockReturnValue(
      overrides.address || { address: '127.0.0.1', family: 'IPv4', port: 5432 }
    ),
    isServerRunning: jest.fn().mockReturnValue(
      overrides.isServerRunning !== undefined ? overrides.isServerRunning : true
    ),
    isServerShuttingDown: jest.fn().mockReturnValue(
      overrides.isServerShuttingDown !== undefined ? overrides.isServerShuttingDown : false
    ),
    getActiveConnectionCount: jest
      .fn()
      .mockReturnValue(overrides.activeConnections ?? stats.activeConnections ?? 0),
    getConnections: jest.fn().mockReturnValue(overrides.connections || []),
  };
}

describe('metricsFormatter', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  test('formatPrometheusMetrics renders counters and gauges', () => {
    const metrics = formatPrometheusMetrics({
      connectionsAccepted: 5,
      connectionsRejected: 1,
      queriesExecuted: 3,
      messagesProcessed: 7,
      errors: 0,
      bytesReceived: 512,
      bytesSent: 256,
      activeConnections: 2,
      uptime: 4000,
    });

    expect(metrics).toContain('pg_mock_connections_accepted_total');
    expect(metrics).toContain('pg_mock_uptime_seconds');
    expect(metrics).toContain('pg_mock_active_connections');
  });

  test('formatStatusResponse includes health information', async () => {
    const manager = createServerManager();
    const status = await formatStatusResponse(manager);

    expect(status.server.status).toBe('running');
    expect(status.server.version).toBe(version);
    expect(status.health.status).toBe('healthy');
    expect(Array.isArray(status.health.checks)).toBe(true);
  });

  test('formatConnectionsResponse maps active connections', () => {
    const now = new Date();
    const manager = createServerManager({
      config: { maxConnections: 10 },
      connections: [
        {
          id: 'conn-1',
          remoteAddress: '127.0.0.1',
          remotePort: 12345,
          connectedAt: now,
          lastActivity: now,
          user: 'postgres',
          database: 'postgres',
          queriesExecuted: 2,
          transactionStatus: 'idle',
          authenticated: true,
        },
      ],
    });

    const connections = formatConnectionsResponse(manager);
    expect(connections.activeConnections).toBe(1);
    expect(connections.maxConnections).toBe(10);
    expect(connections.connections[0].user).toBe('postgres');
  });

  test('generateHealthStatus returns healthy by default and includes checks', async () => {
    const manager = createServerManager();
    const health = await generateHealthStatus(manager);

    expect(health.status).toBe('healthy');
    expect(health.checks.find(check => check.name === 'server_running')).toBeDefined();
    expect(health.checks.find(check => check.name === 'accepting_connections').status).toBe('pass');
  });

  test('generateHealthStatus marks failed or timed out custom checks as unhealthy', async () => {
    jest.useFakeTimers();

    const manager = createServerManager({
      config: {
        http: {
          customHealthChecks: [
            {
              name: 'fail_check',
              check: async () => ({ passed: false, message: 'Downstream failure' }),
            },
            {
              name: 'timeout_check',
              timeout: 10,
              check: () => new Promise(() => {}), // never resolves
            },
            {
              name: 'invalid_check',
            },
          ],
          healthCheckTimeout: 20,
        },
      },
    });

    const healthPromise = generateHealthStatus(manager);
    await Promise.resolve();
    await Promise.resolve();
    jest.advanceTimersByTime(50);
    await jest.runOnlyPendingTimersAsync();
    await Promise.resolve();

    const health = await healthPromise;

    expect(health.status).toBe('unhealthy');
    const failCheck = health.checks.find(check => check.name === 'fail_check');
    expect(failCheck.status).toBe('fail');
    expect(failCheck.message).toBe('Downstream failure');

    const timeoutCheck = health.checks.find(check => check.name === 'timeout_check');
    expect(timeoutCheck.status).toBe('fail');
    expect(timeoutCheck.message).toMatch(/timed out/i);

    const invalidCheck = health.checks.find(check => check.name === 'invalid_check');
    expect(invalidCheck.status).toBe('fail');
    expect(invalidCheck.message).toMatch(/invalid/i);
  });
});
