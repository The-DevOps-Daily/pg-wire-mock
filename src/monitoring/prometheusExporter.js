/**
 * Prometheus Metrics Exporter for pg-wire-mock
 * Exposes metrics in Prometheus format
 */

const http = require('http');
const url = require('url');

/**
 * Simple Prometheus metrics registry
 */
class PrometheusRegistry {
  constructor() {
    this.metrics = new Map();
  }

  /**
   * Registers a metric
   * @param {string} name - Metric name
   * @param {string} type - Metric type (counter, gauge, histogram)
   * @param {string} help - Metric description
   * @param {string[]} labelNames - Label names for this metric
   */
  register(name, type, help, labelNames = []) {
    this.metrics.set(name, {
      type,
      help,
      labelNames,
      values: new Map(),
    });
  }

  /**
   * Sets a gauge value
   * @param {string} name - Metric name
   * @param {number} value - Metric value
   * @param {Object} labels - Label key-value pairs
   */
  setGauge(name, value, labels = {}) {
    const metric = this.metrics.get(name);
    if (!metric || metric.type !== 'gauge') return;

    const key = this.getLabelKey(labels);
    metric.values.set(key, { value, labels });
  }

  /**
   * Increments a counter
   * @param {string} name - Metric name
   * @param {number} value - Increment value
   * @param {Object} labels - Label key-value pairs
   */
  incrementCounter(name, value = 1, labels = {}) {
    const metric = this.metrics.get(name);
    if (!metric || metric.type !== 'counter') return;

    const key = this.getLabelKey(labels);
    const current = metric.values.get(key) || { value: 0, labels };
    metric.values.set(key, { value: current.value + value, labels });
  }

  /**
   * Sets a counter value (for resetting)
   * @param {string} name - Metric name
   * @param {number} value - Counter value
   * @param {Object} labels - Label key-value pairs
   */
  setCounter(name, value, labels = {}) {
    const metric = this.metrics.get(name);
    if (!metric || metric.type !== 'counter') return;

    const key = this.getLabelKey(labels);
    metric.values.set(key, { value, labels });
  }

  /**
   * Observes a histogram value
   * @param {string} name - Metric name
   * @param {number} value - Observed value
   * @param {Object} labels - Label key-value pairs
   */
  observeHistogram(name, value, labels = {}) {
    const metric = this.metrics.get(name);
    if (!metric || metric.type !== 'histogram') return;

    const key = this.getLabelKey(labels);
    const current = metric.values.get(key) || {
      sum: 0,
      count: 0,
      buckets: new Map(),
      labels,
    };

    current.sum += value;
    current.count++;

    // Standard histogram buckets for timing data
    const buckets = [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10, Infinity];
    buckets.forEach(bucket => {
      if (value <= bucket) {
        current.buckets.set(bucket, (current.buckets.get(bucket) || 0) + 1);
      }
    });

    metric.values.set(key, current);
  }

  /**
   * Generates label key for storage
   * @param {Object} labels - Label key-value pairs
   * @returns {string} Label key
   */
  getLabelKey(labels) {
    return Object.keys(labels)
      .sort()
      .map(key => `${key}="${labels[key]}"`)
      .join(',');
  }

  /**
   * Exports metrics in Prometheus format
   * @returns {string} Prometheus formatted metrics
   */
  export() {
    let output = '';

    for (const [name, metric] of this.metrics) {
      output += `# HELP ${name} ${metric.help}\n`;
      output += `# TYPE ${name} ${metric.type}\n`;

      if (metric.type === 'histogram') {
        for (const [, data] of metric.values) {
          const labelStr = Object.keys(data.labels).length > 0 ?
            `{${Object.keys(data.labels).map(k => `${k}="${data.labels[k]}"`).join(',')}}` : '';

          // Export buckets
          for (const [bucket, count] of data.buckets) {
            const bucketLabel = bucket === Infinity ? '+Inf' : bucket.toString();
            output += `${name}_bucket{le="${bucketLabel}"${labelStr ? ',' + labelStr.slice(1, -1) : ''}} ${count}\n`;
          }

          output += `${name}_sum${labelStr} ${data.sum}\n`;
          output += `${name}_count${labelStr} ${data.count}\n`;
        }
      } else {
        for (const [, data] of metric.values) {
          const labelStr = Object.keys(data.labels).length > 0 ?
            `{${Object.keys(data.labels).map(k => `${k}="${data.labels[k]}"`).join(',')}}` : '';
          output += `${name}${labelStr} ${data.value}\n`;
        }
      }

      output += '\n';
    }

    return output;
  }

