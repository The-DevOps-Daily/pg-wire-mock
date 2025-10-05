/**
 * PostgreSQL Wire Protocol Mock Server Manager
 * Manages the TCP server lifecycle, connections, and server configuration
 */

const Net = require('net');
const tls = require('tls');
const fs = require('fs');
const { ConnectionState } = require('../connection/connectionState');
const { ConnectionPool } = require('../connection/connectionPool');
const {
  processMessage,
  configureMessageProcessorLogger,
  SSLState,
} = require('../protocol/messageProcessors');
const { configureProtocolLogger } = require('../protocol/messageBuilders');
const { configureQueryLogger } = require('../handlers/queryHandlers');
const { createLogger } = require('../utils/logger');

/**
 * Configuration options for the server
 * @typedef {Object} ServerConfig
 * @property {number} port - Port to listen on
 * @property {string} host - Host to bind to
 * @property {number} maxConnections - Maximum concurrent connections
 * @property {number} connectionTimeout - Connection timeout in milliseconds
 * @property {boolean} enableLogging - Enable detailed logging
 * @property {string} logLevel - Log level (error, warn, info, debug)
 * @property {number} shutdownTimeout - Graceful shutdown timeout in milliseconds
 * @property {number} shutdownDrainTimeout - Connection draining timeout in milliseconds
 * @property {boolean} enableConnectionPooling - Enable connection pooling (default: true)
 * @property {Object} poolConfig - Connection pool configuration options
 * @property {number} poolConfig.maxConnections - Max connections in pool (default: 50)
 * @property {number} poolConfig.minConnections - Min connections in pool (default: 5)
 * @property {number} poolConfig.idleTimeoutMs - Idle connection timeout (default: 300000)
 */

/**
 * PostgreSQL Wire Protocol Mock Server Manager
 * Handles TCP server lifecycle, connection management, and configuration
 */
class ServerManager {
  /**
   * Creates a new server manager
   * @param {ServerConfig} config - Server configuration
   */
  constructor(config = {}) {
    this.config = {
      port: 5432,
      host: 'localhost',
      maxConnections: 100,
      connectionTimeout: 300000, // 5 minutes
      enableLogging: true,
      logLevel: 'info',
      shutdownTimeout: 30000, // 30 seconds
      shutdownDrainTimeout: 10000, // 10 seconds
      enableConnectionPooling: true,
      poolConfig: {
        maxConnections: 50,
        minConnections: 5,
        idleTimeoutMs: 300000,
        acquisitionTimeoutMs: 5000,
        validateConnections: true,
        enableLogging: true,
        logLevel: 'info',
        ...config.poolConfig,
      },
      ...config,
    };

    this.server = null;
    this.connections = new Map();
    this.connectionCount = 0;
    this.isRunning = false;
    this.startTime = null;
    this.isShuttingDown = false;
    this.shutdownPromise = null;

    // Initialize connection pool if enabled
    this.connectionPool = null;
    if (this.config.enableConnectionPooling) {
      this.connectionPool = new ConnectionPool({
        ...this.config.poolConfig,
        enableLogging: this.config.enableLogging,
        logLevel: this.config.logLevel,
      });
    }

    // Statistics
    this.stats = {
      connectionsAccepted: 0,
      connectionsRejected: 0,
      messagesProcessed: 0,
      queriesExecuted: 0,
      errors: 0,
      bytesReceived: 0,
      bytesSent: 0,
    };

    // Cleanup interval
    this.cleanupInterval = null;

    // Initialize centralized logging system
    this.logger = createLogger('server');
    this._configureAllLoggers();
  }

  /**
   * Configure all component loggers with consistent settings
   * @private
   */
  _configureAllLoggers() {
    const logConfig = {
      enabled: this.config.enableLogging,
      level: this.config.logLevel,
    };

    // Configure all component loggers
    configureProtocolLogger(logConfig);
    configureMessageProcessorLogger(logConfig);
    configureQueryLogger(logConfig);

    this.logger.info('All component loggers configured', { config: logConfig });
  }

