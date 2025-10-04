/**
 * Comprehensive Statistics Collector for pg-wire-mock
 * Tracks detailed metrics for monitoring and observability
 */

const EventEmitter = require('events');

/**
 * Ring buffer for efficient histogram storage
 */
class RingBuffer {
  constructor(size = 1000) {
    this.buffer = new Array(size);
    this.size = size;
    this.index = 0;
    this.count = 0;
  }

  push(value) {
    this.buffer[this.index] = value;
    this.index = (this.index + 1) % this.size;
    this.count = Math.min(this.count + 1, this.size);
  }

  getPercentile(percentile) {
    if (this.count === 0) return 0;
    
    const values = this.buffer.slice(0, this.count).sort((a, b) => a - b);
    const index = Math.ceil((percentile / 100) * values.length) - 1;
    return values[Math.max(0, index)];
  }

  getStats() {
    return {
      count: this.count,
      p50: this.getPercentile(50),
      p90: this.getPercentile(90),
      p95: this.getPercentile(95),
      p99: this.getPercentile(99),
    };
  }
}

/**
 * Comprehensive statistics collector
 */
class StatsCollector extends EventEmitter {
  constructor(config = {}) {
    super();
    
    this.config = {
      enableMetrics: true,
      slowQueryThreshold: 100, // ms
      histogramSize: 1000,
      retentionPeriod: 3600 * 1000, // 1 hour
      ...config
    };

    // Connection metrics
    this.connectionMetrics = {
      totalCreated: 0,
      totalDestroyed: 0,
      currentActive: 0,
      currentIdle: 0,
      peakConnections: 0,
      connectionWaitTimes: new RingBuffer(this.config.histogramSize),
      connectionLifetimes: new RingBuffer(this.config.histogramSize),
      connectionTimeouts: 0,
      connectionErrors: 0,
    };

    // Query metrics
    this.queryMetrics = {
      totalQueries: 0,
      queriesPerSecond: 0,
      queryLatencies: new RingBuffer(this.config.histogramSize),
      slowQueries: [],
      queryTypes: {
        SELECT: 0,
        INSERT: 0,
        UPDATE: 0,
        DELETE: 0,
        SHOW: 0,
        BEGIN: 0,
        COMMIT: 0,
        ROLLBACK: 0,
        OTHER: 0,
      },
      failedQueries: {
        SYNTAX_ERROR: 0,
        RUNTIME_ERROR: 0,
        TIMEOUT: 0,
        OTHER: 0,
      },
    };

    // Protocol metrics
    this.protocolMetrics = {
      messageTypes: {
        QUERY: 0,
        PARSE: 0,
        BIND: 0,
        EXECUTE: 0,
        SYNC: 0,
        TERMINATE: 0,
      },
      extendedProtocolUsage: 0,
      simpleProtocolUsage: 0,
      preparedStatementHits: 0,
      preparedStatementMisses: 0,
    };

    // Per-connection tracking
    this.connectionDetails = new Map();

    // Start periodic cleanup
    this.startCleanup();
  }

  /**
   * Records a new connection
   * @param {string} connectionId - Connection identifier
   * @param {Object} metadata - Connection metadata
   */
  recordConnectionCreated(connectionId, metadata = {}) {
    if (!this.config.enableMetrics) return;

    this.connectionMetrics.totalCreated++;
    this.connectionMetrics.currentActive++;
    this.connectionMetrics.peakConnections = Math.max(
      this.connectionMetrics.peakConnections,
      this.connectionMetrics.currentActive + this.connectionMetrics.currentIdle
    );

    this.connectionDetails.set(connectionId, {
      createdAt: Date.now(),
      queriesExecuted: 0,
      bytesReceived: 0,
      bytesSent: 0,
      state: 'active',
      lastActivity: Date.now(),
      ...metadata,
    });

    this.emit('connectionCreated', { connectionId, metadata });
  }

  /**
   * Records connection destruction
   * @param {string} connectionId - Connection identifier
   * @param {string} reason - Reason for closure
   */
  recordConnectionDestroyed(connectionId, reason = 'unknown') {
    if (!this.config.enableMetrics) return;

    const details = this.connectionDetails.get(connectionId);
    if (details) {
      const lifetime = Date.now() - details.createdAt;
      this.connectionMetrics.connectionLifetimes.push(lifetime);
      this.connectionDetails.delete(connectionId);
    }

    this.connectionMetrics.totalDestroyed++;
    this.connectionMetrics.currentActive = Math.max(0, this.connectionMetrics.currentActive - 1);

    this.emit('connectionDestroyed', { connectionId, reason });
  }

  /**
   * Records connection wait time
   * @param {number} waitTimeMs - Time spent waiting for connection
   */
  recordConnectionWait(waitTimeMs) {
    if (!this.config.enableMetrics) return;
    this.connectionMetrics.connectionWaitTimes.push(waitTimeMs);
  }

  /**
   * Records connection timeout
   */
  recordConnectionTimeout() {
    if (!this.config.enableMetrics) return;
    this.connectionMetrics.connectionTimeouts++;
  }

  /**
   * Records connection error
   */
  recordConnectionError() {
    if (!this.config.enableMetrics) return;
    this.connectionMetrics.connectionErrors++;
  }

  /**
   * Records connection state change
   * @param {string} connectionId - Connection identifier
   * @param {string} state - New state (active, idle, in-transaction)
   */
  recordConnectionStateChange(connectionId, state) {
    if (!this.config.enableMetrics) return;

    const details = this.connectionDetails.get(connectionId);
    if (details) {
      details.state = state;
      details.lastActivity = Date.now();
    }
  }