  /**
   * Clears all metric values (useful for testing)
   */
  clear() {
    for (const metric of this.metrics.values()) {
      metric.values.clear();
    }
  }
}

/**
 * Prometheus exporter for pg-wire-mock metrics
 */
class PrometheusExporter {
  constructor(config = {}) {
    this.config = {
      port: 9090,
      host: '0.0.0.0',
      endpoint: '/metrics',
      ...config
    };

    this.registry = new PrometheusRegistry();
    this.server = null;
    this.lastStatsUpdate = 0;
    this.setupMetrics();
  }

  /**
   * Sets up Prometheus metrics
   */
  setupMetrics() {
    // Connection metrics
    this.registry.register(
      'pgwire_connections_total',
      'counter',
      'Total number of connections created'
    );

    this.registry.register(
      'pgwire_connections_destroyed_total',
      'counter',
      'Total number of connections destroyed'
    );

    this.registry.register(
      'pgwire_connections_active',
      'gauge',
      'Number of currently active connections'
    );

    this.registry.register(
      'pgwire_connections_idle',
      'gauge',
      'Number of currently idle connections'
    );

    this.registry.register(
      'pgwire_connections_peak',
      'gauge',
      'Peak number of concurrent connections'
    );

    this.registry.register(
      'pgwire_connection_duration_seconds',
      'histogram',
      'Connection lifetime in seconds'
    );

    this.registry.register(
      'pgwire_connection_wait_seconds',
      'histogram',
      'Connection wait time in seconds'
    );

    this.registry.register(
      'pgwire_connection_timeouts_total',
      'counter',
      'Total number of connection timeouts'
    );

    this.registry.register(
      'pgwire_connection_errors_total',
      'counter',
      'Total number of connection errors'
    );

    // Query metrics
    this.registry.register(
      'pgwire_queries_total',
      'counter',
      'Total number of queries executed',
      ['query_type', 'status']
    );

    this.registry.register(
      'pgwire_query_duration_seconds',
      'histogram',
      'Query execution time in seconds'
    );

    this.registry.register(
      'pgwire_slow_queries_total',
      'counter',
      'Total number of slow queries'
    );

    // Protocol metrics
    this.registry.register(
      'pgwire_protocol_messages_total',
      'counter',
      'Total number of protocol messages processed',
      ['message_type']
    );

    this.registry.register(
      'pgwire_protocol_extended_usage_total',
      'counter',
      'Total usage of extended protocol'
    );

    this.registry.register(
      'pgwire_protocol_simple_usage_total',
      'counter',
      'Total usage of simple protocol'
    );

    this.registry.register(
      'pgwire_prepared_statements_total',
      'counter',
      'Total prepared statement operations',
      ['result']
    );

    // Data transfer metrics
    this.registry.register(
      'pgwire_bytes_received_total',
      'counter',
      'Total bytes received from clients'
    );

    this.registry.register(
      'pgwire_bytes_sent_total',
      'counter',
      'Total bytes sent to clients'
    );
  }

