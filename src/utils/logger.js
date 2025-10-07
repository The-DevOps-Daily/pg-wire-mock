/**
 * Centralized Logging Utility
 * Provides consistent logging format across the application
 */

const fs = require('fs');
const path = require('path');

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
  enableLogging: process.env.NODE_ENV !== 'test',
  logLevel: process.env.NODE_ENV === 'test' ? 'error' : process.env.LOG_LEVEL || 'info',
  includeTimestamp: process.env.NODE_ENV !== 'test',
  includeLevel: true,
  colorOutput: process.env.NODE_ENV !== 'test',
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
    // Skip all logging in test environment unless it's an error
    if (process.env.NODE_ENV === 'test' && level !== 'error') {
      return;
    }

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
 * Query processing specific logger with detailed logging capabilities
 * @param {Object} config - Base configuration
 * @returns {Object} Query logger with specialized methods
 */
function createQueryLogger(config = {}) {
  const baseLogger = createLogger({ ...config, component: 'QUERY' });
  const queryConfig = {
    enableDetailedLogging: true,
    logParameters: true,
    logExecutionTime: true,
    maxQueryLength: 500,
    sanitizeParameters: true,
    logSlowQueries: true,
    slowQueryThreshold: 1000, // milliseconds
    enableAnalytics: true,
    ...config.queryLogging,
  };

  // Query analytics tracking
  let queryStats = {
    totalQueries: 0,
    totalExecutionTime: 0,
    averageExecutionTime: 0,
    slowQueries: 0,
    errorQueries: 0,
    queryTypes: {},
    lastReset: new Date(),
  };

  /**
   * Sanitizes query parameters for safe logging
   * @param {Array|Object} params - Query parameters
   * @returns {Array|Object} Sanitized parameters
   */
  function sanitizeParameters(params) {
    if (!queryConfig.sanitizeParameters || !params) {
      return params;
    }

    /**
     * Sanitizes individual parameter values
     * @param {*} value - Parameter value to sanitize
     * @returns {*} Sanitized value
     */
    const sanitize = value => {
      if (typeof value === 'string') {
        // Mask potential sensitive data patterns
        return value
          .replace(/\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/g, '****-****-****-****') // Credit cards
          .replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, '***@***.***') // Emails
          .replace(/\b\d{3}-\d{2}-\d{4}\b/g, '***-**-****'); // SSNs
      }
      return value;
    };

    if (Array.isArray(params)) {
      return params.map(sanitize);
    } else if (typeof params === 'object') {
      const sanitized = {};
      for (const [key, value] of Object.entries(params)) {
        sanitized[key] = sanitize(value);
      }
      return sanitized;
    }
    return sanitize(params);
  }

  /**
   * Extracts query type from SQL statement
   * @param {string} query - SQL query
   * @returns {string} Query type (SELECT, INSERT, UPDATE, etc.)
   */
  function extractQueryType(query) {
    const normalized = query.trim().toUpperCase();
    const queryTypes = [
      'SELECT',
      'INSERT',
      'UPDATE',
      'DELETE',
      'CREATE',
      'ALTER',
      'DROP',
      'TRUNCATE',
      'BEGIN',
      'COMMIT',
      'ROLLBACK',
      'SAVEPOINT',
      'RELEASE',
      'ANALYZE',
      'EXPLAIN',
      'SHOW',
      'SET',
      'RESET',
      'COPY',
      'VACUUM',
      'REINDEX',
      'CLUSTER',
      'LOCK',
      'UNLOCK',
      'GRANT',
      'REVOKE',
      'COMMENT',
      'PREPARE',
      'EXECUTE',
      'DEALLOCATE',
      'DECLARE',
      'FETCH',
      'MOVE',
      'CLOSE',
      'LISTEN',
      'NOTIFY',
      'LOAD',
    ];
    const pattern = new RegExp(`^(${queryTypes.join('|')})`);
    const match = normalized.match(pattern);
    return match ? match[1] : 'UNKNOWN';
  }

  /**
   * Updates query analytics
   * @param {string} queryType - Type of query
   * @param {number} executionTime - Execution time in milliseconds
   * @param {boolean} hasError - Whether query had an error
   */
  function updateAnalytics(queryType, executionTime, hasError = false) {
    if (!queryConfig.enableAnalytics) return;

    queryStats.totalQueries++;
    queryStats.totalExecutionTime += executionTime;
    queryStats.averageExecutionTime = queryStats.totalExecutionTime / queryStats.totalQueries;

    if (executionTime >= queryConfig.slowQueryThreshold) {
      queryStats.slowQueries++;
    }

    if (hasError) {
      queryStats.errorQueries++;
    }

    queryStats.queryTypes[queryType] = (queryStats.queryTypes[queryType] || 0) + 1;
  }

  return {
    ...baseLogger,

    /**
     * Starts query execution logging with detailed metadata
     * @param {string} query - SQL query
     * @param {Object} meta - Additional metadata
     * @returns {Object} Query session data for completion logging
     */
    queryStart: (query, meta = {}) => {
      const startTime = process.hrtime.bigint();
      const timestamp = new Date().toISOString();
      const queryType = extractQueryType(query);
      const sessionId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

      const querySession = {
        sessionId,
        query,
        queryType,
        startTime,
        timestamp,
        meta: { ...meta },
      };

      if (queryConfig.enableDetailedLogging) {
        const truncatedQuery =
          query.length > queryConfig.maxQueryLength
            ? `${query.substring(0, queryConfig.maxQueryLength)}...`
            : query;

        baseLogger.info(`Query Started [${sessionId}]`, {
          query: truncatedQuery,
          queryType,
          timestamp,
          connectionId: meta.connectionId,
          user: meta.user,
          database: meta.database,
        });
      }

      return querySession;
    },

    /**
     * Logs query completion with execution time and results
     * @param {Object} querySession - Query session from queryStart
     * @param {Object} result - Query execution result
     */
    queryComplete: (querySession, result = {}) => {
      const endTime = process.hrtime.bigint();
      const executionTimeNs = endTime - querySession.startTime;
      const executionTimeMs = Number(executionTimeNs) / 1000000; // Convert to milliseconds

      // Update analytics
      updateAnalytics(querySession.queryType, executionTimeMs, !!result.error);

      const logData = {
        sessionId: querySession.sessionId,
        queryType: querySession.queryType,
        executionTime: `${executionTimeMs.toFixed(3)}ms`,
        executionTimeMs,
        rowCount: result.rowCount || 0,
        command: result.command,
        connectionId: querySession.meta.connectionId,
        user: querySession.meta.user,
        database: querySession.meta.database,
        timestamp: new Date().toISOString(),
      };

      if (result.error) {
        baseLogger.error(`Query Failed [${querySession.sessionId}]`, {
          ...logData,
          error: result.error.message || result.error,
          errorCode: result.error.code,
        });
      } else if (executionTimeMs >= queryConfig.slowQueryThreshold) {
        baseLogger.warn(`Slow Query [${querySession.sessionId}]`, {
          ...logData,
          query:
            querySession.query.length > queryConfig.maxQueryLength
              ? `${querySession.query.substring(0, queryConfig.maxQueryLength)}...`
              : querySession.query,
        });
      } else if (queryConfig.enableDetailedLogging) {
        baseLogger.info(`Query Completed [${querySession.sessionId}]`, logData);
      }
    },

    /**
     * Logs query with parameters (for prepared statements)
     * @param {string} query - SQL query
     * @param {Array|Object} parameters - Query parameters
     * @param {Object} meta - Additional metadata
     */
    queryWithParameters: (query, parameters, meta = {}) => {
      if (!queryConfig.logParameters) return;

      const sanitizedParams = sanitizeParameters(parameters);
      const truncatedQuery =
        query.length > queryConfig.maxQueryLength
          ? `${query.substring(0, queryConfig.maxQueryLength)}...`
          : query;

      baseLogger.info('Query with Parameters', {
        query: truncatedQuery,
        parameters: sanitizedParams,
        parameterCount: Array.isArray(parameters)
          ? parameters.length
          : Object.keys(parameters || {}).length,
        connectionId: meta.connectionId,
        user: meta.user,
        database: meta.database,
        timestamp: new Date().toISOString(),
      });
    },

    /**
     * Gets current query analytics
     * @returns {Object} Current query statistics
     */
    getAnalytics: () => ({ ...queryStats }),

    /**
     * Resets query analytics
     */
    resetAnalytics: () => {
      queryStats = {
        totalQueries: 0,
        totalExecutionTime: 0,
        averageExecutionTime: 0,
        slowQueries: 0,
        errorQueries: 0,
        queryTypes: {},
        lastReset: new Date(),
      };
    },

    /**
     * Legacy method for backward compatibility
     * @param {string} query - SQL query
     * @param {Object} meta - Metadata
     */
    queryExecution: (query, meta = {}) => {
      const truncatedQuery = query.length > 100 ? `${query.substring(0, 100)}...` : query;
      baseLogger.info(`Executing: ${truncatedQuery}`, meta);
    },

    /**
     * Legacy method for backward compatibility
     * @param {string} command - SQL command type
     * @param {number} rowCount - Number of rows affected
     * @param {Object} meta - Metadata
     */
    queryResult: (command, rowCount, meta = {}) => {
      baseLogger.debug(`Result: ${command} (${rowCount} rows)`, meta);
    },
  };
}

