/**
 * PostgreSQL Wire Protocol Connection State Management
 * Handles client connection state, authentication, parameters, and transaction status
 */

const { TRANSACTION_STATUS, PROTOCOL_VERSION_3_0 } = require('../protocol/constants');
const { createLogger } = require('../utils/logger');

const { generateBackendSecret } = require('../protocol/utils');

/**
 * Represents the state of a PostgreSQL client connection
 */
class ConnectionState {
  constructor() {
    // Logger for connection state
    this.logger = createLogger({ component: 'ConnectionState' });

    // Authentication state
    this.authenticated = false;
    this.protocolVersion = null;

    // SCRAM authentication state
    this.scramState = null; // 'initial', 'first-sent', 'ended', 'error'
    this.scramMechanism = null; // Selected SASL mechanism
    this.scramClientNonce = null;
    this.scramServerNonce = null;
    this.scramClientInitialBare = null;
    this.scramServerFirst = null;
    this.scramCredentials = null; // Server-side credentials for user
    this.scramAuthMessage = null;

    // Connection parameters from startup packet
    this.parameters = new Map();

    // Transaction state
    this.transactionStatus = TRANSACTION_STATUS.IDLE;

    // Backend identification for cancellation
    this.backendPid = process.pid;
    this.backendSecret = generateBackendSecret();

    // Connection metadata
    this.connected = true;
    this.connectionTime = new Date();
    this.connectionId = null; // Will be set by server

    // Extended query protocol state
    this.preparedStatements = new Map();
    this.portals = new Map();

    // Notification state
    this.listeningChannels = new Set(); // Channels this connection is listening to
    this.notificationManager = null; // Reference to notification manager
    this.socket = null; // Client socket for sending notifications
    // COPY protocol state
    this.copyState = null;

    // Connection statistics
    this.queriesExecuted = 0;
    this.lastActivityTime = new Date();
  }

  /**
   * Marks the connection as authenticated with protocol version
   * @param {number} protocolVersion - PostgreSQL protocol version
   */
  authenticate(protocolVersion = PROTOCOL_VERSION_3_0) {
    this.authenticated = true;
    this.protocolVersion = protocolVersion;
    this.updateActivity();
    this.logger.info(`Connection authenticated with protocol version ${protocolVersion}`);
  }

  /**
   * Sets a connection parameter
   * @param {string} name - Parameter name
   * @param {string} value - Parameter value
   */
  setParameter(name, value) {
    this.parameters.set(name, value);
    this.updateActivity();
    this.logger.debug(`Set connection parameter: ${name} = ${value}`);
  }

  /**
   * Gets a connection parameter
   * @param {string} name - Parameter name
   * @param {string} defaultValue - Default value if parameter not set
   * @returns {string} Parameter value
   */
  getParameter(name, defaultValue = null) {
    return this.parameters.get(name) || defaultValue;
  }

  /**
   * Gets the current user from connection parameters
   * @returns {string} Username
   */
  getCurrentUser() {
    return this.getParameter('user', 'postgres');
  }

  /**
   * Gets the current database from connection parameters
   * @returns {string} Database name
   */
  getCurrentDatabase() {
    return this.getParameter('database', 'postgres');
  }

  /**
   * Gets the application name from connection parameters
   * @returns {string} Application name
   */
  getApplicationName() {
    return this.getParameter('application_name', '');
  }

  /**
   * Updates transaction status
   * @param {string} status - New transaction status (I, T, E)
   */
  setTransactionStatus(status) {
    if (Object.values(TRANSACTION_STATUS).includes(status)) {
      this.transactionStatus = status;
      this.updateActivity();
      this.logger.debug(`Transaction status changed to: ${status}`);
    } else {
      this.logger.warn(`Invalid transaction status: ${status}`);
    }
  }

  /**
   * Checks if connection is in a transaction
   * @returns {boolean} True if in transaction
   */
  isInTransaction() {
    return this.transactionStatus === TRANSACTION_STATUS.IN_TRANSACTION;
  }

  /**
   * Checks if connection is in a failed transaction
   * @returns {boolean} True if in failed transaction
   */
  isInFailedTransaction() {
    return this.transactionStatus === TRANSACTION_STATUS.IN_FAILED_TRANSACTION;
  }

  /**
   * Begins a new transaction
   */
  beginTransaction() {
    this.setTransactionStatus(TRANSACTION_STATUS.IN_TRANSACTION);
  }

  /**
   * Commits the current transaction
   */
  commitTransaction() {
    this.setTransactionStatus(TRANSACTION_STATUS.IDLE);
  }

  /**
   * Rolls back the current transaction
   */
  rollbackTransaction() {
    this.setTransactionStatus(TRANSACTION_STATUS.IDLE);
  }