  /**
   * Updates metrics from stats collector
   * @param {Object} stats - Statistics from StatsCollector
   */
  updateMetrics(stats) {
    // Connection metrics
    this.registry.setCounter('pgwire_connections_total', stats.connections.totalCreated);
    this.registry.setCounter('pgwire_connections_destroyed_total', stats.connections.totalDestroyed);
    this.registry.setGauge('pgwire_connections_active', stats.connections.currentActive);
    this.registry.setGauge('pgwire_connections_idle', stats.connections.currentIdle);
    this.registry.setGauge('pgwire_connections_peak', stats.connections.peakConnections);
    this.registry.setCounter('pgwire_connection_timeouts_total', stats.connections.connectionTimeouts);
    this.registry.setCounter('pgwire_connection_errors_total', stats.connections.connectionErrors);

    // Query metrics by type and status
    Object.entries(stats.queries.queryTypes).forEach(([type, count]) => {
      this.registry.setCounter('pgwire_queries_total', count, {
        query_type: type.toLowerCase(),
        status: 'success'
      });
    });

    Object.entries(stats.queries.failedQueries).forEach(([type, count]) => {
      this.registry.setCounter('pgwire_queries_total', count, {
        query_type: 'error',
        status: type.toLowerCase()
      });
    });

    this.registry.setCounter('pgwire_slow_queries_total', stats.queries.slowQueries.length);

    // Protocol metrics
    Object.entries(stats.protocol.messageTypes).forEach(([type, count]) => {
      this.registry.setCounter('pgwire_protocol_messages_total', count, {
        message_type: type.toLowerCase()
      });
    });

    this.registry.setCounter('pgwire_protocol_extended_usage_total', stats.protocol.extendedProtocolUsage);
    this.registry.setCounter('pgwire_protocol_simple_usage_total', stats.protocol.simpleProtocolUsage);

    this.registry.setCounter('pgwire_prepared_statements_total', stats.protocol.preparedStatementHits, {
      result: 'hit'
    });
    this.registry.setCounter('pgwire_prepared_statements_total', stats.protocol.preparedStatementMisses, {
      result: 'miss'
    });

    // Calculate total bytes from connection details
    let totalBytesReceived = 0;
    let totalBytesSent = 0;
    stats.connections.details.forEach(conn => {
      totalBytesReceived += conn.bytesReceived || 0;
      totalBytesSent += conn.bytesSent || 0;
    });

    this.registry.setCounter('pgwire_bytes_received_total', totalBytesReceived);
    this.registry.setCounter('pgwire_bytes_sent_total', totalBytesSent);

    this.lastStatsUpdate = Date.now();
  }

  /**
   * Starts the HTTP server
   * @returns {Promise<void>} Promise that resolves when server is listening
   */
  start() {
    return new Promise((resolve, reject) => {
      this.server = http.createServer((req, res) => {
        const parsedUrl = url.parse(req.url, true);

        if (parsedUrl.pathname === this.config.endpoint && req.method === 'GET') {
          res.writeHead(200, {
            'Content-Type': 'text/plain; version=0.0.4; charset=utf-8'
          });
          res.end(this.registry.export());
        } else if (parsedUrl.pathname === '/health' && req.method === 'GET') {
          // Health check endpoint
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            status: 'healthy',
            lastUpdate: this.lastStatsUpdate,
            timestamp: Date.now()
          }));
        } else {
          res.writeHead(404, { 'Content-Type': 'text/plain' });
          res.end('Not Found');
        }
      });

      this.server.on('error', (error) => {
        reject(error);
      });

      this.server.listen(this.config.port, this.config.host, () => {
        resolve();
      });
    });
  }

  /**
   * Stops the HTTP server
   * @returns {Promise<void>} Promise that resolves when server is stopped
   */
  stop() {
    return new Promise((resolve) => {
      if (this.server) {
        this.server.close(() => {
          this.server = null;
          resolve();
        });
      } else {
        resolve();
      }
    });
  }

  /**
   * Gets the metrics endpoint URL
   * @returns {string} Metrics endpoint URL
   */
  getMetricsUrl() {
    return `http://${this.config.host}:${this.config.port}${this.config.endpoint}`;
  }

  /**
   * Gets the health check endpoint URL
   * @returns {string} Health check endpoint URL
   */
  getHealthUrl() {
    return `http://${this.config.host}:${this.config.port}/health`;
  }
}

module.exports = {
  PrometheusExporter,
  PrometheusRegistry,
};