  /**
   * Starts the PostgreSQL mock server
   * @returns {Promise<void>} Promise that resolves when server is listening
   */
  async start() {
    if (this.isRunning) {
      throw new Error('Server is already running');
    }

    return new Promise((resolve, reject) => {
      try {
        this.server = new Net.Server();
        this.setupServerEventHandlers();

        this.server.listen(this.config.port, this.config.host, async () => {
          this.isRunning = true;
          this.startTime = new Date();

          this.log('info', 'PostgreSQL Wire Protocol Mock Server started');
          this.log('info', `Listening on ${this.config.host}:${this.config.port}`);
          this.log('info', `Max connections: ${this.config.maxConnections}`);
          this.log('info', `Connection timeout: ${this.config.connectionTimeout}ms`);

          // Initialize connection pool if enabled
          if (this.connectionPool && !this.connectionPool.isInitialized) {
            try {
              await this.connectionPool.initialize();
              this.log('info', 'Connection pool initialized successfully');
            } catch (error) {
              this.log('error', `Failed to initialize connection pool: ${error.message}`);
            }
          }

          // Start cleanup interval (every 60 seconds)
          this.cleanupInterval = setInterval(() => {
            this.cleanupConnections();
          }, 60000);

          resolve();
        });

        this.server.on('error', error => {
          this.isRunning = false;
          reject(error);
        });
      } catch (error) {
        this.isRunning = false;
        reject(error);
      }
    });
  }

  /**
   * Stops the PostgreSQL mock server with graceful shutdown
   * @returns {Promise<void>} Promise that resolves when server is stopped
   */
  async stop() {
    if (!this.isRunning || this.isShuttingDown) {
      return this.shutdownPromise || Promise.resolve();
    }

    // Prevent multiple shutdown attempts
    if (this.shutdownPromise) {
      return this.shutdownPromise;
    }

    this.isShuttingDown = true;
    this.log('info', 'Initiating graceful server shutdown...');

    this.shutdownPromise = this._performGracefulShutdown();
    return this.shutdownPromise;
  }

  /**
   * Performs graceful shutdown with proper connection handling
   * @returns {Promise<void>} Promise that resolves when shutdown is complete
   * @private
   */
  async _performGracefulShutdown() {
    const startTime = Date.now();
    const drainTimeout = this.config.shutdownDrainTimeout;

    try {
      // Step 1: Stop accepting new connections
      this.log('info', 'Stopping new connection acceptance...');
      this.server.close();

      // Step 2: Send shutdown notifications to all clients
      this.log('info', `Notifying ${this.connections.size} active connections of shutdown...`);
      await this._notifyClientsOfShutdown();

      // Step 3: Wait for connections to drain naturally
      this.log('info', `Waiting up to ${drainTimeout}ms for connections to drain...`);
      await this._drainConnections(drainTimeout);

      // Step 4: Force close any remaining connections
      const remainingConnections = this.connections.size;
      if (remainingConnections > 0) {
        this.log('warn', `Force closing ${remainingConnections} remaining connections...`);
        await this._forceCloseConnections();
      }

      // Step 5: Clean up resources
      this._cleanupResources();

      const shutdownDuration = Date.now() - startTime;
      this.log('info', `Graceful shutdown completed in ${shutdownDuration}ms`);
      this.log('info', `Final stats: ${JSON.stringify(this.getStats(), null, 2)}`);
    } catch (error) {
      this.log('error', `Error during graceful shutdown: ${error.message}`);
      // Force cleanup on error
      this._forceCloseConnections();
      this._cleanupResources();
      throw error;
    } finally {
      this.isRunning = false;
      this.isShuttingDown = false;
      this.shutdownPromise = null;
    }
  }

  /**
   * Notifies all clients that the server is shutting down
   * @returns {Promise<void>} Promise that resolves when all notifications are sent
   * @private
   */
  async _notifyClientsOfShutdown() {
    const notificationPromises = [];

    for (const [connectionId, connectionData] of this.connections) {
      const promise = this._sendShutdownNotification(connectionId, connectionData);
      notificationPromises.push(promise);
    }

    await Promise.allSettled(notificationPromises);
  }