  /**
   * Marks transaction as failed
   */
  failTransaction() {
    this.setTransactionStatus(TRANSACTION_STATUS.IN_FAILED_TRANSACTION);
  }

  /**
   * Sets the connection copy state
   * @param {Object} copyInfo - COPY operation information
   */
  setCopyState(copyInfo) {
    this.copyState = {
      ...copyInfo,
      startedAt: new Date(),
      bytesTransferred: 0,
      rowsTransferred: 0,
    };
    this.updateActivity();
    console.log(`Started COPY operation: ${copyInfo.direction} ${copyInfo.tableName || copyInfo.query}`);
  }

  /**
   * Gets the current copy state
   * @returns {Object|null} Copy state or null
   */
  getCopyState() {
    return this.copyState || null;
  }

  /**
   * Updates copy transfer statistics
   * @param {number} bytes - Bytes transferred
   * @param {number} rows - Rows transferred
   */
  updateCopyStats(bytes = 0, rows = 0) {
    if (this.copyState) {
      this.copyState.bytesTransferred += bytes;
      this.copyState.rowsTransferred += rows;
      this.updateActivity();
    }
  }

  /**
   * Clears the copy state when operation completes
   */
  clearCopyState() {
    if (this.copyState) {
      const duration = new Date() - this.copyState.startedAt;
      console.log(`COPY operation completed: ${this.copyState.rowsTransferred} rows, ` +
        `${this.copyState.bytesTransferred} bytes in ${duration}ms`);
    }
    this.copyState = null;
    this.updateActivity();
  }

  /**
   * Checks if connection is in COPY mode
   * @returns {boolean} True if in COPY mode
   */
  isInCopyMode() {
    return this.copyState !== null;
  }

  /**
   * Adds a prepared statement to the connection
   * @param {string} name - Statement name (empty string for unnamed)
   * @param {Object} statement - Prepared statement object
   */
  addPreparedStatement(name, statement) {
    this.preparedStatements.set(name, {
      ...statement,
      createdAt: new Date(),
    });
    this.updateActivity();
    this.logger.debug(`Added prepared statement: ${name || '(unnamed)'}`);
  }

  /**
   * Gets a prepared statement
   * @param {string} name - Statement name
   * @returns {Object|null} Prepared statement or null
   */
  getPreparedStatement(name) {
    return this.preparedStatements.get(name) || null;
  }

  /**
   * Removes a prepared statement
   * @param {string} name - Statement name
   * @returns {boolean} True if statement was removed
   */
  removePreparedStatement(name) {
    const removed = this.preparedStatements.delete(name);
    if (removed) {
      this.updateActivity();
      this.logger.debug(`Removed prepared statement: ${name || '(unnamed)'}`);
    }
    return removed;
  }

  /**
   * Adds a portal to the connection
   * @param {string} name - Portal name (empty string for unnamed)
   * @param {Object} portal - Portal object
   */
  addPortal(name, portal) {
    this.portals.set(name, {
      ...portal,
      createdAt: new Date(),
    });
    this.updateActivity();
    this.logger.debug(`Added portal: ${name || '(unnamed)'}`);
  }

  /**
   * Gets a portal
   * @param {string} name - Portal name
   * @returns {Object|null} Portal or null
   */
  getPortal(name) {
    return this.portals.get(name) || null;
  }

  /**
   * Removes a portal
   * @param {string} name - Portal name
   * @returns {boolean} True if portal was removed
   */
  removePortal(name) {
    const removed = this.portals.delete(name);
    if (removed) {
      this.updateActivity();
      this.logger.debug(`Removed portal: ${name || '(unnamed)'}`);
    }
    return removed;
  }

  /**
   * Clears all unnamed prepared statements and portals
   */
  clearUnnamed() {
    this.removePreparedStatement('');
    this.removePortal('');
  }

  /**
   * Adds a notification channel to the listening set
   * @param {string} channelName - Channel name to listen to
   */
  addListeningChannel(channelName) {
    this.listeningChannels.add(channelName.toLowerCase());
    this.updateActivity();
  }

  /**
   * Removes a notification channel from the listening set
   * @param {string} channelName - Channel name to stop listening to
   */
  removeListeningChannel(channelName) {
    const removed = this.listeningChannels.delete(channelName.toLowerCase());
    if (removed) {
      this.updateActivity();
    }
    return removed;
  }

  /**
   * Removes all listening channels
   * @returns {number} Number of channels removed
   */
  clearAllListeningChannels() {
    const count = this.listeningChannels.size;
    this.listeningChannels.clear();
    if (count > 0) {
      this.updateActivity();
    }
    return count;
  }

