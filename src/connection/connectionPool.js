/**
 * PostgreSQL Wire Protocol Connection Pool
 * Manages a pool of reusable PostgreSQL connections for better performance and resource management
 */

const { ConnectionState } = require('./connectionState');

/**
 * Configuration options for the connection pool
 * @typedef {Object} ConnectionPoolConfig
 * @property {number} maxConnections - Maximum number of connections in the pool (default: 50)
 * @property {number} minConnections - Minimum number of connections to maintain (default: 5)
 * @property {number} maxIdleConnections - Maximum idle connections to keep (default: 10)
 * @property {number} idleTimeoutMs - Time before idle connections are closed in ms (default: 300000)
 * @property {number} acquisitionTimeoutMs - Timeout for acquiring a connection in ms (default: 5000)
 * @property {boolean} validateConnections - Whether to validate connections before reuse (default: true)
 * @property {number} validationIntervalMs - How often to validate idle connections in ms (default: 60000)
 * @property {number} cleanupIntervalMs - How often to run pool cleanup in ms (default: 30000)
 * @property {boolean} enableLogging - Enable pool logging (default: true)
 * @property {string} logLevel - Log level for pool operations (default: 'info')
 */

/**
 * Represents a connection in the pool with metadata
 * @typedef {Object} PooledConnection
 * @property {string} id - Unique identifier for this connection
 * @property {ConnectionState} connectionState - The actual PostgreSQL connection state
 * @property {Date} createdAt - When this connection was created
 * @property {Date} lastUsed - When this connection was last used by a client
 * @property {Date} lastValidated - When this connection was last validated
 * @property {boolean} isActive - Whether this connection is currently in use
 * @property {boolean} isValid - Whether this connection passed validation
 * @property {number} usageCount - How many times this connection has been used
 * @property {string|null} currentClientId - ID of client currently using this connection
 * @property {Object} metadata - Additional metadata for the connection
 */

/**
 * Statistics about connection pool performance and usage
 * @typedef {Object} ConnectionPoolStats
 * @property {number} totalConnections - Total connections in the pool
 * @property {number} activeConnections - Connections currently in use
 * @property {number} idleConnections - Connections available for use
 * @property {number} pendingRequests - Clients waiting for a connection
 * @property {number} connectionsCreated - Total connections created since start
 * @property {number} connectionsDestroyed - Total connections destroyed since start
 * @property {number} connectionsReused - Total times connections were reused
 * @property {number} acquisitionTimeoutCount - Times clients timed out waiting for connection
 * @property {number} validationFailureCount - Connections that failed validation
 * @property {number} averageAcquisitionTimeMs - Average time to get a connection
 * @property {number} averageConnectionLifetimeMs - Average lifetime of connections
 * @property {number} peakConnections - Maximum connections reached simultaneously
 * @property {Date} lastCleanupAt - When pool cleanup was last performed
 */

/**
 * Connection Pool Manager
 *
 * Manages a pool of reusable PostgreSQL connections to improve performance
 * and resource utilization when handling multiple client connections.
 *
 * ## Behavior Overview:
 *
 * ### Connection Lifecycle:
 * 1. **Creation**: Connections are created on-demand up to maxConnections limit
 * 2. **Acquisition**: Clients request connections from available pool
 * 3. **Usage**: Connection is marked as active and assigned to client
 * 4. **Release**: Client returns connection to pool when done
 * 5. **Validation**: Idle connections are periodically validated
 * 6. **Cleanup**: Old or invalid connections are destroyed
 *
 * ### Pool Management Strategy:
 * - Maintains minimum number of warm connections (minConnections)
 * - Creates new connections when pool is empty and under limit
 * - Reuses existing connections when available
 * - Destroys excess idle connections after timeout period
 * - Validates connections before reuse to ensure they're still functional
 *
 * ### Resource Limits:
 * - Never exceeds maxConnections limit
 * - Queues client requests when pool is full
 * - Times out requests that wait too long
 * - Prevents memory leaks through idle connection cleanup
 *
 * ### Error Handling:
 * - Invalid connections are automatically destroyed and recreated
 * - Connection acquisition timeouts throw descriptive errors
 * - Pool gracefully handles connection failures
 * - Statistics track various error conditions for monitoring
 *
 * @class ConnectionPool
 * @param {ConnectionPoolConfig} config - Pool configuration options
 *
 * @example
 * // Create a connection pool
 * const pool = new ConnectionPool({
 *   maxConnections: 20,
 *   minConnections: 5,
 *   idleTimeoutMs: 300000
 * });
 *
 * // Initialize the pool
 * await pool.initialize();
 *
 * // Use in server manager
 * const connection = await pool.acquireConnection(clientId);
 * try {
 *   // Process client queries using connection
 *   await processClientQueries(connection, clientSocket);
 * } finally {
 *   // Always release connection back to pool
 *   pool.releaseConnection(connection.id, clientId);
 * }
 */