  /**
   * Sends shutdown notification to a specific client
   * @param {string} connectionId - Connection identifier
   * @param {Object} connectionData - Connection data object
   * @returns {Promise<void>} Promise that resolves when notification is sent
   * @private
   */
  async _sendShutdownNotification(connectionId, connectionData) {
    try {
      const { socket, connState } = connectionData;

      if (!socket || socket.destroyed) {
        return;
      }

      // Send a notice about server shutdown
      const { sendNoticeResponse } = require('../protocol/messageBuilders');
      sendNoticeResponse(socket, 'Server is shutting down. Please disconnect gracefully.');

      // If the connection is in a transaction, roll it back
      if (connState.isInTransaction()) {
        this.log('info', `Rolling back transaction for connection ${connectionId}`);
        connState.rollbackTransaction();

        // Send ReadyForQuery to indicate transaction rollback
        const { sendReadyForQuery } = require('../protocol/messageBuilders');
        sendReadyForQuery(socket, connState);
      }

      this.log('debug', `Shutdown notification sent to connection ${connectionId}`);
    } catch (error) {
      this.log('warn', `Failed to send shutdown notification to ${connectionId}: ${error.message}`);
    }
  }

  /**
   * Waits for connections to drain naturally
   * @param {number} timeout - Maximum time to wait in milliseconds
   * @returns {Promise<void>} Promise that resolves when draining is complete
   * @private
   */
  async _drainConnections(timeout) {
    return new Promise(resolve => {
      const startTime = Date.now();
      const checkInterval = 100; // Check every 100ms

      const checkConnections = () => {
        const elapsed = Date.now() - startTime;

        if (this.connections.size === 0) {
          this.log('info', 'All connections drained successfully');
          resolve();
          return;
        }

        if (elapsed >= timeout) {
          const remainingConnections = this.connections.size;
          this.log(
            'warn',
            `Connection drain timeout reached (${timeout}ms), ` +
              `${remainingConnections} connections remain`
          );
          resolve();
          return;
        }

        // Continue checking
        setTimeout(checkConnections, checkInterval);
      };

      checkConnections();
    });
  }

  /**
   * Force closes all remaining connections
   * @returns {Promise<void>} Promise that resolves when all connections are closed
   * @private
   */
  async _forceCloseConnections() {
    const closePromises = [];

    for (const [connectionId] of this.connections) {
      const promise = this._forceCloseConnection(connectionId);
      closePromises.push(promise);
    }

    await Promise.allSettled(closePromises);
  }

  /**
   * Force closes a specific connection
   * @param {string} connectionId - Connection identifier
   * @returns {Promise<void>} Promise that resolves when connection is closed
   * @private
   */
  async _forceCloseConnection(connectionId) {
    try {
      const connectionData = this.connections.get(connectionId);
      if (!connectionData) {
        return;
      }

      const { socket, connState } = connectionData;

      // Rollback any active transaction
      if (connState.isInTransaction()) {
        connState.rollbackTransaction();
      }

      // Close connection state
      connState.close();

      // Force close socket
      if (socket && !socket.destroyed) {
        socket.destroy();
      }

      this.connections.delete(connectionId);
      this.log('debug', `Force closed connection ${connectionId}`);
    } catch (error) {
      this.log('error', `Error force closing connection ${connectionId}: ${error.message}`);
    }
  }

  /**
   * Cleans up server resources
   * @private
   */
  _cleanupResources() {
    // Clear cleanup interval
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }

    // Cleanup connection pool
    if (this.connectionPool) {
      try {
        this.connectionPool.destroy();
        this.log('info', 'Connection pool cleaned up');
      } catch (error) {
        this.log('error', `Error cleaning up connection pool: ${error.message}`);
      }
    }

    // Clear all connections
    this.connections.clear();