  /**
   * Checks if connection is listening to a channel
   * @param {string} channelName - Channel name to check
   * @returns {boolean} True if listening to channel
   */
  isListeningToChannel(channelName) {
    return this.listeningChannels.has(channelName.toLowerCase());
  }

  /**
   * Gets all channels this connection is listening to
   * @returns {Array<string>} Array of channel names
   */
  getListeningChannels() {
    return Array.from(this.listeningChannels);
  }

  /**
   * Sets the notification manager reference
   * @param {NotificationManager} notificationManager - Notification manager instance
   */
  setNotificationManager(notificationManager) {
    this.notificationManager = notificationManager;
  }

  /**
   * Gets the notification manager reference
   * @returns {NotificationManager|null} Notification manager instance
   */
  getNotificationManager() {
    return this.notificationManager;
  }

  /**
   * Sets the client socket reference
   * @param {Socket} socket - Client socket
   */
  setSocket(socket) {
    this.socket = socket;
  }

  /**
   * Gets the client socket reference
   * @returns {Socket|null} Client socket
   */
  getSocket() {
    return this.socket;
  }

  /**
   * Increments the query counter
   */
  incrementQueryCount() {
    this.queriesExecuted++;
    this.updateActivity();
  }

  /**
   * Updates the last activity timestamp
   */
  updateActivity() {
    this.lastActivityTime = new Date();
  }

  /**
   * Gets connection duration in milliseconds
   * @returns {number} Duration in ms
   */
  getConnectionDuration() {
    return Date.now() - this.connectionTime.getTime();
  }

  /**
   * Gets time since last activity in milliseconds
   * @returns {number} Idle time in ms
   */
  getIdleTime() {
    return Date.now() - this.lastActivityTime.getTime();
  }

  /**
   * Closes the connection and cleans up resources
   */
  close() {
    this.connected = false;
    this.preparedStatements.clear();
    this.portals.clear();
    this.clearAllListeningChannels();
    this.logger.info(
      `Connection closed after ${this.getConnectionDuration()}ms, ${this.queriesExecuted} queries executed`
    );
  }

  /**
   * Gets connection summary information
   * @returns {Object} Connection summary
   */
  getSummary() {
    return {
      authenticated: this.authenticated,
      protocolVersion: this.protocolVersion,
      user: this.getCurrentUser(),
      database: this.getCurrentDatabase(),
      applicationName: this.getApplicationName(),
      transactionStatus: this.transactionStatus,
      isInTransaction: this.isInTransaction(),
      isInFailedTransaction: this.isInFailedTransaction(),
      backendPid: this.backendPid,
      connectionDuration: this.getConnectionDuration(),
      idleTime: this.getIdleTime(),
      queriesExecuted: this.queriesExecuted,
      preparedStatements: this.preparedStatements.size,
      portals: this.portals.size,
      listeningChannels: this.listeningChannels.size,
      connected: this.connected,
    };
  }

  /**
   * Gets connection info for logging
   * @returns {string} Formatted connection info
   */
  toString() {
    const summary = this.getSummary();
    return (
      `Connection[${summary.user}@${summary.database}:${summary.backendPid}] ` +
      `Status:${summary.transactionStatus} Queries:${summary.queriesExecuted} ` +
      `Duration:${Math.round(summary.connectionDuration / 1000)}s`
    );
  }

  /**
   * Validates the current connection state
   * @returns {Object} Validation result with isValid and errors array
   */
  validateState() {
    const errors = [];
    let isValid = true;

    // Check authentication state consistency
    if (this.authenticated && !this.protocolVersion) {
      errors.push('Connection marked as authenticated but missing protocol version');
      isValid = false;
    }

    // Check required parameters for authenticated connections
    if (this.authenticated) {
      if (!this.getCurrentUser()) {
        errors.push('Authenticated connection missing user parameter');
        isValid = false;
      }
      if (!this.getCurrentDatabase()) {
        errors.push('Authenticated connection missing database parameter');
        isValid = false;
      }
    }

    // Validate transaction status
    if (!Object.values(TRANSACTION_STATUS).includes(this.transactionStatus)) {
      errors.push(`Invalid transaction status: ${this.transactionStatus}`);
      isValid = false;
    }

    // Check connection metadata consistency
    if (!this.connected && this.authenticated) {
      errors.push('Connection marked as authenticated but not connected');
      isValid = false;
    }

    // Check backend identification
    if (!this.backendPid || !this.backendSecret) {
      errors.push('Missing backend identification (PID or secret)');
      isValid = false;
    }

    // Check timestamps validity
    if (!this.connectionTime || !this.lastActivityTime) {
      errors.push('Missing or invalid timestamp data');
      isValid = false;
    }

    // Check for reasonable activity time
    if (this.lastActivityTime < this.connectionTime) {
      errors.push('Last activity time is before connection time');
      isValid = false;
    }

    return { isValid, errors };
  }

