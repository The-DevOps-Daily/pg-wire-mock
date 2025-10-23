const http = require('http');

jest.mock('../../src/utils/metricsFormatter', () => ({
  formatStatusResponse: jest.fn(),
  formatConnectionsResponse: jest.fn(),
  formatPrometheusMetrics: jest.fn(),
  generateHealthStatus: jest.fn(),
}));

const {
  formatStatusResponse,
  formatConnectionsResponse,
  formatPrometheusMetrics,
  generateHealthStatus,
} = require('../../src/utils/metricsFormatter');

const { HttpServer } = require('../../src/server/httpServer');

describe('HttpServer monitoring endpoints', () => {
  let nextPort = 36000;
  let server;
  let mockServerManager;

  const request = (port, path, { method = 'GET', headers = {} } = {}) =>
    new Promise((resolve, reject) => {
      const req = http.request(
        {
          hostname: '127.0.0.1',
          port,
          method,
          path,
          headers,
        },
        res => {
          let data = '';
          res.on('data', chunk => {
            data += chunk;
          });
          res.on('end', () => {
            resolve({
              statusCode: res.statusCode,
              headers: res.headers,
              body: data,
            });
          });
        }
      );
      req.on('error', reject);
      req.end();
    });

  const startServer = async (overrides = {}) => {
    const port = overrides.port || nextPort++;

    mockServerManager = {
      getStats: jest.fn().mockReturnValue({ uptime: 1234 }),
      isServerRunning: jest.fn().mockReturnValue(true),
      isServerShuttingDown: jest.fn().mockReturnValue(false),
      getActiveConnectionCount: jest.fn().mockReturnValue(0),
      config: {
        maxConnections: 100,
        http: { healthCheckTimeout: overrides.healthCheckTimeout || 2000 },
      },
    };

    server = new HttpServer(
      {
        enabled: true,
        port,
        host: '127.0.0.1',
        healthCheckTimeout: overrides.healthCheckTimeout ?? 2000,
        ...overrides,
      },
      mockServerManager
    );

    generateHealthStatus.mockResolvedValue({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      checks: [],
    });
    formatStatusResponse.mockResolvedValue({
      server: { status: 'running' },
      health: { status: 'healthy' },
    });
    formatConnectionsResponse.mockReturnValue({ activeConnections: 0, connections: [] });
    formatPrometheusMetrics.mockReturnValue('');

    await server.start();
    return port;
  };

  afterEach(async () => {
    jest.resetAllMocks();
    if (server) {
      await server.stop();
      server = null;
    }
  });

  test('GET /health returns 200 with healthy status', async () => {
    const port = await startServer();
    const healthPayload = {
      status: 'healthy',
      timestamp: '2024-01-01T00:00:00.000Z',
      checks: [],
    };

    generateHealthStatus.mockResolvedValue(healthPayload);

    const response = await request(port, '/health');
    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toEqual({
      status: 'healthy',
      timestamp: healthPayload.timestamp,
      uptime: 1234,
      checks: [],
    });
    expect(generateHealthStatus).toHaveBeenCalledWith(mockServerManager);
  });

  test('GET /health returns 503 when unhealthy', async () => {
    const port = await startServer();
    generateHealthStatus.mockResolvedValue({
      status: 'unhealthy',
      timestamp: '2024-01-01T00:00:00.000Z',
      checks: [{ name: 'custom', status: 'fail', message: 'error' }],
    });

    const response = await request(port, '/health');
    expect(response.statusCode).toBe(503);
    expect(JSON.parse(response.body).status).toBe('unhealthy');
  });

  test('GET /status returns formatter payload', async () => {
    const port = await startServer();
    const statusPayload = { server: { status: 'running' }, health: { status: 'healthy' } };
    formatStatusResponse.mockResolvedValue(statusPayload);

    const response = await request(port, '/status');
    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toEqual(statusPayload);
    expect(formatStatusResponse).toHaveBeenCalledWith(mockServerManager);
  });

  test('GET /metrics returns Prometheus text', async () => {
    const port = await startServer();
    formatPrometheusMetrics.mockReturnValue('pg_mock_uptime_seconds 1 1696170000000');

    const response = await request(port, '/metrics');
    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toContain('text/plain');
    expect(response.body).toContain('pg_mock_uptime_seconds');
    expect(formatPrometheusMetrics).toHaveBeenCalledWith({ uptime: 1234 });
  });

  test('GET /connections returns formatter payload', async () => {
    const port = await startServer();
    const connectionsPayload = { activeConnections: 1, connections: [] };
    formatConnectionsResponse.mockReturnValue(connectionsPayload);

    const response = await request(port, '/connections');
    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toEqual(connectionsPayload);
  });

  test('rejects unauthorized requests when auth is enabled', async () => {
    const port = await startServer({ enableAuth: true, authToken: 'secret' });
    generateHealthStatus.mockResolvedValue({
      status: 'healthy',
      timestamp: '2024-01-01T00:00:00.000Z',
      checks: [],
    });

    const response = await request(port, '/health');
    expect(response.statusCode).toBe(401);

    const authorized = await request(port, '/health', {
      headers: { Authorization: 'Bearer secret' },
    });
    expect(authorized.statusCode).toBe(200);
  });

  test('responds with 405 for unsupported methods', async () => {
    const port = await startServer();
    const response = await request(port, '/health', { method: 'POST' });
    expect(response.statusCode).toBe(405);
  });

  test('response with 204 for CORS preflight', async () => {
    const port = await startServer();
    const response = await request(port, '/health', { method: 'OPTIONS' });
    expect(response.statusCode).toBe(204);
    expect(response.body).toBe('');
  });
});
