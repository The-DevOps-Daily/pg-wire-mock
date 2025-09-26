/**
 * PostgreSQL Wire Protocol Mock Server Manager
 * Manages the TCP server lifecycle, connections, and server configuration
 */

const Net = require('net');
const { ConnectionState } = require('../connection/connectionState');
const { processMessage } = require('../protocol/messageProcessors');

/**
 * Configuration options for the server
 * @typedef {Object} ServerConfig
 * @property {number} port - Port to listen on
 * @property {string} host - Host to bind to
 * @property {number} maxConnections - Maximum concurrent connections
 * @property {number} connectionTimeout - Connection timeout in milliseconds
 * @property {boolean} enableLogging - Enable detailed logging
 * @property {string} logLevel - Log level (error, warn, info, debug)
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
      ...config
    };

    this.server = null;
    this.connections = new Map();
    this.connectionCount = 0;
    this.isRunning = false;
    this.startTime = null;

    // Statistics
    this.stats = {
      connectionsAccepted: 0,
      connectionsRejected: 0,
      messagesProcessed: 0,
      queriesExecuted: 0,
      errors: 0,
      bytesReceived: 0,
      bytesSent: 0
    };

    // Cleanup interval
    this.cleanupInterval = null;
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
        
        this.server.listen(this.config.port, this.config.host, () => {
          this.isRunning = true;
          this.startTime = new Date();
          
          this.log('info', `PostgreSQL Wire Protocol Mock Server started`);
          this.log('info', `Listening on ${this.config.host}:${this.config.port}`);
          this.log('info', `Max connections: ${this.config.maxConnections}`);
          this.log('info', `Connection timeout: ${this.config.connectionTimeout}ms`);

          // Start cleanup interval (every 60 seconds)
          this.cleanupInterval = setInterval(() => {
            this.cleanupConnections();
          }, 60000);

          resolve();
        });

        this.server.on('error', (error) => {
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
   * Stops the PostgreSQL mock server
   * @returns {Promise<void>} Promise that resolves when server is stopped
   */
  async stop() {
    if (!this.isRunning) {
      return;
    }

    return new Promise((resolve) => {
      // Clear cleanup interval
      if (this.cleanupInterval) {
        clearInterval(this.cleanupInterval);
        this.cleanupInterval = null;
      }

      // Close all connections
      for (const [connectionId, connectionData] of this.connections) {
        this.closeConnection(connectionId, 'Server shutdown');
      }

      // Close server
      this.server.close(() => {
        this.isRunning = false;
        const uptime = Date.now() - this.startTime.getTime();
        
        this.log('info', `Server stopped after ${Math.round(uptime / 1000)}s uptime`);
        this.log('info', `Final stats: ${JSON.stringify(this.getStats(), null, 2)}`);
        
        resolve();
      });
    });
  }

  /**
   * Sets up server event handlers
   * @private
   */
  setupServerEventHandlers() {
    this.server.on('connection', (socket) => {
      this.handleNewConnection(socket);
    });

    this.server.on('error', (error) => {
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
    // Check connection limit
    if (this.connections.size >= this.config.maxConnections) {
      this.stats.connectionsRejected++;
      this.log('warn', `Connection rejected: max connections (${this.config.maxConnections}) reached`);
      socket.end();
      return;
    }

    const connectionId = `conn_${++this.connectionCount}`;
    const connState = new ConnectionState();
    
    const connectionData = {
      id: connectionId,
      socket: socket,
      connState: connState,
      buffer: Buffer.alloc(0),
      remoteAddress: socket.remoteAddress,
      remotePort: socket.remotePort,
      connectedAt: new Date(),
      lastActivity: new Date()
    };

    this.connections.set(connectionId, connectionData);
    this.stats.connectionsAccepted++;

    this.log('info', `New connection: ${connectionId} from ${socket.remoteAddress}:${socket.remotePort}`);

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
    const { socket, connState } = connectionData;

    // Handle incoming data
    socket.on('data', (chunk) => {
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
    socket.on('error', (error) => {
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
    socket.on('close', (hadError) => {
      if (hadError) {
        this.log('warn', `Connection ${connectionId} closed with error`);
      }
      this.connections.delete(connectionId);
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
        const processed = processMessage(connectionData.buffer, socket, connState);
        
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
          sendErrorResponse(socket, ERROR_CODES.PROTOCOL_VIOLATION, `Protocol error: ${error.message}`);
        } catch (sendError) {
          this.log('error', `Failed to send error response: ${sendError.message}`);
        }
        
        this.closeConnection(connectionId, 'Protocol error');
        break;
      }
    }
  }

  /**
   * Closes a connection
   * @param {string} connectionId - Connection identifier
   * @param {string} reason - Reason for closure
   * @private
   */
  closeConnection(connectionId, reason) {
    const connectionData = this.connections.get(connectionId);
    if (!connectionData) {
      return;
    }

    const { socket, connState } = connectionData;
    const duration = Date.now() - connectionData.connectedAt.getTime();
    
    this.log('info', `Closing connection ${connectionId}: ${reason} (duration: ${Math.round(duration/1000)}s)`);

    try {
      connState.close();
      socket.destroy();
    } catch (error) {
      this.log('error', `Error closing connection ${connectionId}: ${error.message}`);
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
    
    return {
      ...this.stats,
      activeConnections: this.connections.size,
      uptime: uptime,
      uptimeString: this.formatUptime(uptime),
      config: {
        port: this.config.port,
        host: this.config.host,
        maxConnections: this.config.maxConnections
      }
    };
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
      authenticated: conn.connState.authenticated
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
    if (!this.config.enableLogging) return;
    
    const levels = { error: 0, warn: 1, info: 2, debug: 3 };
    const configLevel = levels[this.config.logLevel] || 2;
    const messageLevel = levels[level] || 2;
    
    if (messageLevel <= configLevel) {
      const timestamp = new Date().toISOString();
      console.log(`[${timestamp}] [${level.toUpperCase()}] ${message}`);
    }
  }

  /**
   * Checks if server is running
   * @returns {boolean} True if server is running
   */
  isServerRunning() {
    return this.isRunning;
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
  ServerManager
};