  /**
   * Checks if connection is ready for query processing
   * @returns {boolean} True if ready for queries
   */
  isReadyForQuery() {
    if (!this.connected) return false;
    if (!this.authenticated) return false;
    if (this.isInFailedTransaction()) return false;

    const validation = this.validateState();
    return validation.isValid;
  }

  /**
   * Checks if connection can be safely reused by the connection pool
   * @returns {boolean} True if connection is reusable
   */
  isReusable() {
    // Basic reusability checks
    if (!this.connected) return false;
    if (!this.authenticated) return false;

    // Don't reuse connections in transactions
    if (this.isInTransaction()) return false;
    if (this.isInFailedTransaction()) return false;

    // Don't reuse connections with active prepared statements, portals, or listeners
    if (this.preparedStatements.size > 0) return false;
    if (this.portals.size > 0) return false;
    if (this.listeningChannels.size > 0) return false;

    // Validate overall state
    const validation = this.validateState();
    return validation.isValid;
  }

  /**
   * Resets connection state for reuse in connection pool
   * @returns {boolean} True if reset was successful
   */
  resetForReuse() {
    try {
      // Clear extended query protocol state
      this.preparedStatements.clear();
      this.portals.clear();
      this.clearAllListeningChannels();

      // Reset to idle transaction status
      this.transactionStatus = TRANSACTION_STATUS.IDLE;

      // Update activity timestamp
      this.updateActivity();

      // Validate state after reset
      const validation = this.validateState();
      if (!validation.isValid) {
        this.logger.warn('Connection reset failed validation:', validation.errors);
        return false;
      }

      this.logger.debug(`Connection ${this.backendPid} reset for reuse`);
      return true;
    } catch (error) {
      this.logger.error('Error resetting connection for reuse:', error);
      return false;
    }
  }
}

/**
 * Connection state factory and utilities
 */
class ConnectionManager {
  constructor() {
    this.connections = new Map();
    this.connectionCount = 0;
    this.logger = createLogger({ component: 'ConnectionManager' });
  }

  /**
   * Creates a new connection state
   * @param {string} connectionId - Unique connection identifier
   * @returns {ConnectionState} New connection state
   */
  createConnection(connectionId = null) {
    const id = connectionId || `conn_${++this.connectionCount}`;
    const connState = new ConnectionState();
    this.connections.set(id, connState);
    this.logger.debug(`Created new connection: ${id}`);
    return connState;
  }

  /**
   * Gets a connection by ID
   * @param {string} connectionId - Connection identifier
   * @returns {ConnectionState|null} Connection state or null
   */
  getConnection(connectionId) {
    return this.connections.get(connectionId) || null;
  }

  /**
   * Removes a connection
   * @param {string} connectionId - Connection identifier
   * @returns {boolean} True if connection was removed
   */
  removeConnection(connectionId) {
    const conn = this.connections.get(connectionId);
    if (conn) {
      conn.close();
      return this.connections.delete(connectionId);
    }
    return false;
  }

  /**
   * Gets all active connections
   * @returns {Array<ConnectionState>} Array of connection states
   */
  getAllConnections() {
    return Array.from(this.connections.values());
  }

  /**
   * Gets connection count
   * @returns {number} Number of active connections
   */
  getConnectionCount() {
    return this.connections.size;
  }

  /**
   * Cleans up idle connections
   * @param {number} maxIdleTime - Max idle time in milliseconds
   * @returns {number} Number of connections closed
   */
  cleanupIdleConnections(maxIdleTime = 300000) {
    // 5 minutes default
    let closedCount = 0;
    for (const [id, conn] of this.connections.entries()) {
      if (conn.getIdleTime() > maxIdleTime) {
        this.removeConnection(id);
        closedCount++;
      }
    }
    if (closedCount > 0) {
      this.logger.info(`Cleaned up ${closedCount} idle connections`);
    }
    return closedCount;
  }

  /**
   * Gets manager statistics
   * @returns {Object} Manager statistics
   */
  getStats() {
    const connections = this.getAllConnections();
    return {
      totalConnections: this.connectionCount,
      activeConnections: connections.length,
      authenticatedConnections: connections.filter(c => c.authenticated).length,
      transactionConnections: connections.filter(c => c.isInTransaction()).length,
      failedTransactionConnections: connections.filter(c => c.isInFailedTransaction()).length,
      totalQueries: connections.reduce((sum, c) => sum + c.queriesExecuted, 0),
      averageConnectionDuration:
        connections.length > 0
          ? connections.reduce((sum, c) => sum + c.getConnectionDuration(), 0) / connections.length
          : 0,
    };
  }
}

module.exports = {
  ConnectionState,
  ConnectionManager,
};
