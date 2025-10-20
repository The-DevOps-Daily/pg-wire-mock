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
    this.transactionIsolationLevel = 'READ COMMITTED'; // Default PostgreSQL isolation level
    this.transactionReadOnly = false;
    this.transactionDeferrable = false;

    // Savepoint stack for nested transaction support
    this.savepoints = [];

    // Transaction history for tracking
    this.transactionStartTime = null;
    this.transactionDepth = 0; // Track nested BEGIN attempts

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
   * Begins a new transaction with optional parameters
   * @param {Object} options - Transaction options
   * @param {string} options.isolationLevel - Transaction isolation level
   * @param {boolean} options.readOnly - Whether transaction is read-only
   * @param {boolean} options.deferrable - Whether transaction is deferrable
   * @throws {Error} If already in a transaction
   */
  beginTransaction(options = {}) {
    if (this.isInTransaction()) {
      // PostgreSQL doesn't allow nested BEGIN, but we track the depth
      this.transactionDepth++;
      console.warn(`WARNING: Already in transaction (depth: ${this.transactionDepth})`);
      throw new Error('Already in a transaction block');
    }

    if (this.isInFailedTransaction()) {
      throw new Error(
        'Current transaction is aborted, commands ignored until end of transaction block'
      );
    }

    this.setTransactionStatus(TRANSACTION_STATUS.IN_TRANSACTION);
    this.transactionStartTime = new Date();
    this.transactionDepth = 1;

    // Set transaction options
    if (options.isolationLevel) {
      this.transactionIsolationLevel = options.isolationLevel;
    }
    if (options.readOnly !== undefined) {
      this.transactionReadOnly = options.readOnly;
    }
    if (options.deferrable !== undefined) {
      this.transactionDeferrable = options.deferrable;
    }

    console.log(
      `Transaction started: isolation=${this.transactionIsolationLevel}, ` +
        `readOnly=${this.transactionReadOnly}`
    );
  }

  /**
   * Commits the current transaction
   * @throws {Error} If not in a transaction
   */
  commitTransaction() {
    if (!this.isInTransaction() && !this.isInFailedTransaction()) {
      throw new Error('No transaction is currently active');
    }

    // Clear savepoints on commit
    this.savepoints = [];
    this.transactionDepth = 0;
    this.transactionStartTime = null;

    // Reset transaction options to defaults
    this.transactionIsolationLevel = 'READ COMMITTED';
    this.transactionReadOnly = false;
    this.transactionDeferrable = false;

    this.setTransactionStatus(TRANSACTION_STATUS.IDLE);
    console.log('Transaction committed');
  }

  /**
   * Rolls back the current transaction
   * @throws {Error} If not in a transaction
   */
  rollbackTransaction() {
    if (!this.isInTransaction() && !this.isInFailedTransaction()) {
      throw new Error('No transaction is currently active');
    }

    // Clear savepoints on rollback
    this.savepoints = [];
    this.transactionDepth = 0;
    this.transactionStartTime = null;

    // Reset transaction options to defaults
    this.transactionIsolationLevel = 'READ COMMITTED';
    this.transactionReadOnly = false;
    this.transactionDeferrable = false;

    this.setTransactionStatus(TRANSACTION_STATUS.IDLE);
    console.log('Transaction rolled back');
  }

  /**
   * Marks transaction as failed
   */
  failTransaction() {
    this.setTransactionStatus(TRANSACTION_STATUS.IN_FAILED_TRANSACTION);
  }

  /**
   * Creates a savepoint within the current transaction
   * @param {string} name - Savepoint name
   * @throws {Error} If not in a transaction or savepoint already exists
   */
  createSavepoint(name) {
    if (!this.isInTransaction()) {
      throw new Error('SAVEPOINT can only be used in transaction blocks');
    }

    const existingIndex = this.savepoints.findIndex(sp => sp.name === name);
    if (existingIndex !== -1) {
      // PostgreSQL allows reusing savepoint names (destroys old one and creates new)
      this.savepoints.splice(existingIndex, 1);
    }

    this.savepoints.push({
      name,
      createdAt: new Date(),
      isolationLevel: this.transactionIsolationLevel,
    });

    console.log(`Savepoint created: ${name} (total: ${this.savepoints.length})`);
  }

  /**
   * Rolls back to a savepoint
   * @param {string} name - Savepoint name
   * @throws {Error} If not in a transaction or savepoint doesn't exist
   */
  rollbackToSavepoint(name) {
    if (!this.isInTransaction() && !this.isInFailedTransaction()) {
      throw new Error('ROLLBACK TO SAVEPOINT can only be used in transaction blocks');
    }

    const savepointIndex = this.savepoints.findIndex(sp => sp.name === name);
    if (savepointIndex === -1) {
      throw new Error(`Savepoint "${name}" does not exist`);
    }

    // Remove all savepoints after this one (they're invalidated)
    this.savepoints.splice(savepointIndex + 1);

    // If in failed state, rolling back to savepoint recovers the transaction
    if (this.isInFailedTransaction()) {
      this.setTransactionStatus(TRANSACTION_STATUS.IN_TRANSACTION);
    }

    console.log(`Rolled back to savepoint: ${name} (remaining: ${this.savepoints.length})`);
  }

  /**
   * Releases a savepoint
   * @param {string} name - Savepoint name
   * @param {boolean} silent - Don't throw error if savepoint doesn't exist
   * @throws {Error} If not in a transaction or savepoint doesn't exist
   */
  releaseSavepoint(name, silent = false) {
    if (!this.isInTransaction()) {
      if (!silent) {
        throw new Error('RELEASE SAVEPOINT can only be used in transaction blocks');
      }
      return;
    }

    const savepointIndex = this.savepoints.findIndex(sp => sp.name === name);
    if (savepointIndex === -1) {
      if (!silent) {
        throw new Error(`Savepoint "${name}" does not exist`);
      }
      return;
    }

    // Remove this savepoint and all after it
    this.savepoints.splice(savepointIndex);
    console.log(`Savepoint released: ${name} (remaining: ${this.savepoints.length})`);
  }

  /**
   * Gets all active savepoints
   * @returns {Array} Array of savepoint names
   */
  getSavepoints() {
    return this.savepoints.map(sp => sp.name);
  }

  /**
   * Checks if a savepoint exists
   * @param {string} name - Savepoint name
   * @returns {boolean} True if savepoint exists
   */
  hasSavepoint(name) {
    return this.savepoints.some(sp => sp.name === name);
  }

  /**
   * Sets the transaction isolation level
   * @param {string} level - Isolation level
   * @throws {Error} If invalid isolation level or not in transaction
   */
  setTransactionIsolationLevel(level) {
    const validLevels = ['READ UNCOMMITTED', 'READ COMMITTED', 'REPEATABLE READ', 'SERIALIZABLE'];

    const normalizedLevel = level.toUpperCase();
    if (!validLevels.includes(normalizedLevel)) {
      throw new Error(`Invalid isolation level: ${level}`);
    }

    // Can only set isolation level at start of transaction
    if (this.isInTransaction() && this.savepoints.length > 0) {
      throw new Error('SET TRANSACTION ISOLATION LEVEL must be called before any query');
    }

    this.transactionIsolationLevel = normalizedLevel;
    console.log(`Transaction isolation level set to: ${normalizedLevel}`);
  }

  /**
   * Gets the current transaction isolation level
   * @returns {string} Current isolation level
   */
  getTransactionIsolationLevel() {
    return this.transactionIsolationLevel;
  }

  /**
   * Gets transaction duration in milliseconds
   * @returns {number|null} Duration in ms or null if no active transaction
   */
  getTransactionDuration() {
    if (!this.transactionStartTime) return null;
    return Date.now() - this.transactionStartTime.getTime();
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
      transactionIsolationLevel: this.transactionIsolationLevel,
      transactionReadOnly: this.transactionReadOnly,
      transactionDeferrable: this.transactionDeferrable,
      transactionDuration: this.getTransactionDuration(),
      savepoints: this.getSavepoints(),
      savepointCount: this.savepoints.length,
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

      // Clear transaction state
      this.savepoints = [];
      this.transactionStartTime = null;
      this.transactionDepth = 0;
      this.transactionIsolationLevel = 'READ COMMITTED';
      this.transactionReadOnly = false;
      this.transactionDeferrable = false;

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