class ConnectionPool {
  /**
   * Creates a new connection pool instance
   * @param {ConnectionPoolConfig} config - Pool configuration options
   */
  constructor(config = {}) {
    // Default configuration
    this.config = {
      maxConnections: 50,
      minConnections: 5,
      maxIdleConnections: 10,
      idleTimeoutMs: 300000, // 5 minutes
      acquisitionTimeoutMs: 5000, // 5 seconds
      validateConnections: true,
      validationIntervalMs: 60000, // 1 minute
      cleanupIntervalMs: 30000, // 30 seconds
      enableLogging: true,
      logLevel: 'info',
      ...config,
    };

    // Pool state
    this.connections = new Map(); // All connections (active + idle)
    this.idleConnections = []; // Available connections queue
    this.pendingRequests = []; // Queue of waiting acquisition requests
    this.connectionCounter = 0; // For generating unique IDs
    this.isInitialized = false;
    this.isShuttingDown = false;

    // Cleanup intervals
    this.cleanupInterval = null;
    this.validationInterval = null;

    // Statistics
    this.stats = {
      totalConnections: 0,
      activeConnections: 0,
      idleConnections: 0,
      pendingRequests: 0,
      connectionsCreated: 0,
      connectionsDestroyed: 0,
      connectionsReused: 0,
      acquisitionTimeoutCount: 0,
      validationFailureCount: 0,
      averageAcquisitionTimeMs: 0,
      averageConnectionLifetimeMs: 0,
      peakConnections: 0,
      lastCleanupAt: null,
      acquisitionTimes: [], // Track for average calculation
      connectionLifetimes: [], // Track for average calculation
    };

    // Bind methods to preserve context
    this.cleanup = this.cleanup.bind(this);
    this.validateIdleConnections = this.validateIdleConnections.bind(this);
  }

  /**
   * Initializes the connection pool and starts background processes
   * @returns {Promise<void>} Promise that resolves when pool is initialized
   * @throws {Error} If pool is already initialized
   */
  async initialize() {
    if (this.isInitialized) {
      throw new Error('Connection pool is already initialized');
    }

    this.log('info', 'Initializing connection pool', {
      maxConnections: this.config.maxConnections,
      minConnections: this.config.minConnections,
      idleTimeoutMs: this.config.idleTimeoutMs,
    });

    try {
      // Create minimum connections
      await this.createMinimumConnections();

      // Start background processes
      this.startCleanupInterval();
      this.startValidationInterval();

      this.isInitialized = true;
      this.log('info', 'Connection pool initialized successfully', {
        initialConnections: this.connections.size,
      });
    } catch (error) {
      this.log('error', 'Failed to initialize connection pool', { error: error.message });
      throw error;
    }
  }

  /**
   * Creates the minimum number of connections as specified in configuration
   * @private
   * @returns {Promise<void>}
   */
  async createMinimumConnections() {
    const connectionsToCreate = Math.max(0, this.config.minConnections);
    const promises = [];

    for (let i = 0; i < connectionsToCreate; i++) {
      promises.push(this.createConnection());
    }

    await Promise.all(promises);
    this.log('debug', `Created ${connectionsToCreate} initial connections`);
  }

