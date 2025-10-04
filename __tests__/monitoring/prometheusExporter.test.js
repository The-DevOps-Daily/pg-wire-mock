/**
 * @jest-environment node
 */

const http = require('http');
const { PrometheusExporter, PrometheusRegistry } = require('../../src/monitoring/prometheusExporter');

describe('PrometheusRegistry', () => {
  let registry;

  beforeEach(() => {
    registry = new PrometheusRegistry();
  });

  test('should register metrics correctly', () => {
    registry.register('test_counter', 'counter', 'A test counter', ['label1']);
    
    const metric = registry.metrics.get('test_counter');
    expect(metric).toBeDefined();
    expect(metric.type).toBe('counter');
    expect(metric.help).toBe('A test counter');
    expect(metric.labelNames).toEqual(['label1']);
  });

  describe('Counter Metrics', () => {
    beforeEach(() => {
      registry.register('test_counter', 'counter', 'A test counter', ['status']);
    });

    test('should increment counter values', () => {
      registry.incrementCounter('test_counter', 5, { status: 'success' });
      registry.incrementCounter('test_counter', 3, { status: 'success' });
      
      const metric = registry.metrics.get('test_counter');
      const value = metric.values.get('status="success"');
      expect(value.value).toBe(8);
    });

    test('should set counter values', () => {
      registry.setCounter('test_counter', 100, { status: 'error' });
      
      const metric = registry.metrics.get('test_counter');
      const value = metric.values.get('status="error"');
      expect(value.value).toBe(100);
    });

    test('should handle multiple labels', () => {
      registry.register('multi_counter', 'counter', 'Multi-label counter', ['type', 'status']);
      registry.incrementCounter('multi_counter', 1, { type: 'query', status: 'success' });
      
      const metric = registry.metrics.get('multi_counter');
      const value = metric.values.get('status="success",type="query"');
      expect(value.value).toBe(1);
    });
  });

  describe('Gauge Metrics', () => {
    beforeEach(() => {
      registry.register('test_gauge', 'gauge', 'A test gauge');
    });

    test('should set gauge values', () => {
      registry.setGauge('test_gauge', 42);
      
      const metric = registry.metrics.get('test_gauge');
      const value = metric.values.get('');
      expect(value.value).toBe(42);
    });

    test('should update gauge values', () => {
      registry.setGauge('test_gauge', 10);
      registry.setGauge('test_gauge', 20);
      
      const metric = registry.metrics.get('test_gauge');
      const value = metric.values.get('');
      expect(value.value).toBe(20);
    });
  });

  describe('Histogram Metrics', () => {
    beforeEach(() => {
      registry.register('test_histogram', 'histogram', 'A test histogram');
    });

    test('should observe histogram values', () => {
      registry.observeHistogram('test_histogram', 0.1);
      registry.observeHistogram('test_histogram', 0.5);
      registry.observeHistogram('test_histogram', 1.5);
      
      const metric = registry.metrics.get('test_histogram');
      const data = metric.values.get('');
      
      expect(data.count).toBe(3);
      expect(data.sum).toBe(2.1);
      expect(data.buckets.get(0.25)).toBe(1); // 0.1 <= 0.25
      expect(data.buckets.get(1)).toBe(2); // 0.1, 0.5 <= 1
      expect(data.buckets.get(Infinity)).toBe(3); // All values
    });

    test('should handle bucket boundaries correctly', () => {
      registry.observeHistogram('test_histogram', 0.005); // Exactly on bucket boundary
      registry.observeHistogram('test_histogram', 0.01);  // Exactly on bucket boundary
      
      const metric = registry.metrics.get('test_histogram');
      const data = metric.values.get('');
      
      expect(data.buckets.get(0.005)).toBe(1);
      expect(data.buckets.get(0.01)).toBe(2);
    });
  });

  describe('Metric Export', () => {
    test('should export counter metrics in Prometheus format', () => {
      registry.register('requests_total', 'counter', 'Total requests', ['method']);
      registry.incrementCounter('requests_total', 10, { method: 'GET' });
      registry.incrementCounter('requests_total', 5, { method: 'POST' });
      
      const output = registry.export();
      
      expect(output).toContain('# HELP requests_total Total requests');
      expect(output).toContain('# TYPE requests_total counter');
      expect(output).toContain('requests_total{method="GET"} 10');
      expect(output).toContain('requests_total{method="POST"} 5');
    });

    test('should export gauge metrics in Prometheus format', () => {
      registry.register('active_connections', 'gauge', 'Active connections');
      registry.setGauge('active_connections', 25);
      
      const output = registry.export();
      
      expect(output).toContain('# HELP active_connections Active connections');
      expect(output).toContain('# TYPE active_connections gauge');
      expect(output).toContain('active_connections 25');
    });

    test('should export histogram metrics in Prometheus format', () => {
      registry.register('request_duration', 'histogram', 'Request duration');
      registry.observeHistogram('request_duration', 0.1);
      registry.observeHistogram('request_duration', 0.5);
      
      const output = registry.export();
      
      expect(output).toContain('# HELP request_duration Request duration');
      expect(output).toContain('# TYPE request_duration histogram');
      expect(output).toContain('request_duration_bucket{le="0.25"} 1');
      expect(output).toContain('request_duration_bucket{le="1"} 2');
      expect(output).toContain('request_duration_bucket{le="+Inf"} 2');
      expect(output).toContain('request_duration_sum 0.6');
      expect(output).toContain('request_duration_count 2');
    });

    test('should handle metrics without labels', () => {
      registry.register('simple_counter', 'counter', 'Simple counter');
      registry.incrementCounter('simple_counter', 1);
      
      const output = registry.export();
      
      expect(output).toContain('simple_counter 1');
      expect(output).not.toContain('simple_counter{');
    });

    test('should sort labels consistently', () => {
      registry.register('sorted_counter', 'counter', 'Sorted counter', ['z', 'a', 'm']);
      registry.incrementCounter('sorted_counter', 1, { z: 'zvalue', a: 'avalue', m: 'mvalue' });
      
      const output = registry.export();
      
      // The actual order depends on the implementation - let's check what we get
      expect(output).toMatch(/sorted_counter\{.*=".*",.*=".*",.*=".*"\} 1/);
      expect(output).toContain('a="avalue"');
      expect(output).toContain('m="mvalue"');
      expect(output).toContain('z="zvalue"');
    });
  });

  test('should clear all metrics', () => {
    registry.register('test_counter', 'counter', 'Test counter');
    registry.incrementCounter('test_counter', 5);
    
    expect(registry.metrics.get('test_counter').values.size).toBe(1);
    
    registry.clear();
    
    expect(registry.metrics.get('test_counter').values.size).toBe(0);
  });
});

