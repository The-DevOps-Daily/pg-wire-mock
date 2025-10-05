/**
 * @jest-environment node
 */

const http = require('http');
const { StatsCollector } = require('../../src/monitoring/statsCollector');
const { PrometheusExporter } = require('../../src/monitoring/prometheusExporter');

describe('Monitoring Integration Tests', () => {
  let statsCollector;
  let prometheusExporter;
  const testPort = 19091;

  beforeEach(() => {
    statsCollector = new StatsCollector({
      enabled: true,
      histogramSize: 100,
      cleanupInterval: 60000
    });
    
    prometheusExporter = new PrometheusExporter({
      port: testPort,
      host: 'localhost'
    });
  });

  afterEach(async () => {
    if (statsCollector) {
      statsCollector.destroy();
    }
    if (prometheusExporter) {
      await prometheusExporter.stop();
    }
  });

  test('should integrate stats collection with Prometheus export', async () => {
    // Simulate some activity
    const connectionId = 'test-conn-1';
    
    // Connection lifecycle
    statsCollector.recordConnectionCreated(connectionId);
    
    // Query execution
    statsCollector.recordQuery(connectionId, 'SELECT * FROM users', 10, true);
    
    // Protocol messages
    statsCollector.recordProtocolMessage('QUERY');
    statsCollector.recordProtocolMessage('PARSE');
    statsCollector.recordProtocolMessage('EXECUTE');
    
    // Update Prometheus metrics and start server
    const stats = statsCollector.getStats();
    prometheusExporter.updateMetrics(stats);
    await prometheusExporter.start();
    
    // Fetch metrics
    const response = await makeHttpRequest(`http://localhost:${testPort}/metrics`);
    const body = response.body;
    
    // Verify integration
    expect(response.statusCode).toBe(200);
    expect(body).toContain('pgwire_connections_total 1');
    expect(body).toContain('pgwire_queries_total{query_type="select",status="success"} 1');
    expect(body).toContain('pgwire_protocol_messages_total{message_type="query"} 1');
    expect(body).toContain('pgwire_protocol_messages_total{message_type="parse"} 1');
    expect(body).toContain('pgwire_protocol_messages_total{message_type="execute"} 1');
  });

  test('should handle continuous monitoring updates', async () => {
    await prometheusExporter.start();
    
    // Simulate continuous activity
    for (let i = 0; i < 5; i++) {
      const connectionId = `conn-${i}`;
      
      // Connection and query activity
      statsCollector.recordConnectionCreated(connectionId);
      statsCollector.recordQuery(connectionId, 'SELECT 1', 5 + i, true);
      statsCollector.recordProtocolMessage('QUERY');
      
      // Update metrics
      const stats = statsCollector.getStats();
      prometheusExporter.updateMetrics(stats);
    }
    
    // Fetch final metrics
    const response = await makeHttpRequest(`http://localhost:${testPort}/metrics`);
    const body = response.body;
    
    expect(body).toContain('pgwire_connections_total 5');
    expect(body).toContain('pgwire_queries_total{query_type="select",status="success"} 5');
    expect(body).toContain('pgwire_protocol_messages_total{message_type="query"} 5');
  });

  test('should track query latency percentiles correctly', async () => {
    // Generate queries with different latencies
    const latencies = [5, 10, 15, 20, 25, 50, 100, 200, 500, 1000];
    
    latencies.forEach((latency, index) => {
      const connectionId = `conn-${index}`;
      statsCollector.recordConnectionCreated(connectionId);
      statsCollector.recordQuery(connectionId, 'SELECT 1', latency, true);
    });
    
    const stats = statsCollector.getStats();
    prometheusExporter.updateMetrics(stats);
    await prometheusExporter.start();
    
    const response = await makeHttpRequest(`http://localhost:${testPort}/metrics`);
    const body = response.body;
    
    // Check histogram buckets
    expect(body).toContain('pgwire_query_duration_seconds_bucket{le="0.01"} 2'); // 5ms, 10ms
    expect(body).toContain('pgwire_query_duration_seconds_bucket{le="0.1"} 7'); // up to 100ms
    expect(body).toContain('pgwire_query_duration_seconds_bucket{le="1"} 9'); // up to 1000ms
    expect(body).toContain('pgwire_query_duration_seconds_count 10');
  });

  test('should handle error scenarios gracefully', async () => {
    const connectionId = 'error-conn';
    
    // Connection errors
    statsCollector.recordConnectionError();
    statsCollector.recordConnectionTimeout();
    
    // Query errors
    statsCollector.recordConnectionCreated(connectionId);
    statsCollector.recordQuery(connectionId, 'INVALID SQL', 5, false, 'SYNTAX_ERROR');
    
    const stats = statsCollector.getStats();
    prometheusExporter.updateMetrics(stats);
    await prometheusExporter.start();
    
    const response = await makeHttpRequest(`http://localhost:${testPort}/metrics`);
    const body = response.body;
    
    expect(body).toContain('pgwire_connection_errors_total 1');
    expect(body).toContain('pgwire_connection_timeouts_total 1');
    expect(body).toContain('pgwire_queries_total{query_type="error",status="syntax_error"} 1');
  });

  test('should provide health check information', async () => {
    // Generate some activity first
    statsCollector.recordConnectionCreated('health-conn');
    statsCollector.recordQuery('health-conn', 'SELECT 1', 10, true);
    
    const stats = statsCollector.getStats();
    prometheusExporter.updateMetrics(stats);
    await prometheusExporter.start();
    
    const response = await makeHttpRequest(`http://localhost:${testPort}/health`);
    const healthData = JSON.parse(response.body);
    
    expect(response.statusCode).toBe(200);
    expect(healthData).toHaveProperty('status', 'healthy');
    expect(healthData).toHaveProperty('timestamp');
    expect(healthData).toHaveProperty('lastUpdate');
    expect(healthData).toHaveProperty('metrics');
    expect(healthData.metrics).toHaveProperty('totalConnections', 1);
    expect(healthData.metrics).toHaveProperty('totalQueries', 1);
  });

  test('should handle disabled monitoring gracefully', async () => {
    // Create disabled stats collector
    const disabledStats = new StatsCollector({ enableMetrics: false });
    
    // Try to record metrics (should be no-ops)
    disabledStats.recordConnectionCreated('test');
    disabledStats.recordQuery('test', 'SELECT 1', 10, true);
    
    const stats = disabledStats.getStats();
    
    // Should have empty/default stats
    expect(stats.connections.totalCreated).toBe(0);
    expect(stats.queries.queryTypes).toEqual({
      SELECT: 0,
      INSERT: 0,
      UPDATE: 0,
      DELETE: 0,
      SHOW: 0,
      BEGIN: 0,
      COMMIT: 0,
      ROLLBACK: 0,
      OTHER: 0,
    });
    expect(stats.protocol.messageTypes).toEqual({
      QUERY: 0,
      PARSE: 0,
      BIND: 0,
      EXECUTE: 0,
      SYNC: 0,
      TERMINATE: 0,
    });
    
    disabledStats.destroy();
  });

  test('should handle memory cleanup properly', async () => {
    // Generate many connections to test cleanup
    for (let i = 0; i < 50; i++) {
      const connectionId = `cleanup-conn-${i}`;
      statsCollector.recordConnectionCreated(connectionId);
      statsCollector.recordQuery(connectionId, `SELECT ${i}`, 10, true);
      
      // Close some connections
      if (i % 2 === 0) {
        statsCollector.recordConnectionDestroyed(connectionId);
      }
    }
    
    const initialStats = statsCollector.getStats();
    expect(initialStats.connections.details.length).toBe(25); // Only active connections
    
    // Test cleanup
    statsCollector.destroy();
    
    // Create new collector to verify cleanup worked
    const newCollector = new StatsCollector({ enableMetrics: true });
    const cleanStats = newCollector.getStats();
    
    expect(cleanStats.connections.totalCreated).toBe(0);
    expect(cleanStats.connections.details.length).toBe(0);
    
    newCollector.destroy();
  });

  test('should emit events during integration', (done) => {
    let eventCount = 0;
    const expectedEvents = ['connectionCreated', 'queryCompleted', 'protocolMessage'];
    
    expectedEvents.forEach(eventType => {
      statsCollector.on(eventType, () => {
        eventCount++;
        if (eventCount === expectedEvents.length) {
          done();
        }
      });
    });
    
    // Trigger events
    statsCollector.recordConnectionCreated('event-conn');
    statsCollector.recordQuery('event-conn', 'SELECT 1', 10, true);
    statsCollector.recordProtocolMessage('Query');
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