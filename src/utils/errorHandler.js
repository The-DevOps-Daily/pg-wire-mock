/**
 * Enhanced Error Handler Utility
 * Provides comprehensive error handling with detailed debugging information
 */

const { ERROR_CODES, ERROR_SEVERITY, ERROR_MESSAGES } = require('../protocol/constants');

/**
 * Enhanced error class with detailed debugging information
 */
class PostgresError extends Error {
  constructor(code, message, options = {}) {
    super(message);
    this.name = 'PostgresError';
    this.code = code;
    this.severity = options.severity || ERROR_SEVERITY.ERROR;
    this.detail = options.detail;
    this.hint = options.hint;
    this.position = options.position;
    this.internalPosition = options.internalPosition;
    this.internalQuery = options.internalQuery;
    this.context = options.context;
    this.schema = options.schema;
    this.table = options.table;
    this.column = options.column;
    this.dataType = options.dataType;
    this.constraint = options.constraint;
    this.file = options.file;
    this.line = options.line;
    this.routine = options.routine;

    // Capture stack trace in development mode
    if (isDevelopmentMode()) {
      Error.captureStackTrace(this, this.constructor);
    }
  }

  /**
   * Converts error to protocol format
   * @returns {Object} Error object ready for sendErrorResponse
   */
  toProtocolFormat() {
    const result = {
      code: this.code,
      message: this.message,
      additionalFields: {},
    };

    // Add optional fields that are set
    const optionalFields = [
      'detail',
      'hint',
      'position',
      'internalPosition',
      'internalQuery',
      'context',
      'schema',
      'table',
      'column',
      'dataType',
      'constraint',
      'file',
      'line',
      'routine',
    ];

    optionalFields.forEach(field => {
      if (this[field] !== undefined) {
        result[field] = this[field];
      }
    });

    // Include stack trace in development mode
    if (isDevelopmentMode() && this.stack) {
      result.context = this.formatContextWithStack(result.context);
    }

    result.severity = this.severity;

    return result;
  }

  /**
   * Formats context with stack trace
   * @param {string} existingContext - Existing context string
   * @returns {string} Context with stack trace appended
   */
  formatContextWithStack(existingContext) {
    const stackLines = this.stack.split('\n').slice(1, 6); // Skip first line and limit to 5 frames
    const formattedStack = stackLines.map(line => line.trim()).join('\n  ');

    if (existingContext) {
      return `${existingContext}\n\nStack trace (development mode):\n  ${formattedStack}`;
    }
    return `Stack trace (development mode):\n  ${formattedStack}`;
  }
}

/**
 * Checks if the server is running in development mode
 * @returns {boolean} True if in development mode
 */
function isDevelopmentMode() {
  const nodeEnv = process.env.NODE_ENV || 'production';
  const logLevel = process.env.PG_MOCK_LOG_LEVEL || 'info';
  return nodeEnv === 'development' || logLevel === 'debug';
}

/**
 * Creates a standardized error object
 * @param {string} code - SQLSTATE error code
 * @param {string} message - Error message
 * @param {Object} options - Additional error options
 * @returns {PostgresError} Error object
 */
function createError(code, message, options = {}) {
  return new PostgresError(code, message, options);
}

/**
 * Error factory functions for common error types
 */