  /**
   * Records query execution
   * @param {string} connectionId - Connection identifier
   * @param {string} query - SQL query string
   * @param {number} latencyMs - Execution time in milliseconds
   * @param {boolean} success - Whether query succeeded
   * @param {Error} error - Error object if query failed
   */
  recordQuery(connectionId, query, latencyMs, success = true, error = null) {
    if (!this.config.enableMetrics) return;

    this.queryMetrics.totalQueries++;
    this.queryMetrics.queryLatencies.push(latencyMs);

    // Update connection details
    const details = this.connectionDetails.get(connectionId);
    if (details) {
      details.queriesExecuted++;
      details.lastActivity = Date.now();
    }

    // Track query type
    const queryType = this.extractQueryType(query);
    if (this.queryMetrics.queryTypes[queryType] !== undefined) {
      this.queryMetrics.queryTypes[queryType]++;
    } else {
      this.queryMetrics.queryTypes.OTHER++;
    }

    // Track slow queries
    if (latencyMs >= this.config.slowQueryThreshold) {
      this.queryMetrics.slowQueries.push({
        query: query.substring(0, 200), // Truncate for storage
        latency: latencyMs,
        timestamp: Date.now(),
        connectionId,
      });

      // Keep only recent slow queries
      const cutoff = Date.now() - this.config.retentionPeriod;
      this.queryMetrics.slowQueries = this.queryMetrics.slowQueries.filter(
        sq => sq.timestamp > cutoff
      );
    }

    // Track failures
    if (!success && error) {
      const errorType = this.classifyError(error);
      if (this.queryMetrics.failedQueries[errorType] !== undefined) {
        this.queryMetrics.failedQueries[errorType]++;
      } else {
        this.queryMetrics.failedQueries.OTHER++;
      }
    }

    this.emit('queryExecuted', { connectionId, query, latencyMs, success, error });
  }

  /**
   * Records protocol message
   * @param {string} messageType - Type of protocol message
   * @param {boolean} isExtended - Whether using extended protocol
   */
  recordProtocolMessage(messageType, isExtended = false) {
    if (!this.config.enableMetrics) return;

    if (this.protocolMetrics.messageTypes[messageType] !== undefined) {
      this.protocolMetrics.messageTypes[messageType]++;
    }

    if (isExtended) {
      this.protocolMetrics.extendedProtocolUsage++;
    } else {
      this.protocolMetrics.simpleProtocolUsage++;
    }
  }

  /**
   * Records prepared statement cache hit/miss
   * @param {boolean} hit - Whether statement was found in cache
   */
  recordPreparedStatement(hit) {
    if (!this.config.enableMetrics) return;

    if (hit) {
      this.protocolMetrics.preparedStatementHits++;
    } else {
      this.protocolMetrics.preparedStatementMisses++;
    }
  }

  /**
   * Records data transfer
   * @param {string} connectionId - Connection identifier
   * @param {number} bytesReceived - Bytes received from client
   * @param {number} bytesSent - Bytes sent to client
   */
  recordDataTransfer(connectionId, bytesReceived = 0, bytesSent = 0) {
    if (!this.config.enableMetrics) return;

    const details = this.connectionDetails.get(connectionId);
    if (details) {
      details.bytesReceived += bytesReceived;
      details.bytesSent += bytesSent;
    }
  }

  /**
   * Gets comprehensive statistics
   * @returns {Object} Complete statistics object
   */
  getStats() {
    const now = Date.now();
    
    return {
      timestamp: now,
      connections: {
        ...this.connectionMetrics,
        connectionWaitTimes: this.connectionMetrics.connectionWaitTimes.getStats(),
        connectionLifetimes: this.connectionMetrics.connectionLifetimes.getStats(),
        details: Array.from(this.connectionDetails.entries()).map(([id, details]) => ({
          id,
          ...details,
          idleTime: now - details.lastActivity,
        })),
      },
      queries: {
        ...this.queryMetrics,
        queryLatencies: this.queryMetrics.queryLatencies.getStats(),
        slowQueries: this.queryMetrics.slowQueries.slice(-10), // Last 10 slow queries
      },
      protocol: this.protocolMetrics,
    };
  }

  /**
   * Extracts query type from SQL string
   * @param {string} query - SQL query string
   * @returns {string} Query type
   */
  extractQueryType(query) {
    const trimmed = query.trim().toUpperCase();
    const firstWord = trimmed.split(/\s+/)[0];
    
    if (['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'SHOW', 'BEGIN', 'COMMIT', 'ROLLBACK'].includes(firstWord)) {
      return firstWord;
    }
    return 'OTHER';
  }

  /**
   * Classifies error types
   * @param {Error} error - Error object
   * @returns {string} Error classification
   */
  classifyError(error) {
    const message = error.message || error.toString();
    
    if (message.includes('syntax') || message.includes('parse')) {
      return 'SYNTAX_ERROR';
    }
    if (message.includes('timeout')) {
      return 'TIMEOUT';
    }
    return 'RUNTIME_ERROR';
  }

  /**
   * Starts periodic cleanup of old data
   * @private
   */
  startCleanup() {
    this.cleanupInterval = setInterval(() => {
      const cutoff = Date.now() - this.config.retentionPeriod;
      
      // Clean up slow queries
      this.queryMetrics.slowQueries = this.queryMetrics.slowQueries.filter(
        sq => sq.timestamp > cutoff
      );
    }, 60000); // Run every minute
  }

  /**
   * Destroys the collector and cleans up resources
   */
  destroy() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    this.removeAllListeners();
    this.connectionDetails.clear();
  }
}

module.exports = {
  StatsCollector,
  RingBuffer,
};