  /**
   * Creates a new pooled connection
   * @private
   * @returns {Promise<PooledConnection>} The created connection
   */
  async createConnection() {
    const connectionId = `pool_conn_${++this.connectionCounter}`;
    const now = new Date();

    try {
      const connectionState = new ConnectionState();

      const pooledConnection = {
        id: connectionId,
        connectionState,
        createdAt: now,
        lastUsed: now,
        lastValidated: now,
        isActive: false,
        isValid: true,
        usageCount: 0,
        currentClientId: null,
        metadata: {
          version: '1.0',
          poolVersion: 'pg-wire-mock-pool',
        },
      };

      this.connections.set(connectionId, pooledConnection);
      this.idleConnections.push(pooledConnection);

      this.stats.connectionsCreated++;
      this.stats.totalConnections++;
      this.stats.idleConnections++;

      // Update peak connections
      if (this.stats.totalConnections > this.stats.peakConnections) {
        this.stats.peakConnections = this.stats.totalConnections;
      }

      this.log('debug', `Created new connection: ${connectionId}`);
      return pooledConnection;
    } catch (error) {
      this.log('error', `Failed to create connection: ${error.message}`);
      throw error;
    }
  }

  /**
   * Starts the cleanup interval for idle connections
   * @private
   */
  startCleanupInterval() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }

    this.cleanupInterval = setInterval(this.cleanup, this.config.cleanupIntervalMs);
    this.log('debug', `Started cleanup interval: ${this.config.cleanupIntervalMs}ms`);
  }

  /**
   * Starts the validation interval for idle connections
   * @private
   */
  startValidationInterval() {
    if (!this.config.validateConnections) {
      return;
    }

    if (this.validationInterval) {
      clearInterval(this.validationInterval);
    }

    this.validationInterval = setInterval(
      this.validateIdleConnections,
      this.config.validationIntervalMs,
    );
    this.log('debug', `Started validation interval: ${this.config.validationIntervalMs}ms`);
  }

  /**
   * Logs a message with the specified level
   * @private
   * @param {string} level - Log level
   * @param {string} message - Log message
   * @param {Object} [meta] - Additional metadata
   */
  log(level, message, meta = {}) {
    if (!this.config.enableLogging) {
      return;
    }

    const levels = { error: 0, warn: 1, info: 2, debug: 3 };
    const configLevel = levels[this.config.logLevel] || 2;
    const messageLevel = levels[level] || 2;

    if (messageLevel <= configLevel) {
      const timestamp = new Date().toISOString();
      const metaStr = Object.keys(meta).length > 0 ? ` ${JSON.stringify(meta)}` : '';
      console.log(`[${timestamp}] [POOL:${level.toUpperCase()}] ${message}${metaStr}`);
    }
  }

  /**
   * Acquires a connection from the pool for use by a client
   * @param {string} clientId - Unique identifier for the requesting client
   * @param {number} [timeoutMs] - Maximum time to wait for a connection (optional)
   * @returns {Promise<PooledConnection>} Promise that resolves with a connection
   * @throws {Error} When no connection is available within timeout period
   * @throws {Error} When pool is at maximum capacity and cannot create new connections
   * @throws {Error} When pool is not initialized or is shutting down
   *
   * @example
   * // Basic usage
   * const connection = await pool.acquireConnection('client_123');
   *
   * @example
   * // With custom timeout
   * const connection = await pool.acquireConnection('client_456', 10000);
   */
  async acquireConnection(clientId, timeoutMs = this.config.acquisitionTimeoutMs) {
    if (!this.isInitialized) {
      throw new Error('Connection pool is not initialized');
    }

    if (this.isShuttingDown) {
      throw new Error('Connection pool is shutting down');
    }

    const acquisitionStart = Date.now();
    this.log('debug', `Acquiring connection for client: ${clientId}`, {
      timeoutMs,
      idleConnections: this.idleConnections.length,
      totalConnections: this.connections.size,
    });

    // Try to get an idle connection first
    let connection = this.getIdleConnection();

    if (connection) {
      return this.assignConnectionToClient(connection, clientId, acquisitionStart);
    }

    // No idle connections available, try to create a new one
    if (this.connections.size < this.config.maxConnections) {
      try {
        connection = await this.createConnection();
        // Remove from idle queue since we're about to assign it
        const idleIndex = this.idleConnections.indexOf(connection);
        if (idleIndex !== -1) {
          this.idleConnections.splice(idleIndex, 1);
          this.stats.idleConnections--;
        }
        return this.assignConnectionToClient(connection, clientId, acquisitionStart);
      } catch (error) {
        this.log('error', `Failed to create new connection for ${clientId}`, {
          error: error.message,
        });
        throw error;
      }
    }

    // Pool is at capacity, need to wait for a connection to be released
    return this.waitForConnection(clientId, timeoutMs, acquisitionStart);
  }

  /**
   * Returns a connection to the pool after client is done using it
   * @param {string} connectionId - ID of the connection to release
   * @param {string} clientId - ID of the client releasing the connection
   * @returns {boolean} True if connection was successfully released
   *
   * @example
   * const released = pool.releaseConnection('conn_789', 'client_123');
   * if (!released) {
   *   console.warn('Failed to release connection');
   * }
   */
  releaseConnection(connectionId, clientId) {
    const connection = this.connections.get(connectionId);

    if (!connection) {
      this.log('warn', `Cannot release unknown connection: ${connectionId}`, { clientId });
      return false;
    }

    if (!connection.isActive) {
      this.log('warn', `Connection ${connectionId} is not active`, { clientId });
      return false;
    }

    if (connection.currentClientId !== clientId) {
      const currentOwner = connection.currentClientId;
      this.log('warn', `Client ${clientId} cannot release connection owned by ${currentOwner}`, {
        connectionId,
      });
      return false;
    }

    // Update connection state
    connection.isActive = false;
    connection.currentClientId = null;
    connection.lastUsed = new Date();

    // Update statistics
    this.stats.activeConnections--;
    this.stats.idleConnections++;

    // Add back to idle connections if pool allows it
    if (this.idleConnections.length < this.config.maxIdleConnections) {
      this.idleConnections.push(connection);
      this.log('debug', `Connection ${connectionId} returned to idle pool`, { clientId });
    } else {
      // Too many idle connections, destroy this one
      this.destroyConnection(connectionId);
      this.log('debug', `Connection ${connectionId} destroyed (excess idle)`, { clientId });
    }

    // Process any pending requests
    this.processPendingRequests();

    return true;
  }

  /**
   * Gets an idle connection if available
   * @private
   * @returns {PooledConnection|null} An idle connection or null if none available
   */
  getIdleConnection() {
    while (this.idleConnections.length > 0) {
      const connection = this.idleConnections.shift();
      this.stats.idleConnections--;

      // Validate connection if validation is enabled
      if (this.config.validateConnections && !this.isConnectionValid(connection)) {
        this.log('debug', `Idle connection ${connection.id} failed validation, destroying`);
        this.destroyConnection(connection.id);
        continue; // Try next connection
      }

      return connection;
    }

    return null;
  }

  /**
   * Assigns a connection to a client
   * @private
   * @param {PooledConnection} connection - The connection to assign
   * @param {string} clientId - The client ID
   * @param {number} acquisitionStart - When acquisition started (for timing)
   * @returns {PooledConnection} The assigned connection
   */
  assignConnectionToClient(connection, clientId, acquisitionStart) {
    connection.isActive = true;
    connection.currentClientId = clientId;
    connection.lastUsed = new Date();
    connection.usageCount++;

    // Update statistics
    this.stats.activeConnections++;
    this.stats.connectionsReused++;

    // Track acquisition time
    const acquisitionTime = Date.now() - acquisitionStart;
    this.stats.acquisitionTimes.push(acquisitionTime);

    // Keep only last 100 times for average calculation
    if (this.stats.acquisitionTimes.length > 100) {
      this.stats.acquisitionTimes.shift();
    }

    // Update average
    const totalTime = this.stats.acquisitionTimes.reduce((a, b) => a + b, 0);
    this.stats.averageAcquisitionTimeMs = totalTime / this.stats.acquisitionTimes.length;

    this.log('debug', `Connection ${connection.id} assigned to client ${clientId}`, {
      acquisitionTimeMs: acquisitionTime,
      usageCount: connection.usageCount,
    });

    return connection;
  }

  /**
   * Waits for a connection to become available
   * @private
   * @param {string} clientId - The client ID
   * @param {number} timeoutMs - Timeout in milliseconds
   * @param {number} acquisitionStart - When acquisition started
   * @returns {Promise<PooledConnection>} Promise that resolves with a connection
   */
  waitForConnection(clientId, timeoutMs, acquisitionStart) {
    return new Promise((resolve, reject) => {
      const request = { clientId, resolve, reject, acquisitionStart };

      this.pendingRequests.push(request);
      this.stats.pendingRequests++;

      // Set timeout
      const timeoutId = setTimeout(() => {
        // Remove from pending requests
        const index = this.pendingRequests.indexOf(request);
        if (index !== -1) {
          this.pendingRequests.splice(index, 1);
          this.stats.pendingRequests--;
        }

        this.stats.acquisitionTimeoutCount++;
        this.log('warn', `Connection acquisition timeout for client ${clientId}`, {
          timeoutMs,
          waitTime: Date.now() - acquisitionStart,
        });

        reject(new Error(`Connection acquisition timeout after ${timeoutMs}ms`));
      }, timeoutMs);

      // Store timeout ID so we can clear it if connection becomes available
      request.timeoutId = timeoutId;

      this.log('debug', `Client ${clientId} queued for connection`, {
        queuePosition: this.pendingRequests.length,
        timeoutMs,
      });
    });
  }

  /**
   * Processes pending connection requests when connections become available
   * @private
   */
  processPendingRequests() {
    while (this.pendingRequests.length > 0 && this.idleConnections.length > 0) {
      const request = this.pendingRequests.shift();
      this.stats.pendingRequests--;

      // Clear the timeout
      if (request.timeoutId) {
        clearTimeout(request.timeoutId);
      }

      try {
        const connection = this.getIdleConnection();
        if (connection) {
          const assignedConnection = this.assignConnectionToClient(
            connection,
            request.clientId,
            request.acquisitionStart,
          );
          request.resolve(assignedConnection);
        } else {
          // Should not happen, but handle gracefully
          request.reject(new Error('No connection available after queue processing'));
        }
      } catch (error) {
        request.reject(error);
      }
    }
  }

  /**
   * Validates if a connection is still usable
   * @private
   * @param {PooledConnection} connection - The connection to validate
   * @returns {boolean} True if connection is valid
   */
  isConnectionValid(connection) {
    try {
      // Basic validation checks
      if (!connection || !connection.connectionState) {
        return false;
      }

      // Check if connection is too old
      const maxAge = this.config.idleTimeoutMs * 2; // Allow double the idle timeout
      if (Date.now() - connection.createdAt.getTime() > maxAge) {
        return false;
      }

      // Check connection state
      if (!connection.connectionState.connected) {
        return false;
      }

      // Additional validation could be added here
      // For example, sending a simple query to test the connection

      return true;
    } catch (error) {
      this.log('debug', `Connection validation failed: ${error.message}`);
      return false;
    }
  }

  /**
   * Destroys a connection and removes it from the pool
   * @private
   * @param {string} connectionId - ID of the connection to destroy
   */
  destroyConnection(connectionId) {
    const connection = this.connections.get(connectionId);
    if (!connection) {
      return;
    }

    try {
      // Close the connection state
      if (connection.connectionState && typeof connection.connectionState.close === 'function') {
        connection.connectionState.close();
      }

      // Remove from all tracking structures
      this.connections.delete(connectionId);

      // Remove from idle connections if present
      const idleIndex = this.idleConnections.indexOf(connection);
      if (idleIndex !== -1) {
        this.idleConnections.splice(idleIndex, 1);
        this.stats.idleConnections--;
      }

      // Update statistics
      this.stats.connectionsDestroyed++;
      this.stats.totalConnections--;

      if (connection.isActive) {
        this.stats.activeConnections--;
      }

      // Track connection lifetime
      const lifetime = Date.now() - connection.createdAt.getTime();
      this.stats.connectionLifetimes.push(lifetime);

      // Keep only last 100 lifetimes for average calculation
      if (this.stats.connectionLifetimes.length > 100) {
        this.stats.connectionLifetimes.shift();
      }

      // Update average
      const totalLifetime = this.stats.connectionLifetimes.reduce((a, b) => a + b, 0);
      const lifetimeCount = this.stats.connectionLifetimes.length;
      this.stats.averageConnectionLifetimeMs = totalLifetime / lifetimeCount;

      this.log('debug', `Connection ${connectionId} destroyed`, {
        lifetimeMs: lifetime,
        usageCount: connection.usageCount,
      });
    } catch (error) {
      this.log('error', `Error destroying connection ${connectionId}: ${error.message}`);
    }
  }

  /**
   * Performs cleanup of idle connections that have exceeded timeout
   * @private
   */
  cleanup() {
    if (this.isShuttingDown) {
      return;
    }

    const now = Date.now();
    const connectionsToDestroy = [];

    // Find idle connections that have exceeded timeout
    for (const connection of this.idleConnections) {
      const idleTime = now - connection.lastUsed.getTime();
      if (idleTime > this.config.idleTimeoutMs) {
        connectionsToDestroy.push(connection.id);
      }
    }

    // Don't destroy connections if we would go below minimum
    const minimumToKeep = Math.max(this.config.minConnections, 1);
    const maxToDestroy = Math.max(0, this.connections.size - minimumToKeep);
    const actualDestroyCount = Math.min(connectionsToDestroy.length, maxToDestroy);

    // Destroy the connections
    for (let i = 0; i < actualDestroyCount; i++) {
      this.destroyConnection(connectionsToDestroy[i]);
    }

    this.stats.lastCleanupAt = new Date();

    if (actualDestroyCount > 0) {
      this.log('debug', `Cleanup destroyed ${actualDestroyCount} idle connections`, {
        totalConnections: this.connections.size,
        idleConnections: this.idleConnections.length,
      });
    }
  }

  /**
   * Validates idle connections to ensure they are still functional
   * @private
   */
  validateIdleConnections() {
    if (this.isShuttingDown || !this.config.validateConnections) {
      return;
    }

    const now = Date.now();
    const connectionsToValidate = this.idleConnections.filter(conn => {
      const timeSinceValidation = now - conn.lastValidated.getTime();
      return timeSinceValidation > this.config.validationIntervalMs;
    });

    let validationFailures = 0;

    for (const connection of connectionsToValidate) {
      connection.lastValidated = new Date();

      if (!this.isConnectionValid(connection)) {
        this.destroyConnection(connection.id);
        validationFailures++;
      }
    }

    if (validationFailures > 0) {
      this.stats.validationFailureCount += validationFailures;
      this.log('debug', `Validation destroyed ${validationFailures} invalid connections`);
    }
  }

  /**
   * Gracefully shuts down the connection pool
   * @param {number} [timeoutMs=10000] - Maximum time to wait for shutdown
   * @returns {Promise<void>} Promise that resolves when shutdown is complete
   */
  async shutdown(timeoutMs = 10000) {
    if (!this.isInitialized || this.isShuttingDown) {
      return;
    }

    this.isShuttingDown = true;
    this.log('info', 'Shutting down connection pool');

    // Stop background processes
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }

    if (this.validationInterval) {
      clearInterval(this.validationInterval);
      this.validationInterval = null;
    }

    // Reject any pending requests
    const pendingCount = this.pendingRequests.length;
    while (this.pendingRequests.length > 0) {
      const request = this.pendingRequests.shift();
      if (request.timeoutId) {
        clearTimeout(request.timeoutId);
      }
      request.reject(new Error('Connection pool is shutting down'));
    }
    this.stats.pendingRequests = 0;

    // Wait for active connections to be released or force close after timeout
    const shutdownStart = Date.now();
    const checkInterval = 100; // Check every 100ms

    while (this.stats.activeConnections > 0 && (Date.now() - shutdownStart) < timeoutMs) {
      await new Promise(resolve => setTimeout(resolve, checkInterval));
    }

    // Force close any remaining active connections
    if (this.stats.activeConnections > 0) {
      this.log('warn', `Force closing ${this.stats.activeConnections} active connections`);
    }

    // Destroy all connections
    const connectionIds = Array.from(this.connections.keys());
    for (const connectionId of connectionIds) {
      this.destroyConnection(connectionId);
    }

    this.isInitialized = false;
    this.log('info', 'Connection pool shutdown complete', {
      shutdownDurationMs: Date.now() - shutdownStart,
      pendingRequestsRejected: pendingCount,
      finalStats: this.getStats(),
    });
  }

  getStats() {
    return { ...this.stats };
  }
}

module.exports = {
  ConnectionPool,
};
