/**
 * PostgreSQL Wire Protocol Connection State Management
 * Handles client connection state, authentication, parameters, and transaction status
 */

const {
  TRANSACTION_STATUS,
  PROTOCOL_VERSION_3_0
} = require('../protocol/constants');

const {
  generateBackendSecret
} = require('../protocol/utils');

/**
 * Represents the state of a PostgreSQL client connection
 */
class ConnectionState {
  constructor() {
    // Authentication state
    this.authenticated = false;
    this.protocolVersion = null;
    
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
    
    // Extended query protocol state
    this.preparedStatements = new Map();
    this.portals = new Map();
    
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
    console.log(`Connection authenticated with protocol version ${protocolVersion}`);
  }

  /**
   * Sets a connection parameter
   * @param {string} name - Parameter name
   * @param {string} value - Parameter value
   */
  setParameter(name, value) {
    this.parameters.set(name, value);
    this.updateActivity();
    console.log(`Set connection parameter: ${name} = ${value}`);
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
      console.log(`Transaction status changed to: ${status}`);
    } else {
      console.warn(`Invalid transaction status: ${status}`);
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
   * Adds a prepared statement to the connection
   * @param {string} name - Statement name (empty string for unnamed)
   * @param {Object} statement - Prepared statement object
   */
  addPreparedStatement(name, statement) {
    this.preparedStatements.set(name, {
      ...statement,
      createdAt: new Date()
    });
    this.updateActivity();
    console.log(`Added prepared statement: ${name || '(unnamed)'}`);
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
      console.log(`Removed prepared statement: ${name || '(unnamed)'}`);
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
      createdAt: new Date()
    });
    this.updateActivity();
    console.log(`Added portal: ${name || '(unnamed)'}`);
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
      console.log(`Removed portal: ${name || '(unnamed)'}`);
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
    console.log(`Connection closed after ${this.getConnectionDuration()}ms, ${this.queriesExecuted} queries executed`);
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
      connected: this.connected
    };
  }

  /**
   * Gets connection info for logging
   * @returns {string} Formatted connection info
   */
  toString() {
    const summary = this.getSummary();
    return `Connection[${summary.user}@${summary.database}:${summary.backendPid}] ` +
           `Status:${summary.transactionStatus} Queries:${summary.queriesExecuted} ` +
           `Duration:${Math.round(summary.connectionDuration/1000)}s`;
  }
}

/**
 * Connection state factory and utilities
 */
class ConnectionManager {
  constructor() {
    this.connections = new Map();
    this.connectionCount = 0;
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
    console.log(`Created new connection: ${id}`);
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
  cleanupIdleConnections(maxIdleTime = 300000) { // 5 minutes default
    let closedCount = 0;
    for (const [id, conn] of this.connections.entries()) {
      if (conn.getIdleTime() > maxIdleTime) {
        this.removeConnection(id);
        closedCount++;
      }
    }
    if (closedCount > 0) {
      console.log(`Cleaned up ${closedCount} idle connections`);
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
      averageConnectionDuration: connections.length > 0 ? 
        connections.reduce((sum, c) => sum + c.getConnectionDuration(), 0) / connections.length : 0
    };
  }
}

module.exports = {
  ConnectionState,
  ConnectionManager
};
