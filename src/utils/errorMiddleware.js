/**
 * Standardized Error Handling Middleware
 * Provides consistent error processing across all query handlers
 */

const { PostgresError, ErrorContext, createError, isDevelopmentMode } = require('./errorHandler');
const { ERROR_CODES } = require('../protocol/constants');
const { createQueryLogger } = require('./logger');

// Create a logger instance for error middleware
let errorLogger = createQueryLogger();

/**
 * Configure the error middleware logger
 * @param {Object} config - Logger configuration
 */
function configureErrorMiddleware(config) {
  errorLogger = createQueryLogger(config);
}

/**
 * Error handling middleware class
 */
class ErrorHandlerMiddleware {
  /**
   * Wraps a query handler with standardized error processing
   * @param {string} handlerName - Name of the handler being wrapped
   * @param {Function} handler - The handler function to wrap
   * @returns {Function} Wrapped handler function
   */
  static wrapHandler(handlerName, handler) {
    return async (query, connState) => {
      const startTime = Date.now();

      try {
        const result = await handler(query, connState);

        // Log successful execution in debug mode
        if (isDevelopmentMode()) {
          const executionTime = Date.now() - startTime;
          errorLogger.debug(`Handler ${handlerName} completed successfully`, {
            executionTime,
            connectionId: connState?.id,
            queryType: this.getQueryType(query),
          });
        }

        return result;
      } catch (error) {
        return this.handleError(error, {
          handlerName,
          query,
          connState,
          executionTime: Date.now() - startTime,
        });
      }
    };
  }

  /**
   * Handles and standardizes errors from query handlers
   * @param {Error} error - The error that occurred
   * @param {Object} context - Execution context
   * @returns {Object} Standardized error response
   */
  static handleError(error, context) {
    let standardizedError;

    // If it's already a PostgresError, enhance it with execution context
    if (error instanceof PostgresError) {
      standardizedError = this.enhanceExistingError(error, context);
    } else {
      // Convert regular errors to PostgresError
      standardizedError = this.convertToPostgresError(error, context);
    }

    // Log the error with full context
    this.logError(standardizedError, context);

    // Return error result object
    return {
      error: standardizedError,
      success: false,
      affectedRows: 0,
    };
  }

  /**
   * Enhances an existing PostgresError with execution context
   * @param {PostgresError} error - Existing PostgresError
   * @param {Object} context - Execution context
   * @returns {PostgresError} Enhanced error
   */
  static enhanceExistingError(error, context) {
    // Add execution context if not already present
    if (!error.debugInfo && isDevelopmentMode()) {
      error.debugInfo = {
        ...error.debugInfo,
        handlerName: context.handlerName,
        executionTime: context.executionTime,
        connectionId: context.connState?.id,
      };
    }

    // Enhance context information
    if (!error.context) {
      error.context = `Handler: ${context.handlerName}`;
    }

    // Add routine information if missing
    if (!error.routine) {
      error.routine = context.handlerName;
    }

    return error;
  }

  /**
   * Converts a regular Error to a PostgresError
   * @param {Error} error - Regular error object
   * @param {Object} context - Execution context
   * @returns {PostgresError} Converted PostgresError
   */
  static convertToPostgresError(error, context) {
    const errorCode = this.determineErrorCode(error);
    const errorMessage = error.message || 'Internal server error';

    // Extract file and line information from stack trace
    const stackInfo = this.extractStackInfo(error.stack);

    const options = {
      detail: isDevelopmentMode() ? error.stack : 'An unexpected error occurred',
      context: `Handler: ${context.handlerName}`,
      routine: context.handlerName,
      file: stackInfo.file,
      line: stackInfo.line,
      queryContext: {
        originalQuery: context.query,
        normalizedQuery: context.query?.trim()?.toUpperCase(),
        queryType: this.getQueryType(context.query),
        executionTime: context.executionTime,
        connectionId: context.connState?.id,
      },
      connectionContext: {
        clientAddress: context.connState?.clientAddress,
        connected: context.connState?.connected,
        transactionStatus: context.connState?.transactionStatus,
        processId: context.connState?.processId,
      },
    };

    return createError(errorCode, errorMessage, options);
  }

