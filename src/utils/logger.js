/**
 * Centralized Logging Utility
 * Provides consistent logging format across the application
 */

/**
 * Log levels with their numeric values for comparison
 */
const LOG_LEVELS = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3,
};

/**
 * Default logging configuration
 */
const DEFAULT_CONFIG = {
  enableLogging: true,
  logLevel: 'info',
  includeTimestamp: true,
  includeLevel: true,
  colorOutput: true,
};

/**
 * ANSI color codes for console output
 */
const COLORS = {
  reset: '\x1b[0m',
  error: '\x1b[31m', // Red
  warn: '\x1b[33m', // Yellow
  info: '\x1b[36m', // Cyan
  debug: '\x1b[90m', // Bright Black (Gray)
  timestamp: '\x1b[90m', // Gray
  component: '\x1b[35m', // Magenta
};

/**
 * Creates a logger instance with specific configuration
 * @param {Object} config - Logger configuration
 * @param {boolean} config.enableLogging - Enable/disable logging
 * @param {string} config.logLevel - Minimum log level to output
 * @param {boolean} config.includeTimestamp - Include timestamp in logs
 * @param {boolean} config.includeLevel - Include log level in logs
 * @param {boolean} config.colorOutput - Use colored output
 * @param {string} config.component - Component name for prefixing
 * @returns {Object} Logger instance
 */
function createLogger(config = {}) {
  const loggerConfig = { ...DEFAULT_CONFIG, ...config };

  /**
   * Formats a log message with consistent structure
   * @param {string} level - Log level
   * @param {string} message - Log message
   * @param {Object} meta - Additional metadata
   * @returns {string} Formatted log message
   */
  function formatMessage(level, message, meta = {}) {
    const parts = [];

    // Add timestamp
    if (loggerConfig.includeTimestamp) {
      const timestamp = new Date().toISOString();
      const timestampStr = loggerConfig.colorOutput
        ? `${COLORS.timestamp}[${timestamp}]${COLORS.reset}`
        : `[${timestamp}]`;
      parts.push(timestampStr);
    }

    // Add log level
    if (loggerConfig.includeLevel) {
      const levelStr = loggerConfig.colorOutput
        ? `${COLORS[level] || COLORS.reset}[${level.toUpperCase()}]${COLORS.reset}`
        : `[${level.toUpperCase()}]`;
      parts.push(levelStr);
    }

    // Add component name
    if (loggerConfig.component) {
      const componentStr = loggerConfig.colorOutput
        ? `${COLORS.component}[${loggerConfig.component}]${COLORS.reset}`
        : `[${loggerConfig.component}]`;
      parts.push(componentStr);
    }

    // Add main message
    parts.push(message);

    // Add metadata if present
    if (Object.keys(meta).length > 0) {
      const metaStr = JSON.stringify(meta);
      parts.push(metaStr);
    }

    return parts.join(' ');
  }

  /**
   * Logs a message if it meets the configured log level
   * @param {string} level - Log level
   * @param {string} message - Log message
   * @param {Object} meta - Additional metadata
   */
  function log(level, message, meta = {}) {
    if (!loggerConfig.enableLogging) {
      return;
    }

    const configLevel = LOG_LEVELS[loggerConfig.logLevel] || LOG_LEVELS.info;
    const messageLevel = LOG_LEVELS[level] || LOG_LEVELS.info;

    if (messageLevel <= configLevel) {
      const formattedMessage = formatMessage(level, message, meta);
      console.log(formattedMessage);
    }
  }

  // Return logger instance with level-specific methods
  return {
    error: (message, meta) => log('error', message, meta),
    warn: (message, meta) => log('warn', message, meta),
    info: (message, meta) => log('info', message, meta),
    debug: (message, meta) => log('debug', message, meta),
    log, // Generic log method
    config: loggerConfig,
  };
}

/**
 * Protocol-specific logger for consistent protocol message logging
 * @param {Object} config - Base configuration
 * @returns {Object} Protocol logger with specialized methods
 */
function createProtocolLogger(config = {}) {
  const baseLogger = createLogger({ ...config, component: 'PROTOCOL' });

  return {
    ...baseLogger,

    /**
     * Logs sent protocol messages
     * @param {string} messageType - Protocol message type
     * @param {string} details - Additional details
     * @param {Object} meta - Metadata
     */
    sent: (messageType, details = '', meta = {}) => {
      const message = details ? `Sent ${messageType}: ${details}` : `Sent ${messageType}`;
      baseLogger.info(message, meta);
    },

    /**
     * Logs received protocol messages
     * @param {string} messageType - Protocol message type
     * @param {string} details - Additional details
     * @param {Object} meta - Metadata
     */
    received: (messageType, details = '', meta = {}) => {
      const message = details ? `Received ${messageType}: ${details}` : `Received ${messageType}`;
      baseLogger.debug(message, meta);
    },

    /**
     * Logs protocol processing steps
     * @param {string} step - Processing step description
     * @param {Object} meta - Metadata
     */
    processing: (step, meta = {}) => {
      baseLogger.debug(`Processing: ${step}`, meta);
    },

    /**
     * Logs protocol errors
     * @param {string} error - Error description
     * @param {Object} meta - Metadata
     */
    protocolError: (error, meta = {}) => {
      baseLogger.error(`Protocol Error: ${error}`, meta);
    },
  };
}

/**
 * Connection pool specific logger
 * @param {Object} config - Base configuration
 * @returns {Object} Pool logger with specialized methods
 */
function createPoolLogger(config = {}) {
  const baseLogger = createLogger({ ...config, component: 'POOL' });

  return {
    ...baseLogger,

    /**
     * Logs connection pool operations
     * @param {string} operation - Pool operation
     * @param {Object} meta - Metadata
     */
    poolOperation: (operation, meta = {}) => {
      baseLogger.info(`Pool: ${operation}`, meta);
    },

    /**
     * Logs connection lifecycle events
     * @param {string} event - Connection event
     * @param {string} connectionId - Connection identifier
     * @param {Object} meta - Metadata
     */
    connectionEvent: (event, connectionId, meta = {}) => {
      baseLogger.debug(`Connection ${connectionId}: ${event}`, meta);
    },
  };
}

/**
 * Query processing specific logger
 * @param {Object} config - Base configuration
 * @returns {Object} Query logger with specialized methods
 */
function createQueryLogger(config = {}) {
  const baseLogger = createLogger({ ...config, component: 'QUERY' });

  return {
    ...baseLogger,

    /**
     * Logs query execution
     * @param {string} query - SQL query
     * @param {Object} meta - Metadata
     */
    queryExecution: (query, meta = {}) => {
      // Truncate long queries for readability
      const truncatedQuery = query.length > 100 ? `${query.substring(0, 100)}...` : query;
      baseLogger.info(`Executing: ${truncatedQuery}`, meta);
    },

    /**
     * Logs query results
     * @param {string} command - SQL command type
     * @param {number} rowCount - Number of rows affected
     * @param {Object} meta - Metadata
     */
    queryResult: (command, rowCount, meta = {}) => {
      baseLogger.debug(`Result: ${command} (${rowCount} rows)`, meta);
    },
  };
}

module.exports = {
  createLogger,
  createProtocolLogger,
  createPoolLogger,
  createQueryLogger,
  LOG_LEVELS,
};
