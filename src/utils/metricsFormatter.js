/**
 * Metrics Formatter Utility
 * Formats server statistics into Prometheus-compatible metrics format
 */

/**
 * Formats server statistics into Prometheus exposition format
 * @param {Object} stats - Server statistics object
 * @returns {string} Prometheus-formatted metrics
 */
function formatPrometheusMetrics(stats) {
  const lines = [];
  const timestamp = Date.now();

  const addMetric = (name, type, help, value, labels = {}) => {
    lines.push(`# HELP ${name} ${help}`);
    lines.push(`# TYPE ${name} ${type}`);

    const labelStr =
      Object.entries(labels).length > 0
        ? `{${Object.entries(labels)
          .map(([k, v]) => `${k}="${v}"`)
          .join(',')}}`
        : '';

    lines.push(`${name}${labelStr} ${value} ${timestamp}`);
    lines.push('');
  };

  // Counter metrics
  addMetric(
    'pg_mock_connections_accepted_total',
    'counter',
    'Total number of connections accepted',
    stats.connectionsAccepted || 0
  );

  addMetric(
    'pg_mock_connections_rejected_total',
    'counter',
    'Total number of connections rejected',
    stats.connectionsRejected || 0
  );

  addMetric(
    'pg_mock_queries_executed_total',
    'counter',
    'Total number of queries executed',
    stats.queriesExecuted || 0
  );

  addMetric(
    'pg_mock_messages_processed_total',
    'counter',
    'Total number of protocol messages processed',
    stats.messagesProcessed || 0
  );

  addMetric('pg_mock_errors_total', 'counter', 'Total number of errors', stats.errors || 0);

  addMetric(
    'pg_mock_bytes_received_total',
    'counter',
    'Total bytes received',
    stats.bytesReceived || 0
  );

  addMetric('pg_mock_bytes_sent_total', 'counter', 'Total bytes sent', stats.bytesSent || 0);

  // Gauge metrics
  addMetric(
    'pg_mock_active_connections',
    'gauge',
    'Current number of active connections',
    stats.activeConnections || 0
  );

  addMetric(
    'pg_mock_uptime_seconds',
    'gauge',
    'Server uptime in seconds',
    Math.floor((stats.uptime || 0) / 1000)
  );

  // Connection pool metrics (if available)
  if (stats.connectionPool) {
    addMetric(
      'pg_mock_pool_total_connections',
      'gauge',
      'Total connections in pool',
      stats.connectionPool.totalConnections || 0
    );

    addMetric(
      'pg_mock_pool_active_connections',
      'gauge',
      'Active connections in pool',
      stats.connectionPool.activeConnections || 0
    );

    addMetric(
      'pg_mock_pool_idle_connections',
      'gauge',
      'Idle connections in pool',
      stats.connectionPool.idleConnections || 0
    );

    addMetric(
      'pg_mock_pool_waiting_requests',
      'gauge',
      'Waiting requests in pool queue',
      stats.connectionPool.waitingRequests || 0
    );
  }

  return lines.join('\n');
}

/**
 * Formats server statistics into JSON status format
 * @param {Object} serverManager - ServerManager instance
 * @returns {Promise<Object>} Detailed status object
 */
async function formatStatusResponse(serverManager) {
  const stats = serverManager.getStats();
  const config = serverManager.config;
  const address = serverManager.getAddress();
  const health = await generateHealthStatus(serverManager);

  return {
    server: {
      status: serverManager.isServerRunning() ? 'running' : 'stopped',
      version: require('../../package.json').version,
      uptime: stats.uptime || 0,
      uptimeFormatted: stats.uptimeString || '0s',
      startedAt: serverManager.startTime ? serverManager.startTime.toISOString() : null,
      isShuttingDown: serverManager.isServerShuttingDown(),
      address: address
        ? {
          address: address.address,
          family: address.family,
          port: address.port,
        }
        : null,
    },
    statistics: {
      connectionsAccepted: stats.connectionsAccepted || 0,
      connectionsRejected: stats.connectionsRejected || 0,
      activeConnections: stats.activeConnections || 0,
      messagesProcessed: stats.messagesProcessed || 0,
      queriesExecuted: stats.queriesExecuted || 0,
      errors: stats.errors || 0,
      bytesReceived: stats.bytesReceived || 0,
      bytesSent: stats.bytesSent || 0,
    },
    configuration: {
      port: config.port,
      host: config.host,
      maxConnections: config.maxConnections,
      enableSSL: config.enableSSL || false,
      authMethod: config.authMethod || 'trust',
      enableConnectionPooling: config.enableConnectionPooling || false,
      logLevel: config.logLevel,
    },
    connectionPool: stats.connectionPool || null,
    health,
  };
}

/**
 * Formats active connections into JSON format
 * @param {Object} serverManager - ServerManager instance
 * @returns {Object} Connections object
 */