  /**
   * Determines appropriate error code based on error type and message
   * @param {Error} error - The error to analyze
   * @returns {string} SQLSTATE error code
   */
  static determineErrorCode(error) {
    const errorMessage = error.message?.toLowerCase() || '';

    // Map common error patterns to SQLSTATE codes
    if (errorMessage.includes('syntax')) {
      return ERROR_CODES.SYNTAX_ERROR;
    } else if (errorMessage.includes('column') && errorMessage.includes('not exist')) {
      return ERROR_CODES.UNDEFINED_COLUMN;
    } else if (errorMessage.includes('table') || errorMessage.includes('relation')) {
      return ERROR_CODES.UNDEFINED_TABLE;
    } else if (errorMessage.includes('function') && errorMessage.includes('not exist')) {
      return ERROR_CODES.UNDEFINED_FUNCTION;
    } else if (errorMessage.includes('null') && errorMessage.includes('violates')) {
      return ERROR_CODES.NULL_VALUE_NOT_ALLOWED;
    } else if (errorMessage.includes('protocol')) {
      return ERROR_CODES.PROTOCOL_VIOLATION;
    } else if (errorMessage.includes('timeout')) {
      return ERROR_CODES.CONNECTION_FAILURE;
    } else {
      return ERROR_CODES.INTERNAL_ERROR;
    }
  }

  /**
   * Extracts file and line information from stack trace
   * @param {string} stack - Error stack trace
   * @returns {Object} Stack information
   */
  static extractStackInfo(stack) {
    if (!stack) return { file: null, line: null };

    const lines = stack.split('\n');
    for (const line of lines) {
      const match = line.match(/\s*at\s+.+\s+\((.+):(\d+):\d+\)/);
      if (match && !match[1].includes('node_modules')) {
        return {
          file: match[1].split('/').pop() || match[1].split('\\').pop(),
          line: match[2],
        };
      }
    }

    return { file: null, line: null };
  }

  /**
   * Determines query type from SQL string
   * @param {string} query - SQL query string
   * @returns {string} Query type
   */
  static getQueryType(query) {
    if (!query || typeof query !== 'string') return 'UNKNOWN';

    const normalized = query.trim().toUpperCase();

    if (normalized.startsWith('SELECT')) return 'SELECT';
    if (normalized.startsWith('INSERT')) return 'INSERT';
    if (normalized.startsWith('UPDATE')) return 'UPDATE';
    if (normalized.startsWith('DELETE')) return 'DELETE';
    if (normalized.startsWith('CREATE')) return 'CREATE';
    if (normalized.startsWith('DROP')) return 'DROP';
    if (normalized.startsWith('ALTER')) return 'ALTER';
    if (normalized.startsWith('EXPLAIN')) return 'EXPLAIN';
    if (normalized.startsWith('COPY')) return 'COPY';
    if (normalized.startsWith('BEGIN') || normalized.startsWith('START')) return 'BEGIN';
    if (normalized.startsWith('COMMIT')) return 'COMMIT';
    if (normalized.startsWith('ROLLBACK')) return 'ROLLBACK';

    return 'OTHER';
  }

  /**
   * Logs error with appropriate level and context
   * @param {PostgresError} error - The error to log
   * @param {Object} context - Execution context
   */
  static logError(error, context) {
    const logContext = {
      errorCode: error.code,
      severity: error.severity,
      handlerName: context.handlerName,
      connectionId: context.connState?.id,
      executionTime: context.executionTime,
      queryType: this.getQueryType(context.query),
    };

    // Include stack trace and debug info in development mode
    if (isDevelopmentMode()) {
      logContext.stackTrace = error.stack;
      logContext.debugInfo = error.debugInfo;
      logContext.query = context.query;
    }

    // Log at appropriate level based on severity
    if (error.severity === 'FATAL' || error.severity === 'PANIC') {
      errorLogger.fatal(`Query handler error: ${error.message}`, logContext);
    } else if (error.severity === 'ERROR') {
      errorLogger.error(`Query handler error: ${error.message}`, logContext);
    } else if (error.severity === 'WARNING') {
      errorLogger.warn(`Query handler warning: ${error.message}`, logContext);
    } else {
      errorLogger.info(`Query handler notice: ${error.message}`, logContext);
    }
  }
}