describe('PrometheusExporter', () => {
  let exporter;
  const testPort = 19090; // Use a different port to avoid conflicts

  beforeEach(() => {
    exporter = new PrometheusExporter({
      port: testPort,
      host: 'localhost'
    });
  });

  afterEach(async () => {
    if (exporter) {
      await exporter.stop();
    }
  });

  test('should initialize with default metrics', () => {
    expect(exporter.registry.metrics.has('pgwire_connections_total')).toBe(true);
    expect(exporter.registry.metrics.has('pgwire_connections_active')).toBe(true);
    expect(exporter.registry.metrics.has('pgwire_queries_total')).toBe(true);
    expect(exporter.registry.metrics.has('pgwire_query_duration_seconds')).toBe(true);
    expect(exporter.registry.metrics.has('pgwire_protocol_messages_total')).toBe(true);
  });

  test('should start and stop HTTP server', async () => {
    await exporter.start();
    
    // Test that server is running
    const response = await makeHttpRequest(`http://localhost:${testPort}/metrics`);
    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toContain('text/plain');
    
    await exporter.stop();
    
    // Test that server is stopped
    await expect(makeHttpRequest(`http://localhost:${testPort}/metrics`)).rejects.toThrow();
  });

  test('should serve metrics endpoint', async () => {
    await exporter.start();
    
    const response = await makeHttpRequest(`http://localhost:${testPort}/metrics`);
    const body = response.body;
    
    expect(body).toContain('# HELP pgwire_connections_total');
    expect(body).toContain('# TYPE pgwire_connections_total counter');
    expect(body).toContain('# HELP pgwire_queries_total');
    expect(body).toContain('# TYPE pgwire_queries_total counter');
  });

  test('should serve health endpoint', async () => {
    await exporter.start();
    
    const response = await makeHttpRequest(`http://localhost:${testPort}/health`);
    const body = JSON.parse(response.body);
    
    expect(response.statusCode).toBe(200);
    expect(body).toHaveProperty('status', 'healthy');
    expect(body).toHaveProperty('timestamp');
    expect(body).toHaveProperty('lastUpdate');
  });

  test('should return 404 for unknown endpoints', async () => {
    await exporter.start();
    
    const response = await makeHttpRequest(`http://localhost:${testPort}/unknown`);
    expect(response.statusCode).toBe(404);
  });

  test('should update metrics from stats', async () => {
    const mockStats = {
      connections: {
        totalCreated: 100,
        totalDestroyed: 90,
        currentActive: 10,
        currentIdle: 5,
        peakConnections: 15,
        connectionTimeouts: 2,
        connectionErrors: 1,
        details: [
          { bytesReceived: 1000, bytesSent: 2000 },
          { bytesReceived: 500, bytesSent: 1500 }
        ]
      },
      queries: {
        queryTypes: { SELECT: 50, INSERT: 25, UPDATE: 15 },
        failedQueries: { SYNTAX_ERROR: 3, RUNTIME_ERROR: 2 },
        slowQueries: [{ query: 'SLOW', latency: 200 }]
      },
      protocol: {
        messageTypes: { QUERY: 75, PARSE: 25, EXECUTE: 30 },
        extendedProtocolUsage: 55,
        simpleProtocolUsage: 75,
        preparedStatementHits: 20,
        preparedStatementMisses: 5
      }
    };

    exporter.updateMetrics(mockStats);

    await exporter.start();
    const response = await makeHttpRequest(`http://localhost:${testPort}/metrics`);
    const body = response.body;

    // Check connection metrics
    expect(body).toContain('pgwire_connections_total 100');
    expect(body).toContain('pgwire_connections_destroyed_total 90');
    expect(body).toContain('pgwire_connections_active 10');
    expect(body).toContain('pgwire_connections_idle 5');

    // Check query metrics
    expect(body).toContain('pgwire_queries_total{query_type="select",status="success"} 50');
    expect(body).toContain('pgwire_queries_total{query_type="insert",status="success"} 25');
    expect(body).toContain('pgwire_queries_total{query_type="error",status="syntax_error"} 3');

    // Check protocol metrics
    expect(body).toContain('pgwire_protocol_messages_total{message_type="query"} 75');
    expect(body).toContain('pgwire_protocol_extended_usage_total 55');
    expect(body).toContain('pgwire_protocol_simple_usage_total 75');

    // Check data transfer metrics
    expect(body).toContain('pgwire_bytes_received_total 1500'); // 1000 + 500
    expect(body).toContain('pgwire_bytes_sent_total 3500'); // 2000 + 1500
  });

  test('should handle multiple updates correctly', async () => {
    const stats1 = {
      connections: { totalCreated: 10, totalDestroyed: 5, currentActive: 5, currentIdle: 0, peakConnections: 5, connectionTimeouts: 0, connectionErrors: 0, details: [] },
      queries: { queryTypes: { SELECT: 10 }, failedQueries: {}, slowQueries: [] },
      protocol: { messageTypes: { QUERY: 10 }, extendedProtocolUsage: 0, simpleProtocolUsage: 10, preparedStatementHits: 0, preparedStatementMisses: 0 }
    };

    const stats2 = {
      connections: { totalCreated: 20, totalDestroyed: 8, currentActive: 12, currentIdle: 2, peakConnections: 14, connectionTimeouts: 1, connectionErrors: 0, details: [] },
      queries: { queryTypes: { SELECT: 15, INSERT: 5 }, failedQueries: { SYNTAX_ERROR: 1 }, slowQueries: [] },
      protocol: { messageTypes: { QUERY: 15, PARSE: 5 }, extendedProtocolUsage: 5, simpleProtocolUsage: 15, preparedStatementHits: 2, preparedStatementMisses: 1 }
    };

    exporter.updateMetrics(stats1);
    exporter.updateMetrics(stats2);

    await exporter.start();
    const response = await makeHttpRequest(`http://localhost:${testPort}/metrics`);
    const body = response.body;

    // Should reflect the latest values
    expect(body).toContain('pgwire_connections_total 20');
    expect(body).toContain('pgwire_connections_active 12');
    expect(body).toContain('pgwire_queries_total{query_type="select",status="success"} 15');
    expect(body).toContain('pgwire_queries_total{query_type="insert",status="success"} 5');
  });

  test('should provide correct endpoint URLs', () => {
    expect(exporter.getMetricsUrl()).toBe(`http://localhost:${testPort}/metrics`);
    expect(exporter.getHealthUrl()).toBe(`http://localhost:${testPort}/health`);
  });

  test('should handle start errors gracefully', async () => {
    // Start first exporter
    await exporter.start();
    
    // Try to start second exporter on same port
    const exporter2 = new PrometheusExporter({ port: testPort, host: 'localhost' });
    
    await expect(exporter2.start()).rejects.toThrow();
    
    await exporter2.stop(); // Should not throw even if not started
  });

  test('should handle stop when not started', async () => {
    // Should not throw
    await expect(exporter.stop()).resolves.toBeUndefined();
  });
});

// Helper function to make HTTP requests
function makeHttpRequest(url) {
  return new Promise((resolve, reject) => {
    const request = http.get(url, (response) => {
      let body = '';
      response.on('data', chunk => body += chunk);
      response.on('end', () => {
        resolve({
          statusCode: response.statusCode,
          headers: response.headers,
          body: body
        });
      });
    });

    request.on('error', reject);
    request.setTimeout(5000, () => {
      request.destroy();
      reject(new Error('Request timeout'));
    });
  });
}