const ErrorFactory = {
  /**
   * Creates a syntax error
   */
  syntaxError(message, options = {}) {
    return createError(ERROR_CODES.SYNTAX_ERROR, message, {
      hint: 'Check your SQL syntax and try again.',
      ...options,
    });
  },

  /**
   * Creates an undefined column error
   */
  undefinedColumn(columnName, tableName, options = {}) {
    return createError(ERROR_CODES.UNDEFINED_COLUMN, `column "${columnName}" does not exist`, {
      hint: tableName
        ? `Perhaps you meant to reference a column from table "${tableName}".`
        : 'Check the column name and table reference.',
      column: columnName,
      table: tableName,
      ...options,
    });
  },

  /**
   * Creates an undefined table error
   */
  undefinedTable(tableName, options = {}) {
    return createError(ERROR_CODES.UNDEFINED_TABLE, `relation "${tableName}" does not exist`, {
      hint: 'Check that the table name is spelled correctly and exists in the schema.',
      table: tableName,
      ...options,
    });
  },

  /**
   * Creates an undefined function error
   */
  undefinedFunction(functionName, argTypes, options = {}) {
    const argTypeStr = argTypes ? `(${argTypes.join(', ')})` : '';
    return createError(
      ERROR_CODES.UNDEFINED_FUNCTION,
      `function ${functionName}${argTypeStr} does not exist`,
      {
        hint: 'Check the function name and that you are passing the correct argument types.',
        routine: functionName,
        ...options,
      }
    );
  },

  /**
   * Creates an internal error
   */
  internalError(message, error, options = {}) {
    const context = error && isDevelopmentMode() ? `Original error: ${error.message}` : undefined;

    return createError(ERROR_CODES.INTERNAL_ERROR, message, {
      detail: 'An unexpected error occurred while processing the query.',
      hint: 'This may be a bug in the server. Please report it if the issue persists.',
      context,
      file: error?.fileName,
      line: error?.lineNumber?.toString(),
      ...options,
    });
  },

  /**
   * Creates a protocol violation error
   */
  protocolViolation(message, options = {}) {
    return createError(ERROR_CODES.PROTOCOL_VIOLATION, message, {
      detail: 'The client sent a message that violates the PostgreSQL protocol.',
      hint: 'This is usually a client library issue. Check that you are using a compatible client.',
      ...options,
    });
  },

  /**
   * Creates a feature not supported error
   */
  featureNotSupported(feature, options = {}) {
    return createError(ERROR_CODES.FEATURE_NOT_SUPPORTED, `${feature} is not supported`, {
      hint: 'This mock server implements a subset of PostgreSQL features.',
      ...options,
    });
  },

  /**
   * Creates an invalid parameter value error
   */
  invalidParameterValue(parameter, value, options = {}) {
    return createError(
      ERROR_CODES.INVALID_PARAMETER_VALUE,
      `invalid value for parameter "${parameter}": "${value}"`,
      {
        hint: 'Check that the parameter value is in the correct format.',
        ...options,
      }
    );
  },

  /**
   * Creates a data exception error
   */
  dataException(message, options = {}) {
    return createError(ERROR_CODES.DATA_EXCEPTION, message, {
      hint: 'Check that the data is in the correct format and type.',
      ...options,
    });
  },

  /**
   * Creates a null value not allowed error
   */
  nullNotAllowed(columnName, options = {}) {
    return createError(
      ERROR_CODES.NULL_VALUE_NOT_ALLOWED,
      `null value in column "${columnName}" violates not-null constraint`,
      {
        column: columnName,
        hint: 'The column does not allow null values.',
        ...options,
      }
    );
  },

  /**
   * Creates an empty query error
   */
  emptyQuery(options = {}) {
    return createError(ERROR_CODES.SYNTAX_ERROR, ERROR_MESSAGES.EMPTY_QUERY, {
      hint: 'Ensure that you are sending a non-empty SQL query.',
      ...options,
    });
  },

  /**
   * Creates an unterminated string error
   */
  unterminatedString(position, options = {}) {
    return createError(ERROR_CODES.SYNTAX_ERROR, ERROR_MESSAGES.UNTERMINATED_STRING, {
      position: position?.toString(),
      hint: 'Make sure all string literals are properly closed with matching quotes.',
      ...options,
    });
  },

  /**
   * Creates an unterminated identifier error
   */
  unterminatedIdentifier(position, options = {}) {
    return createError(ERROR_CODES.SYNTAX_ERROR, ERROR_MESSAGES.UNTERMINATED_IDENTIFIER, {
      position: position?.toString(),
      hint: 'Make sure all quoted identifiers are properly closed with matching quotes.',
      ...options,
    });
  },

  /**
   * Creates an array format error
   */
  invalidArrayFormat(message, options = {}) {
    return createError(ERROR_CODES.INVALID_PARAMETER_VALUE, message, {
      hint: 'Arrays must be in PostgreSQL format like {val1,val2} or ARRAY[val1,val2].',
      ...options,
    });
  },
};

/**
 * Wraps an error with additional context
 * @param {Error} error - Original error
 * @param {string} context - Additional context
 * @returns {PostgresError} Wrapped error
 */
function wrapError(error, context) {
  if (error instanceof PostgresError) {
    // Add context to existing PostgresError
    const wrappedError = new PostgresError(error.code, error.message, error);
    wrappedError.context = error.context ? `${context}\n${error.context}` : context;
    return wrappedError;
  }

  // Wrap generic error
  return ErrorFactory.internalError(error.message || 'Unknown error occurred', error, { context });
}

/**
 * Formats an error for logging
 * @param {Error|PostgresError} error - Error to format
 * @returns {Object} Formatted error for logging
 */
function formatErrorForLogging(error) {
  if (error instanceof PostgresError) {
    const formatted = {
      code: error.code,
      severity: error.severity,
      message: error.message,
    };

    // Add optional fields
    if (error.detail) formatted.detail = error.detail;
    if (error.hint) formatted.hint = error.hint;
    if (error.position) formatted.position = error.position;
    if (error.context) formatted.context = error.context;
    if (error.schema) formatted.schema = error.schema;
    if (error.table) formatted.table = error.table;
    if (error.column) formatted.column = error.column;
    if (error.routine) formatted.routine = error.routine;

    if (isDevelopmentMode() && error.stack) {
      formatted.stack = error.stack;
    }

    return formatted;
  }

  // Format generic error
  return {
    code: 'XX000',
    severity: ERROR_SEVERITY.ERROR,
    message: error.message || 'Unknown error',
    ...(isDevelopmentMode() && error.stack && { stack: error.stack }),
  };
}

/**
 * Validates error structure
 * @param {Object} error - Error object to validate
 * @returns {boolean} True if valid
 */
function isValidErrorStructure(error) {
  return (
    error &&
    typeof error === 'object' &&
    typeof error.code === 'string' &&
    typeof error.message === 'string'
  );
}

module.exports = {
  PostgresError,
  ErrorFactory,
  createError,
  wrapError,
  formatErrorForLogging,
  isValidErrorStructure,
  isDevelopmentMode,
};