/**
 * File-based logger with rotation capabilities
 * @param {Object} config - File logger configuration
 * @returns {Object} File logger instance
 */
function createFileLogger(config = {}) {
  const fileConfig = {
    baseDir: config.baseDir || './logs',
    maxFileSize: config.maxFileSize || 10 * 1024 * 1024, // 10MB
    maxFiles: config.maxFiles || 5,
    datePattern: config.datePattern || 'YYYY-MM-DD',
    extension: config.extension || '.log',
    enableCompression: config.enableCompression || false,
    ...config,
  };

  // Ensure log directory exists
  if (!fs.existsSync(fileConfig.baseDir)) {
    try {
      fs.mkdirSync(fileConfig.baseDir, { recursive: true });
    } catch (error) {
      console.error(`Failed to create log directory: ${error.message}`);
    }
  }

  /**
   * Gets current date string for file naming
   * @returns {string} Formatted date string
   */
  function getCurrentDateString() {
    const now = new Date();
    return now.toISOString().split('T')[0]; // YYYY-MM-DD format
  }

  /**
   * Gets log file path for given filename and date
   * @param {string} filename - Base filename
   * @param {string} date - Date string (optional)
   * @returns {string} Full file path
   */
  function getLogFilePath(filename, date = null) {
    const dateStr = date || getCurrentDateString();
    const fullName = `${filename}-${dateStr}${fileConfig.extension}`;
    return path.join(fileConfig.baseDir, fullName);
  }

  /**
   * Checks if file needs rotation based on size
   * @param {string} filePath - Path to log file
   * @returns {boolean} True if rotation needed
   */
  function needsRotation(filePath) {
    try {
      const stats = fs.statSync(filePath);
      return stats.size >= fileConfig.maxFileSize;
    } catch (error) {
      return false;
    }
  }

  /**
   * Rotates log file by renaming with timestamp
   * @param {string} filePath - Path to log file to rotate
   */
  function rotateFile(filePath) {
    try {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const rotatedPath = filePath.replace(
        fileConfig.extension,
        `-${timestamp}${fileConfig.extension}`
      );
      fs.renameSync(filePath, rotatedPath);

      // Clean up old files
      cleanupOldFiles(path.dirname(filePath), path.basename(filePath, fileConfig.extension));
    } catch (error) {
      console.error(`Failed to rotate log file: ${error.message}`);
    }
  }

  /**
   * Cleans up old log files based on retention policy
   * @param {string} dir - Log directory
   * @param {string} baseName - Base filename pattern
   */
  function cleanupOldFiles(dir, baseName) {
    try {
      const files = fs
        .readdirSync(dir)
        .filter(file => file.startsWith(baseName) && file.endsWith(fileConfig.extension))
        .map(file => ({
          name: file,
          path: path.join(dir, file),
          stats: fs.statSync(path.join(dir, file)),
        }))
        .sort((a, b) => b.stats.mtime - a.stats.mtime);

      // Keep only the specified number of files
      const filesToDelete = files.slice(fileConfig.maxFiles);
      for (const file of filesToDelete) {
        fs.unlinkSync(file.path);
      }
    } catch (error) {
      console.error(`Failed to cleanup old log files: ${error.message}`);
    }
  }

  /**
   * Writes log entry to file
   * @param {string} filename - Base filename
   * @param {string} logEntry - Log entry to write
   */
  function writeToFile(filename, logEntry) {
    const filePath = getLogFilePath(filename);

    try {
      // Check if rotation is needed
      if (fs.existsSync(filePath) && needsRotation(filePath)) {
        rotateFile(filePath);
      }

      // Append log entry
      fs.appendFileSync(filePath, logEntry + '\n', 'utf8');
    } catch (error) {
      console.error(`Failed to write to log file: ${error.message}`);
    }
  }

  /**
   * Creates a file-based logger for specific log type
   * @param {string} filename - Base filename for logs
   * @param {Object} loggerConfig - Logger configuration
   * @returns {Object} File logger instance
   */
  function createSpecificFileLogger(filename, loggerConfig = {}) {
    const baseLogger = createLogger({ ...loggerConfig, includeTimestamp: true });

    return {
      ...baseLogger,

      /**
       * Logs message to both console and file
       * @param {string} level - Log level
       * @param {string} message - Log message
       * @param {Object} meta - Additional metadata
       */
      log: (level, message, meta = {}) => {
        // Console logging
        baseLogger.log(level, message, meta);

        // File logging
        const logEntry = JSON.stringify({
          timestamp: new Date().toISOString(),
          level: level.toUpperCase(),
          component: loggerConfig.component || 'APP',
          message,
          meta,
        });
        writeToFile(filename, logEntry);
      },

      /**
       * Writes raw JSON entry to file
       * @param {Object} entry - Raw log entry object
       */
      writeRaw: entry => {
        const logEntry = JSON.stringify({
          timestamp: new Date().toISOString(),
          ...entry,
        });
        writeToFile(filename, logEntry);
      },
    };
  }

  return {
    createSpecificFileLogger,
    writeToFile,
    getLogFilePath,
    rotateFile,
    cleanupOldFiles,
    needsRotation,
  };
}

