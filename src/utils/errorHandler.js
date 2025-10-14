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
    this.documentationLink = options.documentationLink;
    this.suggestion = options.suggestion;

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
      documentationLink: getErrorDocumentationLink(ERROR_CODES.SYNTAX_ERROR),
      suggestion: getSuggestedFix(ERROR_CODES.SYNTAX_ERROR),
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
      documentationLink: getErrorDocumentationLink(ERROR_CODES.UNDEFINED_COLUMN),
      suggestion: getSuggestedFix(ERROR_CODES.UNDEFINED_COLUMN),
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
      documentationLink: getErrorDocumentationLink(ERROR_CODES.UNDEFINED_TABLE),
      suggestion: getSuggestedFix(ERROR_CODES.UNDEFINED_TABLE),
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
        documentationLink: getErrorDocumentationLink(ERROR_CODES.UNDEFINED_FUNCTION),
        suggestion: getSuggestedFix(ERROR_CODES.UNDEFINED_FUNCTION),
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
      documentationLink: getErrorDocumentationLink(ERROR_CODES.INTERNAL_ERROR),
      suggestion: getSuggestedFix(ERROR_CODES.INTERNAL_ERROR),
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
      documentationLink: getErrorDocumentationLink(ERROR_CODES.PROTOCOL_VIOLATION),
      suggestion: getSuggestedFix(ERROR_CODES.PROTOCOL_VIOLATION),
      ...options,
    });
  },

  /**
   * Creates a feature not supported error
   */
  featureNotSupported(feature, options = {}) {
    return createError(ERROR_CODES.FEATURE_NOT_SUPPORTED, `${feature} is not supported`, {
      hint: 'This mock server implements a subset of PostgreSQL features.',
      documentationLink: getErrorDocumentationLink(ERROR_CODES.FEATURE_NOT_SUPPORTED),
      suggestion: getSuggestedFix(ERROR_CODES.FEATURE_NOT_SUPPORTED),
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
        documentationLink: getErrorDocumentationLink(ERROR_CODES.INVALID_PARAMETER_VALUE),
        suggestion: getSuggestedFix(ERROR_CODES.INVALID_PARAMETER_VALUE),
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
      documentationLink: getErrorDocumentationLink(ERROR_CODES.DATA_EXCEPTION),
      suggestion: getSuggestedFix(ERROR_CODES.DATA_EXCEPTION),
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
        documentationLink: getErrorDocumentationLink(ERROR_CODES.NULL_VALUE_NOT_ALLOWED),
        suggestion: getSuggestedFix(ERROR_CODES.NULL_VALUE_NOT_ALLOWED),
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
      documentationLink: getErrorDocumentationLink(ERROR_CODES.SYNTAX_ERROR),
      suggestion: getSuggestedFix(ERROR_CODES.SYNTAX_ERROR),
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
      documentationLink: getErrorDocumentationLink(ERROR_CODES.SYNTAX_ERROR),
      suggestion: getSuggestedFix(ERROR_CODES.SYNTAX_ERROR),
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
      documentationLink: getErrorDocumentationLink(ERROR_CODES.SYNTAX_ERROR),
      suggestion: getSuggestedFix(ERROR_CODES.SYNTAX_ERROR),
      ...options,
    });
  },

  /**
   * Creates an array format error
   */
  invalidArrayFormat(message, options = {}) {
    return createError(ERROR_CODES.INVALID_PARAMETER_VALUE, message, {
      hint: 'Arrays must be in PostgreSQL format like {val1,val2} or ARRAY[val1,val2].',
      documentationLink: getErrorDocumentationLink(ERROR_CODES.INVALID_PARAMETER_VALUE),
      suggestion: getSuggestedFix(ERROR_CODES.INVALID_PARAMETER_VALUE),
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
function wrapError(error, context, options = {}) {
  if (error instanceof PostgresError) {
    // Add context to existing PostgresError
    const wrappedError = new PostgresError(error.code, error.message, error);
    wrappedError.context = error.context ? `${context}\n${error.context}` : context;
    if (options.internalQuery && !wrappedError.internalQuery) {
      wrappedError.internalQuery = options.internalQuery;
    }
    return wrappedError;
  }

  // Wrap generic error
  return ErrorFactory.internalError(error.message || 'Unknown error occurred', error, {
    context,
    ...(options.internalQuery ? { internalQuery: options.internalQuery } : {}),
  });
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

    if (error.documentationLink) formatted.documentation = error.documentationLink;
    if (error.suggestion) formatted.suggestion = error.suggestion;

    return formatted;
  }

  // Format generic error
  return {
    code: 'XX000',
    severity: ERROR_SEVERITY.ERROR,
    message: error.message || 'Unknown error',
    ...(isDevelopmentMode() && error.stack && { stack: error.stack }),
    documentation: getErrorDocumentationLink('XX000'),
    suggestion: getSuggestedFix('XX000'),
  };
}

/**
 * Returns a documentation URL for a given SQLSTATE code
 * @param {string} code - SQLSTATE error code
 * @returns {string} URL string
 */
function getErrorDocumentationLink(_code) {
  // Link to PostgreSQL SQLSTATE appendix
  return 'https://www.postgresql.org/docs/current/errcodes-appendix.html#ERRCODES-TABLE';
}

/**
 * Returns a suggested fix for a given SQLSTATE code
 * @param {string} code - SQLSTATE error code
 * @returns {string} Suggested fix message
 */
function getSuggestedFix(code) {
  switch (code) {
    case ERROR_CODES.SYNTAX_ERROR:
      return 'Review SQL syntax near the reported position; check quotes and keywords.';
    case ERROR_CODES.UNDEFINED_COLUMN:
      return 'Verify column names and use correct table aliases.';
    case ERROR_CODES.UNDEFINED_TABLE:
      return 'Ensure the referenced table exists and schema is correct.';
    case ERROR_CODES.UNDEFINED_FUNCTION:
      return 'Check function name and argument types; ensure function exists in current schema.';
    case ERROR_CODES.INVALID_PARAMETER_VALUE:
      return 'Validate parameter types and formats before sending the query.';
    case ERROR_CODES.NULL_VALUE_NOT_ALLOWED:
      return 'Provide non-null values or alter the column to accept NULLs if appropriate.';
    case ERROR_CODES.PROTOCOL_VIOLATION:
      return 'Update the client library and ensure it speaks protocol v3 correctly.';
    default:
      return 'Enable development mode to see stack traces and check server logs for details.';
  }
}

/**
 * Reports error to an optional tracking service (stdout stub or file logger)
 * Controlled via env vars: PG_MOCK_ERROR_TRACKING_ENABLED, PG_MOCK_ERROR_TRACKING_PROJECT
 * @param {Error|PostgresError} error
 * @param {Object} meta
 */
function reportError(error, meta = {}) {
  try {
    const enabled = String(process.env.PG_MOCK_ERROR_TRACKING_ENABLED || 'false').toLowerCase();
    if (!['true', '1', 'yes', 'on'].includes(enabled)) return;

    const payload = {
      type: error?.name || 'Error',
      project: process.env.PG_MOCK_ERROR_TRACKING_PROJECT || 'pg-wire-mock',
      environment: process.env.NODE_ENV || 'production',
      timestamp: new Date().toISOString(),
      error: formatErrorForLogging(error),
      meta,
    };
    // Simple stdout-based integration for portability; users can pipe to a collector
    // Example: PG_MOCK_ERROR_TRACKING_ENABLED=true node server.js > error-stream.ndjson
    // Downstream systems can ingest lines starting with ERROR_TRACKING\t{json}
    // Keep one-line JSON for easy ingestion
    // eslint-disable-next-line no-console
    console.error(`ERROR_TRACKING\t${JSON.stringify(payload)}`);
  } catch (_e) {
    // Never throw from error reporting
  }
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
  getErrorDocumentationLink,
  getSuggestedFix,
  reportError,
};
