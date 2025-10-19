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

    // Enhanced development mode debugging information
    if (isDevelopmentMode()) {
      Error.captureStackTrace(this, this.constructor);
      this.debugInfo = this.generateDebugInfo(options);
      this.enhancedStack = this.generateEnhancedStackTrace();
    }
  }

  /**
   * Generates comprehensive debugging information for development mode
   * @param {Object} options - Original options passed to constructor
   * @returns {Object} Debug information object
   */
  generateDebugInfo(options) {
    const debugInfo = {
      timestamp: new Date().toISOString(),
      nodeVersion: process.version,
      memoryUsage: process.memoryUsage(),
      processId: process.pid,
      uptime: process.uptime(),
    };

    // Add query context if available
    if (options.queryContext) {
      debugInfo.queryContext = {
        originalQuery: options.queryContext.originalQuery,
        normalizedQuery: options.queryContext.normalizedQuery,
        queryType: options.queryContext.queryType,
        executionTime: options.queryContext.executionTime,
        connectionId: options.queryContext.connectionId,
      };
    }

    // Add connection context if available
    if (options.connectionContext) {
      debugInfo.connectionContext = {
        clientAddress: options.connectionContext.clientAddress,
        connected: options.connectionContext.connected,
        transactionStatus: options.connectionContext.transactionStatus,
        processId: options.connectionContext.processId,
      };
    }

    return debugInfo;
  }

  /**
   * Generates enhanced stack trace with source context
   * @returns {Object} Enhanced stack trace information
   */
  generateEnhancedStackTrace() {
    const stack = this.stack ? this.stack.split('\n') : [];
    const enhancedStack = {
      frames: [],
      summary: stack[0] || 'Unknown error location',
    };

    // Process each stack frame to add context
    for (let i = 1; i < Math.min(stack.length, 10); i++) {
      const frame = this.parseStackFrame(stack[i]);
      if (frame) {
        enhancedStack.frames.push(frame);
      }
    }

    return enhancedStack;
  }

  /**
   * Parses a single stack frame to extract useful information
   * @param {string} frameString - Stack frame string
   * @returns {Object|null} Parsed frame information
   */
  parseStackFrame(frameString) {
    const frameMatch = frameString.match(/\s*at\s+(.+?)\s+\((.+):(\d+):(\d+)\)/);
    if (frameMatch) {
      return {
        function: frameMatch[1],
        file: frameMatch[2],
        line: parseInt(frameMatch[3]),
        column: parseInt(frameMatch[4]),
        isInternal: frameMatch[2].includes('node_modules') || frameMatch[2].includes('internal'),
      };
    }
    return null;
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
 * Error context generators for different error scenarios
 */
class ErrorContext {
  /**
   * Generates context for SQL parsing errors
   * @param {string} query - The SQL query being parsed
   * @param {number} position - Character position where error occurred
   * @param {string} expectedTokens - Expected tokens at this position
   * @returns {Object} Error context object
   */
  static generateParsingContext(query, position, expectedTokens) {
    const lines = query.split('\n');
    let currentPos = 0;
    let lineNumber = 1;
    let columnNumber = 1;

    // Find line and column number for the error position
    for (const line of lines) {
      if (currentPos + line.length >= position) {
        columnNumber = position - currentPos + 1;
        break;
      }
      currentPos += line.length + 1; // +1 for newline
      lineNumber++;
    }

    const errorLine = lines[lineNumber - 1] || '';
    const beforeError = errorLine.substring(0, columnNumber - 1);
    const afterError = errorLine.substring(columnNumber - 1);

    return {
      detail: `Syntax error at line ${lineNumber}, column ${columnNumber}`,
      hint: expectedTokens
        ? `Expected: ${expectedTokens}`
        : 'Check SQL syntax near the highlighted area',
      position: position.toString(),
      internalQuery: query,
      context: `SQL parsing at line ${lineNumber}`,
      file: 'query',
      line: lineNumber.toString(),
      routine: 'SQL_parser',
      queryContext: {
        errorLine: errorLine,
        beforeError: beforeError,
        afterError: afterError,
        lineNumber: lineNumber,
        columnNumber: columnNumber,
      },
    };
  }

  /**
   * Generates context for function/operator not found errors
   * @param {string} functionName - Name of the function that wasn't found
   * @param {Array} argTypes - Argument types provided
   * @param {Array} availableFunctions - List of similar available functions
   * @returns {Object} Error context object
   */
  static generateFunctionContext(functionName, argTypes = [], availableFunctions = []) {
    const argTypeStr = argTypes.length > 0 ? `(${argTypes.join(', ')})` : '()';
    const suggestions = this.findSimilarFunctions(functionName, availableFunctions);

    return {
      detail: `Function "${functionName}${argTypeStr}" does not exist`,
      hint:
        suggestions.length > 0
          ? `Did you mean: ${suggestions.slice(0, 3).join(', ')}?`
          : 'Check the function name and argument types. Use \\df to list available functions.',
      routine: functionName,
      context: 'Function resolution',
      dataType: argTypes.join(', ') || 'void',
    };
  }

  /**
   * Generates context for schema/table/column not found errors
   * @param {string} objectType - Type of object (schema, table, column)
   * @param {string} objectName - Name of the object that wasn't found
   * @param {Object} schemaInfo - Available schema information
   * @returns {Object} Error context object
   */
  static generateSchemaContext(objectType, objectName, schemaInfo = {}) {
    const suggestions = this.findSimilarObjects(objectName, schemaInfo.availableObjects || []);

    return {
      detail: `${objectType.charAt(0).toUpperCase() + objectType.slice(1)} "${objectName}" does not exist`,
      hint:
        suggestions.length > 0
          ? `Did you mean: ${suggestions.slice(0, 3).join(', ')}?`
          : `Check the ${objectType} name and your search path`,
      schema: schemaInfo.schema || 'unknown',
      table: schemaInfo.table,
      column: schemaInfo.column,
      context: `${objectType} resolution`,
      routine: `resolve_${objectType}`,
    };
  }

  /**
   * Generates context for constraint violation errors
   * @param {string} constraintType - Type of constraint (not_null, unique, foreign_key, etc.)
   * @param {Object} constraintInfo - Information about the constraint
   * @returns {Object} Error context object
   */
  static generateConstraintContext(constraintType, constraintInfo) {
    const contextMap = {
      not_null: {
        detail: `Null value violates not-null constraint on column "${constraintInfo.column}"`,
        hint: 'Provide a value for this required column or modify the constraint',
      },
      unique: {
        detail: `Duplicate value violates unique constraint "${constraintInfo.constraint}"`,
        hint: 'The value you are trying to insert already exists',
      },
      foreign_key: {
        detail: `Foreign key constraint "${constraintInfo.constraint}" violated`,
        hint: 'The referenced record does not exist in the parent table',
      },
      check: {
        detail: `Check constraint "${constraintInfo.constraint}" violated`,
        hint: 'The value does not satisfy the constraint condition',
      },
    };

    const context = contextMap[constraintType] || {
      detail: `Constraint "${constraintInfo.constraint}" violated`,
      hint: 'Check the constraint definition and your data',
    };

    return {
      ...context,
      schema: constraintInfo.schema,
      table: constraintInfo.table,
      column: constraintInfo.column,
      constraint: constraintInfo.constraint,
      context: `Constraint validation: ${constraintType}`,
      routine: 'constraint_check',
    };
  }

  /**
   * Finds similar function names using fuzzy matching
   * @param {string} searchName - Function name to search for
   * @param {Array} availableFunctions - List of available functions
   * @returns {Array} Array of similar function names
   */
  static findSimilarFunctions(searchName, availableFunctions) {
    return availableFunctions
      .filter(func => this.calculateSimilarity(searchName, func) > 0.6)
      .sort(
        (a, b) => this.calculateSimilarity(searchName, b) - this.calculateSimilarity(searchName, a)
      )
      .slice(0, 5);
  }

  /**
   * Finds similar object names using fuzzy matching
   * @param {string} searchName - Object name to search for
   * @param {Array} availableObjects - List of available objects
   * @returns {Array} Array of similar object names
   */
  static findSimilarObjects(searchName, availableObjects) {
    return availableObjects
      .filter(obj => this.calculateSimilarity(searchName, obj) > 0.5)
      .sort(
        (a, b) => this.calculateSimilarity(searchName, b) - this.calculateSimilarity(searchName, a)
      )
      .slice(0, 5);
  }

  /**
   * Calculates similarity between two strings using simple algorithm
   * @param {string} str1 - First string
   * @param {string} str2 - Second string
   * @returns {number} Similarity score between 0 and 1
   */
  static calculateSimilarity(str1, str2) {
    if (!str1 || !str2) return 0;

    str1 = str1.toLowerCase();
    str2 = str2.toLowerCase();

    if (str1 === str2) return 1;
    if (str1.includes(str2) || str2.includes(str1)) return 0.8;

    // Simple character-based similarity
    const longer = str1.length > str2.length ? str1 : str2;
    const shorter = str1.length > str2.length ? str2 : str1;
    const editDistance = this.getEditDistance(longer, shorter);

    return (longer.length - editDistance) / longer.length;
  }

  /**
   * Calculates edit distance between two strings
   * @param {string} str1 - First string
   * @param {string} str2 - Second string
   * @returns {number} Edit distance
   */
  static getEditDistance(str1, str2) {
    const matrix = Array(str2.length + 1)
      .fill()
      .map(() => Array(str1.length + 1).fill(0));

    for (let i = 0; i <= str1.length; i++) matrix[0][i] = i;
    for (let j = 0; j <= str2.length; j++) matrix[j][0] = j;

    for (let j = 1; j <= str2.length; j++) {
      for (let i = 1; i <= str1.length; i++) {
        const cost = str1[i - 1] === str2[j - 1] ? 0 : 1;
        matrix[j][i] = Math.min(
          matrix[j][i - 1] + 1,
          matrix[j - 1][i] + 1,
          matrix[j - 1][i - 1] + cost
        );
      }
    }

    return matrix[str2.length][str1.length];
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
  ErrorContext,
  ErrorFactory,
  createError,
  wrapError,
  formatErrorForLogging,
  isValidErrorStructure,
  isDevelopmentMode,
};