function formatConnectionsResponse(serverManager) {
  const connections = serverManager.getConnections();

  return {
    activeConnections: connections.length,
    maxConnections: serverManager.config.maxConnections,
    connections: connections.map(conn => ({
      id: conn.id,
      remoteAddress: conn.remoteAddress,
      remotePort: conn.remotePort,
      user: conn.user || 'unknown',
      database: conn.database || 'unknown',
      connectedAt: conn.connectedAt ? conn.connectedAt.toISOString() : null,
      lastActivity: conn.lastActivity ? conn.lastActivity.toISOString() : null,
      queriesExecuted: conn.queriesExecuted || 0,
      transactionStatus: conn.transactionStatus || 'idle',
      authenticated: conn.authenticated !== false,
    })),
  };
}

/**
 * Generates health status with checks
 * @param {Object} serverManager - ServerManager instance
 * @returns {Promise<Object>} Health status object
 */
async function generateHealthStatus(serverManager) {
  const checks = [];
  let overallStatus = 'healthy';
  const timeoutMs = serverManager.config?.http?.healthCheckTimeout || 5000;

  // Check 1: Server is running
  const serverRunning = serverManager.isServerRunning();
  checks.push({
    name: 'server_running',
    status: serverRunning ? 'pass' : 'fail',
    message: serverRunning ? 'Server is running' : 'Server is not running',
  });
  if (!serverRunning) overallStatus = 'unhealthy';

  // Check 2: Not shutting down
  const notShuttingDown = !serverManager.isServerShuttingDown();
  checks.push({
    name: 'not_shutting_down',
    status: notShuttingDown ? 'pass' : 'fail',
    message: notShuttingDown ? 'Server is accepting connections' : 'Server is shutting down',
  });
  if (!notShuttingDown) overallStatus = 'unhealthy';

  // Check 3: Accepting connections (not at max capacity)
  const activeConnections = serverManager.getActiveConnectionCount();
  const maxConnections =
    typeof serverManager.config.maxConnections === 'number'
      ? serverManager.config.maxConnections
      : Number.POSITIVE_INFINITY;
  const acceptingConnections = activeConnections < maxConnections;
  const capacityLabel = Number.isFinite(maxConnections)
    ? `${activeConnections}/${maxConnections}`
    : `${activeConnections}`;
  checks.push({
    name: 'accepting_connections',
    status: acceptingConnections ? 'pass' : 'warn',
    message: acceptingConnections
      ? `Accepting connections (${capacityLabel})`
      : `At max capacity (${capacityLabel})`,
  });

  // Check 4: Custom health checks
  if (serverManager.config.http && serverManager.config.http.customHealthChecks) {
    for (const customCheck of serverManager.config.http.customHealthChecks) {
      if (!customCheck || typeof customCheck.check !== 'function') {
        checks.push({
          name: customCheck?.name || 'custom_check',
          status: 'fail',
          message: 'Invalid custom health check configuration',
        });
        overallStatus = 'unhealthy';
        continue;
      }

      try {
        const checkTimeout =
          typeof customCheck.timeout === 'number' && customCheck.timeout > 0
            ? customCheck.timeout
            : timeoutMs;
        const checkName = customCheck.name || 'custom_check';
        const result = await runWithTimeout(
          Promise.resolve(customCheck.check(serverManager)),
          checkTimeout,
          `Custom health check timed out after ${checkTimeout}ms`
        );
        const passed =
          result && Object.prototype.hasOwnProperty.call(result, 'passed')
            ? Boolean(result.passed)
            : false;
        checks.push({
          name: checkName,
          status: passed ? 'pass' : 'fail',
          message: result?.message || (passed ? 'Custom check passed' : 'Custom check failed'),
        });
        if (!passed) overallStatus = 'unhealthy';
      } catch (error) {
        checks.push({
          name: customCheck.name || 'custom_check',
          status: 'fail',
          message: `Error: ${error.message}`,
        });
        overallStatus = 'unhealthy';
      }
    }
  }

  return {
    status: overallStatus,
    checks: checks,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Runs a promise with a timeout
 * @param {Promise} promise - Promise to execute
 * @param {number} timeoutMs - Timeout in milliseconds
 * @param {string} timeoutMessage - Error message when timeout occurs
 * @returns {Promise<*>} Promise that resolves or rejects on timeout
 */
function runWithTimeout(promise, timeoutMs, timeoutMessage) {
  const wrappedPromise = Promise.resolve(promise);

  if (!timeoutMs || timeoutMs <= 0) {
    return wrappedPromise;
  }

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(timeoutMessage));
    }, timeoutMs);

    wrappedPromise
      .then(result => {
        clearTimeout(timer);
        resolve(result);
      })
      .catch(error => {
        clearTimeout(timer);
        reject(error);
      });
  });
}

module.exports = {
  formatPrometheusMetrics,
  formatStatusResponse,
  formatConnectionsResponse,
  generateHealthStatus,
};