/**
 * Query analysis utilities
 */
const QueryAnalyzer = {
  /**
   * Analyzes query patterns from log data
   * @param {Array} queryLogs - Array of query log entries
   * @returns {Object} Analysis results
   */
  analyzePatterns: queryLogs => {
    const analysis = {
      totalQueries: queryLogs.length,
      uniqueQueries: new Set(),
      queryTypes: {},
      slowQueries: [],
      errorQueries: [],
      timeDistribution: {
        fast: 0, // < 100ms
        medium: 0, // 100ms - 1s
        slow: 0, // 1s - 5s
        verySlow: 0, // > 5s
      },
      topQueries: {},
      executionTimeStats: {
        min: Number.MAX_VALUE,
        max: 0,
        total: 0,
        average: 0,
      },
    };

    for (const log of queryLogs) {
      const { query, executionTimeMs, queryType, error } = log;

      // Track unique queries
      analysis.uniqueQueries.add(query);

      // Count query types
      analysis.queryTypes[queryType] = (analysis.queryTypes[queryType] || 0) + 1;

      // Track execution time stats
      if (executionTimeMs !== undefined) {
        analysis.executionTimeStats.min = Math.min(
          analysis.executionTimeStats.min,
          executionTimeMs
        );
        analysis.executionTimeStats.max = Math.max(
          analysis.executionTimeStats.max,
          executionTimeMs
        );
        analysis.executionTimeStats.total += executionTimeMs;

        // Time distribution
        if (executionTimeMs < 100) {
          analysis.timeDistribution.fast++;
        } else if (executionTimeMs < 1000) {
          analysis.timeDistribution.medium++;
        } else if (executionTimeMs < 5000) {
          analysis.timeDistribution.slow++;
        } else {
          analysis.timeDistribution.verySlow++;
        }

        // Track slow queries
        if (executionTimeMs > 1000) {
          analysis.slowQueries.push(log);
        }
      }

      // Track errors
      if (error) {
        analysis.errorQueries.push(log);
      }

      // Count query frequency
      const queryHash = query.substring(0, 100); // Use first 100 chars as identifier
      analysis.topQueries[queryHash] = (analysis.topQueries[queryHash] || 0) + 1;
    }

    // Calculate average
    if (queryLogs.length > 0) {
      analysis.executionTimeStats.average = analysis.executionTimeStats.total / queryLogs.length;
    }

    // Convert unique queries set to count
    analysis.uniqueQueryCount = analysis.uniqueQueries.size;
    delete analysis.uniqueQueries;

    // Sort top queries by frequency
    analysis.topQueries = Object.entries(analysis.topQueries)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 10)
      .reduce((obj, [query, count]) => {
        obj[query] = count;
        return obj;
      }, {});

    return analysis;
  },

  /**
   * Generates performance report
   * @param {Array} queryLogs - Array of query log entries
   * @returns {string} Formatted report
   */
  generateReport: queryLogs => {
    const analysis = QueryAnalyzer.analyzePatterns(queryLogs);

    let report = '=== Query Performance Report ===\n\n';
    report += `Total Queries: ${analysis.totalQueries}\n`;
    report += `Unique Queries: ${analysis.uniqueQueryCount}\n`;
    report += `Error Rate: ${((analysis.errorQueries.length / analysis.totalQueries) * 100).toFixed(2)}%\n\n`;

    report += 'Query Types:\n';
    for (const [type, count] of Object.entries(analysis.queryTypes)) {
      report += `  ${type}: ${count}\n`;
    }

    report += '\nExecution Time Distribution:\n';
    report += `  Fast (< 100ms): ${analysis.timeDistribution.fast}\n`;
    report += `  Medium (100ms - 1s): ${analysis.timeDistribution.medium}\n`;
    report += `  Slow (1s - 5s): ${analysis.timeDistribution.slow}\n`;
    report += `  Very Slow (> 5s): ${analysis.timeDistribution.verySlow}\n\n`;

    if (analysis.executionTimeStats.total > 0) {
      report += 'Execution Time Stats:\n';
      report += `  Min: ${analysis.executionTimeStats.min.toFixed(3)}ms\n`;
      report += `  Max: ${analysis.executionTimeStats.max.toFixed(3)}ms\n`;
      report += `  Average: ${analysis.executionTimeStats.average.toFixed(3)}ms\n\n`;
    }

    if (analysis.slowQueries.length > 0) {
      report += `Top ${Math.min(5, analysis.slowQueries.length)} Slowest Queries:\n`;
      analysis.slowQueries
        .sort((a, b) => (b.executionTimeMs || 0) - (a.executionTimeMs || 0))
        .slice(0, 5)
        .forEach((log, i) => {
          report += `  ${i + 1}. ${log.executionTimeMs}ms - ${log.query.substring(0, 80)}...\n`;
        });
    }

    return report;
  },
};

module.exports = {
  createLogger,
  createProtocolLogger,
  createPoolLogger,
  createQueryLogger,
  createFileLogger,
  QueryAnalyzer,
  LOG_LEVELS,
};