    // Reset state
    this.isRunning = false;
    this.isShuttingDown = false;
  }

  /**
   * Sets up server event handlers
   * @private
   */
  setupServerEventHandlers() {
    this.server.on('connection', socket => {
      this.handleNewConnection(socket);
    });

    this.server.on('error', error => {
      this.stats.errors++;
      this.log('error', `Server error: ${error.message}`);
    });

    this.server.on('close', () => {
      this.log('info', 'Server closed');
    });

    // Handle process termination
    process.on('SIGTERM', () => {
      this.log('info', 'Received SIGTERM, shutting down gracefully');
      this.stop().then(() => process.exit(0));
    });

    process.on('SIGINT', () => {
      this.log('info', 'Received SIGINT, shutting down gracefully');
      this.stop().then(() => process.exit(0));
    });
  }

  /**
   * Handles new client connections
   * @param {Socket} socket - Client socket
   * @private
   */
  handleNewConnection(socket) {
    // Reject new connections during shutdown
    if (this.isShuttingDown) {
      this.stats.connectionsRejected++;
      this.log('warn', 'Connection rejected: server is shutting down');
      socket.end();
      return;
    }

    // Check connection limit
    if (this.connections.size >= this.config.maxConnections) {
      this.stats.connectionsRejected++;
      this.log(
        'warn',
        `Connection rejected: max connections (${this.config.maxConnections}) reached`
      );
      socket.end();
      return;
    }

    const connectionId = `conn_${++this.connectionCount}`;
    let connState;

    // Create connection state (pool integration can be enhanced later)
    connState = new ConnectionState();

    // Log that pooling is enabled for future enhancement
    if (this.connectionPool && this.connectionPool.isInitialized) {
      this.log('debug', `Connection pooling enabled for ${connectionId}`);
    }

    const connectionData = {
      id: connectionId,
      socket: socket,
      connState: connState,
      buffer: Buffer.alloc(0),
      remoteAddress: socket.remoteAddress,
      remotePort: socket.remotePort,
      connectedAt: new Date(),
      lastActivity: new Date(),
      isPooled: !!this.connectionPool,
    };

    this.connections.set(connectionId, connectionData);
    this.stats.connectionsAccepted++;

    this.log(
      'info',
      `New connection: ${connectionId} from ${socket.remoteAddress}:${socket.remotePort}`
    );

    // Set connection timeout
    socket.setTimeout(this.config.connectionTimeout);

    this.setupConnectionEventHandlers(connectionId, connectionData);
  }

  /**
   * Sets up event handlers for a client connection
   * @param {string} connectionId - Connection identifier
   * @param {Object} connectionData - Connection data object
   * @private
   */
  setupConnectionEventHandlers(connectionId, connectionData) {
    const { socket } = connectionData;

    // Handle incoming data
    socket.on('data', chunk => {
      try {
        this.stats.bytesReceived += chunk.length;
        connectionData.lastActivity = new Date();
        connectionData.buffer = Buffer.concat([connectionData.buffer, chunk]);

        this.processMessages(connectionId, connectionData);
      } catch (error) {
        this.stats.errors++;
        this.log('error', `Error processing data for ${connectionId}: ${error.message}`);
        this.closeConnection(connectionId, `Protocol error: ${error.message}`);
      }
    });

    // Handle connection end
    socket.on('end', () => {
      this.log('info', `Connection ${connectionId} ended by client`);
      this.closeConnection(connectionId, 'Client disconnected');
    });

    // Handle connection errors
    socket.on('error', error => {
      this.stats.errors++;
      this.log('error', `Connection ${connectionId} error: ${error.message}`);
      this.closeConnection(connectionId, `Socket error: ${error.message}`);
    });

    // Handle connection timeout
    socket.on('timeout', () => {
      this.log('warn', `Connection ${connectionId} timed out`);
      this.closeConnection(connectionId, 'Connection timeout');
    });

    // Handle connection close
    socket.on('close', hadError => {
      if (hadError) {
        this.log('warn', `Connection ${connectionId} closed with error`);
      }
      this.connections.delete(connectionId);
    });

    // Handle SSL upgrade requests
    socket.on('sslUpgradeRequested', () => {
      if (this.config.enableSSL && SSLState.needsUpgrade(socket)) {
        this.upgradeToSSL(connectionId, connectionData);
      }
    });
  }

  /**
   * Processes buffered messages for a connection
   * @param {string} connectionId - Connection identifier
   * @param {Object} connectionData - Connection data object
   * @private
   */
  processMessages(connectionId, connectionData) {
    const { socket, connState } = connectionData;

    while (connectionData.buffer.length > 0) {
      try {
        const processed = processMessage(connectionData.buffer, socket, connState, this.config);

        if (processed === 0) {
          break; // Need more data
        }

        this.stats.messagesProcessed++;
        connectionData.buffer = connectionData.buffer.slice(processed);

        // Update query count if this was a query
        if (connState.queriesExecuted > (connectionData.lastQueryCount || 0)) {
          this.stats.queriesExecuted++;
          connectionData.lastQueryCount = connState.queriesExecuted;
        }
      } catch (error) {
        this.stats.errors++;
        this.log('error', `Message processing error for ${connectionId}: ${error.message}`);

        // Send error response if possible
        const { sendErrorResponse } = require('../protocol/messageBuilders');
        const { ERROR_CODES } = require('../protocol/constants');

        try {
          sendErrorResponse(
            socket,
            ERROR_CODES.PROTOCOL_VIOLATION,
            `Protocol error: ${error.message}`
          );
        } catch (sendError) {
          this.log('error', `Failed to send error response: ${sendError.message}`);
        }

        this.closeConnection(connectionId, 'Protocol error');
        break;
      }
    }
  }

  /**
   * Upgrades a connection to SSL/TLS
   * @param {string} connectionId - Connection identifier
   * @param {Object} connectionData - Connection data object
   * @private
   */
  upgradeToSSL(connectionId, connectionData) {
    const { socket } = connectionData;

    try {
      this.log('info', `Upgrading connection ${connectionId} to SSL/TLS`);

      // Get pre-validated SSL options from the socket state
      const sslConfig = SSLState.getConfig(socket);
      const sslOptions = sslConfig?.validatedSSLOptions;

      if (!sslOptions) {
        // This should not happen since certificates were validated before accepting SSL
        this.log('error', `No validated SSL options found for connection ${connectionId}`);
        this.closeConnection(connectionId, 'SSL configuration error');
        return;
      }

      // Create TLS socket wrapping the existing socket
      const tlsSocket = new tls.TLSSocket(socket, {
        ...sslOptions,
        isServer: true,
        server: this.server,
      });

      // Set up TLS socket event handlers
      tlsSocket.on('secure', () => {
        this.log('info', `SSL connection established for ${connectionId}`);

        // Update connection data with TLS socket
        connectionData.socket = tlsSocket;
        connectionData.isSSL = true;

        // Clear SSL upgrade state
        SSLState.markCompleted(socket);

        // Set up new event handlers for TLS socket
        this.setupSSLConnectionEventHandlers(connectionId, connectionData);
      });

      tlsSocket.on('error', error => {
        this.log('error', `SSL error for connection ${connectionId}: ${error.message}`);
        this.closeConnection(connectionId, `SSL error: ${error.message}`);
      });

      tlsSocket.on('close', () => {
        this.log('debug', `SSL connection ${connectionId} closed`);
      });
    } catch (error) {
      this.log('error', `Failed to upgrade connection ${connectionId} to SSL: ${error.message}`);
      this.closeConnection(connectionId, `SSL upgrade failed: ${error.message}`);
    }
  }

  /**
   * Gets SSL/TLS options from configuration
   * @returns {Object} SSL options object
   * @private
   */
  getSSLOptions() {
    const sslOptions = {
      rejectUnauthorized: this.config.sslRejectUnauthorized,
    };

    // Add certificate and key if paths are provided
    try {
      if (this.config.sslCertPath && fs.existsSync(this.config.sslCertPath)) {
        sslOptions.cert = fs.readFileSync(this.config.sslCertPath);
      } else {
        this.log('warn', `SSL certificate file not found: ${this.config.sslCertPath}`);
      }

      if (this.config.sslKeyPath && fs.existsSync(this.config.sslKeyPath)) {
        sslOptions.key = fs.readFileSync(this.config.sslKeyPath);
      } else {
        this.log('warn', `SSL key file not found: ${this.config.sslKeyPath}`);
      }

      // Add CA certificate if provided
      if (this.config.sslCaPath && fs.existsSync(this.config.sslCaPath)) {
        sslOptions.ca = fs.readFileSync(this.config.sslCaPath);
      }

      // Set TLS version constraints
      if (this.config.sslMinVersion) {
        sslOptions.minVersion = this.config.sslMinVersion;
      }
      if (this.config.sslMaxVersion) {
        sslOptions.maxVersion = this.config.sslMaxVersion;
      }

      // Set cipher suites if specified
      if (this.config.sslCipherSuites) {
        sslOptions.ciphers = this.config.sslCipherSuites;
      }
    } catch (error) {
      this.log('error', `Error reading SSL certificates: ${error.message}`);
    }

    return sslOptions;
  }

  /**
   * Sets up event handlers for SSL connections
   * @param {string} connectionId - Connection identifier
   * @param {Object} connectionData - Connection data object
   * @private
   */
  setupSSLConnectionEventHandlers(connectionId, connectionData) {
    const { socket } = connectionData; // This is now the TLS socket

    // Handle incoming data on TLS socket
    socket.on('data', chunk => {
      try {
        this.stats.bytesReceived += chunk.length;
        connectionData.lastActivity = new Date();
        connectionData.buffer = Buffer.concat([connectionData.buffer, chunk]);

        this.processMessages(connectionId, connectionData);
      } catch (error) {
        this.stats.errors++;
        this.log('error', `Error processing SSL data for ${connectionId}: ${error.message}`);
        this.closeConnection(connectionId, `SSL protocol error: ${error.message}`);
      }
    });

    // Handle connection end
    socket.on('end', () => {
      this.log('info', `SSL connection ${connectionId} ended by client`);
      this.closeConnection(connectionId, 'Client disconnected');
    });

    // Handle connection errors
    socket.on('error', error => {
      this.stats.errors++;
      this.log('error', `SSL connection ${connectionId} error: ${error.message}`);
      this.closeConnection(connectionId, `SSL socket error: ${error.message}`);
    });

    // Handle connection timeout
    socket.on('timeout', () => {
      this.log('warn', `SSL connection ${connectionId} timed out`);
      this.closeConnection(connectionId, 'SSL connection timeout');
    });

    // Handle connection close
    socket.on('close', hadError => {
      if (hadError) {
        this.log('warn', `SSL connection ${connectionId} closed with error`);
      }
      this.connections.delete(connectionId);
    });
  }

  /**
   * Closes a connection gracefully
   * @param {string} connectionId - Connection identifier
   * @param {string} reason - Reason for closure
   * @param {boolean} force - Whether to force close immediately
   * @private
   */
  closeConnection(connectionId, reason, force = false) {
    const connectionData = this.connections.get(connectionId);
    if (!connectionData) {
      return;
    }

    const { socket, connState, isPooled } = connectionData;
    const duration = Date.now() - connectionData.connectedAt.getTime();

    this.log(
      'info',
      `Closing connection ${connectionId}: ${reason} (duration: ${Math.round(duration / 1000)}s)`
    );

    try {
      // Rollback any active transaction before closing
      if (connState.isInTransaction()) {
        this.log('debug', `Rolling back transaction for connection ${connectionId}`);
        connState.rollbackTransaction();
      }

      // If pooling is enabled and connection is valid, return to pool
      if (
        !force &&
        isPooled &&
        this.connectionPool &&
        typeof connState.isValid === 'function' &&
        connState.isValid()
      ) {
        this.connectionPool.releaseConnection(connState);
        this.log('debug', `Returned connection ${connectionId} to pool`);
      } else {
        // Close connection state
        connState.close();
      }

      if (force) {
        // Force close immediately
        if (socket && !socket.destroyed) {
          socket.destroy();
        }
      } else {
        // Graceful close - try to send a proper close message first
        if (socket && !socket.destroyed) {
          try {
            // Send a notice about connection closure
            const { sendNoticeResponse } = require('../protocol/messageBuilders');
            sendNoticeResponse(socket, `Connection closed: ${reason}`);

            // Send ReadyForQuery to indicate clean state
            const { sendReadyForQuery } = require('../protocol/messageBuilders');
            sendReadyForQuery(socket, connState);

            // Give a brief moment for the client to process the message
            setTimeout(() => {
              if (socket && !socket.destroyed) {
                socket.end();
              }
            }, 100);
          } catch (error) {
            this.log('debug', `Error sending graceful close message: ${error.message}`);
            socket.destroy();
          }
        }
      }
    } catch (error) {
      this.log('error', `Error closing connection ${connectionId}: ${error.message}`);
      // Ensure the socket is closed on error
      if (socket && !socket.destroyed) {
        socket.destroy();
      }
      try {
        connState.close();
      } catch (_) {
        // Ignore cleanup errors
      }
    }

    this.connections.delete(connectionId);
  }

  /**
   * Cleans up idle connections
   * @private
   */
  cleanupConnections() {
    const now = Date.now();
    let cleanedUp = 0;

    for (const [connectionId, connectionData] of this.connections) {
      const idleTime = now - connectionData.lastActivity.getTime();

      if (idleTime > this.config.connectionTimeout) {
        this.closeConnection(connectionId, 'Idle timeout');
        cleanedUp++;
      }
    }

    if (cleanedUp > 0) {
      this.log('info', `Cleaned up ${cleanedUp} idle connections`);
    }
  }

  /**
   * Gets server statistics
   * @returns {Object} Server statistics
   */
  getStats() {
    const uptime = this.startTime ? Date.now() - this.startTime.getTime() : 0;

    const stats = {
      ...this.stats,
      activeConnections: this.connections.size,
      uptime: uptime,
      uptimeString: this.formatUptime(uptime),
      config: {
        port: this.config.port,
        host: this.config.host,
        maxConnections: this.config.maxConnections,
        enableConnectionPooling: this.config.enableConnectionPooling,
      },
    };

    // Add connection pool statistics if pooling is enabled
    if (this.connectionPool) {
      stats.connectionPool = this.connectionPool.getStats();
    }

    return stats;
  }

  /**
   * Gets detailed connection information
   * @returns {Array} Array of connection details
   */
  getConnections() {
    return Array.from(this.connections.values()).map(conn => ({
      id: conn.id,
      remoteAddress: conn.remoteAddress,
      remotePort: conn.remotePort,
      connectedAt: conn.connectedAt,
      lastActivity: conn.lastActivity,
      user: conn.connState.getCurrentUser(),
      database: conn.connState.getCurrentDatabase(),
      queriesExecuted: conn.connState.queriesExecuted,
      transactionStatus: conn.connState.transactionStatus,
      authenticated: conn.connState.authenticated,
    }));
  }

  /**
   * Formats uptime duration
   * @param {number} uptime - Uptime in milliseconds
   * @returns {string} Formatted uptime string
   * @private
   */
  formatUptime(uptime) {
    const seconds = Math.floor(uptime / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) return `${days}d ${hours % 24}h ${minutes % 60}m`;
    if (hours > 0) return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
    if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
    return `${seconds}s`;
  }

  /**
   * Logs a message with timestamp and level
   * @param {string} level - Log level
   * @param {string} message - Log message
   * @private
   */
  log(level, message) {
    // Use the centralized logger for consistent formatting
    this.logger[level](message);
  }

  /**
   * Checks if server is running
   * @returns {boolean} True if server is running
   */
  isServerRunning() {
    return this.isRunning;
  }

  /**
   * Checks if server is shutting down
   * @returns {boolean} True if server is shutting down
   */
  isServerShuttingDown() {
    return this.isShuttingDown;
  }

  /**
   * Gets the number of active connections
   * @returns {number} Number of active connections
   */
  getActiveConnectionCount() {
    return this.connections.size;
  }

  /**
   * Gets shutdown status information
   * @returns {Object} Shutdown status information
   */
  getShutdownStatus() {
    return {
      isShuttingDown: this.isShuttingDown,
      activeConnections: this.connections.size,
      shutdownTimeout: this.config.shutdownTimeout,
      drainTimeout: this.config.shutdownDrainTimeout,
    };
  }

  /**
   * Gets server address information
   * @returns {Object|null} Address info or null if not running
   */
  getAddress() {
    return this.server?.address() || null;
  }
}

module.exports = {
  ServerManager,
};