/**
 * Query-specific error enhancers
 */
class QueryErrorEnhancers {
  /**
   * Enhances SELECT query errors with contextual information
   * @param {PostgresError} error - The error to enhance
   * @param {string} query - The SELECT query
   * @param {Object} context - Additional context
   * @returns {PostgresError} Enhanced error
   */
  static enhanceSelectError(error, query, context = {}) {
    if (error.code === ERROR_CODES.UNDEFINED_COLUMN) {
      const columnMatch = query.match(/SELECT\s+.*?(\w+)/i);
      if (columnMatch && context.availableColumns) {
        const suggestions = ErrorContext.findSimilarObjects(
          columnMatch[1],
          context.availableColumns
        );
        if (suggestions.length > 0) {
          error.hint = `Did you mean: ${suggestions.slice(0, 3).join(', ')}?`;
          error.detail = `Column "${columnMatch[1]}" does not exist in the specified tables`;
        }
      }
    }

    if (error.code === ERROR_CODES.UNDEFINED_TABLE) {
      const tableMatch = query.match(/FROM\s+(\w+)/i);
      if (tableMatch && context.availableTables) {
        const suggestions = ErrorContext.findSimilarObjects(tableMatch[1], context.availableTables);
        if (suggestions.length > 0) {
          error.hint = `Did you mean: ${suggestions.slice(0, 3).join(', ')}?`;
        }
      }
    }

    return error;
  }

  /**
   * Enhances INSERT query errors with contextual information
   * @param {PostgresError} error - The error to enhance
   * @param {string} query - The INSERT query
   * @param {Object} context - Additional context
   * @returns {PostgresError} Enhanced error
   */
  static enhanceInsertError(error, query, context = {}) {
    if (error.code === ERROR_CODES.NULL_VALUE_NOT_ALLOWED) {
      error.detail = `Column "${error.column}" cannot be null`;
      error.hint = 'Provide a value for this required column or set a default value';

      // Add constraint context
      if (context.constraints) {
        const constraint = context.constraints.find(c => c.column === error.column);
        if (constraint) {
          error.constraint = constraint.name;
          error.context = `NOT NULL constraint "${constraint.name}" on column "${error.column}"`;
        }
      }
    }

    if (error.code === ERROR_CODES.UNIQUE_VIOLATION) {
      error.detail = 'Duplicate value violates unique constraint';
      error.hint = 'The value you are trying to insert already exists';
    }

    return error;
  }

  /**
   * Enhances COPY query errors with contextual information
   * @param {PostgresError} error - The error to enhance
   * @param {string} query - The COPY query
   * @param {Object} context - Additional context
   * @returns {PostgresError} Enhanced error
   */
  static enhanceCopyError(error, query, context = {}) {
    if (context.currentLine) {
      error.detail = `Error in COPY operation at line ${context.currentLine}`;
      error.position = context.currentLine.toString();
    }

    error.hint = 'Check data format, column count, and data types';

    const tableMatch = query.match(/COPY\s+(\w+)/i);
    if (tableMatch) {
      error.table = tableMatch[1];
      error.context = `COPY ${tableMatch[1]} FROM ${context.source || 'STDIN'}`;
    }

    return error;
  }

  /**
   * Enhances EXPLAIN query errors with contextual information
   * @param {PostgresError} error - The error to enhance
   * @param {string} query - The EXPLAIN query
   * @returns {PostgresError} Enhanced error
   */
  static enhanceExplainError(error, query) {
    // Extract the inner query from EXPLAIN
    const innerQueryMatch = query.match(/EXPLAIN\s+(?:\([^)]+\)\s+)?(.+)/is);
    if (innerQueryMatch) {
      error.internalQuery = innerQueryMatch[1].trim();
      error.context = 'EXPLAIN query analysis';
      error.hint = 'Check the syntax of the query being explained';
    }

    return error;
  }
}

module.exports = {
  ErrorHandlerMiddleware,
  QueryErrorEnhancers,
  configureErrorMiddleware,
};
