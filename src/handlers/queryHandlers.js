/**
 * PostgreSQL Wire Protocol Query Handlers
 * Functions for processing SQL queries and generating appropriate responses
 */

const {
  DATA_TYPES,
  TRANSACTION_STATUS,
  ERROR_CODES,
  ERROR_MESSAGES,
} = require('../protocol/constants');

const { formatCommandTag } = require('../protocol/utils');
const { createQueryLogger } = require('../utils/logger');
const { ErrorFactory, wrapError, formatErrorForLogging } = require('../utils/errorHandler');

// Create query logger instance (will be configured by server)
let queryLogger = createQueryLogger();

/**
 * Configures the query logger
 * @param {Object} config - Logger configuration
 */
function configureQueryLogger(config) {
  queryLogger = createQueryLogger(config);
}

const {
  sendRowDescription,
  sendDataRow,
  sendCommandComplete,
  sendEmptyQueryResponse,
  sendErrorResponse,
} = require('../protocol/messageBuilders');

/**
 * Mock database schema for introspection queries
 * This represents a realistic database structure that tools and ORMs can discover
 */
const MOCK_SCHEMA = {
  // Database schemas (namespaces)
  schemas: [
    { schema_name: 'public' },
    { schema_name: 'information_schema' },
    { schema_name: 'pg_catalog' },
  ],

  // Mock tables with realistic structure
  tables: [
    {
      table_catalog: 'postgres',
      table_schema: 'public',
      table_name: 'users',
      table_type: 'BASE TABLE',
      columns: [
        {
          column_name: 'id',
          data_type: 'integer',
          is_nullable: 'NO',
          column_default: "nextval('users_id_seq'::regclass)",
          ordinal_position: 1,
        },
        {
          column_name: 'name',
          data_type: 'character varying',
          character_maximum_length: 255,
          is_nullable: 'YES',
          column_default: null,
          ordinal_position: 2,
        },
        {
          column_name: 'email',
          data_type: 'character varying',
          character_maximum_length: 255,
          is_nullable: 'NO',
          column_default: null,
          ordinal_position: 3,
        },
        {
          column_name: 'created_at',
          data_type: 'timestamp with time zone',
          is_nullable: 'NO',
          column_default: 'CURRENT_TIMESTAMP',
          ordinal_position: 4,
        },
      ],
    },
    {
      table_catalog: 'postgres',
      table_schema: 'public',
      table_name: 'posts',
      table_type: 'BASE TABLE',
      columns: [
        {
          column_name: 'id',
          data_type: 'integer',
          is_nullable: 'NO',
          column_default: "nextval('posts_id_seq'::regclass)",
          ordinal_position: 1,
        },
        {
          column_name: 'title',
          data_type: 'text',
          is_nullable: 'NO',
          column_default: null,
          ordinal_position: 2,
        },
        {
          column_name: 'content',
          data_type: 'text',
          is_nullable: 'YES',
          column_default: null,
          ordinal_position: 3,
        },
        {
          column_name: 'user_id',
          data_type: 'integer',
          is_nullable: 'NO',
          column_default: null,
          ordinal_position: 4,
        },
      ],
    },
  ],
};

/**
 * Query result structure
 * @typedef {Object} QueryResult
 * @property {Array} columns - Column descriptors for RowDescription
 * @property {Array} rows - Data rows
 * @property {string} command - SQL command type
 * @property {number} rowCount - Number of rows affected/returned
 * @property {Object} error - Error information if query failed
 */

/**
 * Executes a single SQL query and sends appropriate response
 * @param {string} query - The SQL query to execute
 * @param {Socket} socket - Client socket for sending responses
 * @param {ConnectionState} connState - Connection state object
 */
function executeQuery(query, socket, connState) {
  // Start detailed query logging session
  const querySession = queryLogger.queryStart(query, {
    connectionId: connState.connectionId,
    user: connState.getCurrentUser(),
    database: connState.getCurrentDatabase(),
    transactionStatus: connState.transactionStatus,
  });

  let results;
  try {
    // Process the query and get results
    results = processQuery(query, connState);
  } catch (error) {
    // Handle unexpected processing errors
    results = {
      error: error instanceof Error ? error : new Error(String(error)),
      command: 'UNKNOWN',
      rowCount: 0,
    };
  }

  // Complete query logging with results
  queryLogger.queryComplete(querySession, results);

  // Handle query errors
  if (results.error) {
    // Log the error with full details
    queryLogger.error('Query execution failed', formatErrorForLogging(results.error));

    // Convert error to protocol format
    const errorDetails = results.error.toProtocolFormat
      ? results.error.toProtocolFormat()
      : results.error;

    sendErrorResponse(
      socket,
      errorDetails.code,
      errorDetails.message,
      errorDetails.additionalFields || {},
      {
        severity: errorDetails.severity,
        detail: errorDetails.detail,
        hint: errorDetails.hint,
        position: errorDetails.position,
        internalPosition: errorDetails.internalPosition,
        internalQuery: errorDetails.internalQuery,
        context: errorDetails.context,
        schema: errorDetails.schema,
        table: errorDetails.table,
        column: errorDetails.column,
        dataType: errorDetails.dataType,
        constraint: errorDetails.constraint,
        file: errorDetails.file,
        line: errorDetails.line,
        routine: errorDetails.routine,
      }
    );
    connState.transactionStatus = TRANSACTION_STATUS.IN_FAILED_TRANSACTION;
    return;
  }

  // Handle COPY operations
  if (results.needsCopyInResponse) {
    const { sendCopyInResponse } = require('../protocol/messageBuilders');
    const format = results.copyInfo.binary ? 1 : 0;
    const columnFormats = []; // Default to text format for all columns
    sendCopyInResponse(socket, format, columnFormats);
    return; // Don't send command complete yet - wait for COPY data
  }

  if (results.needsCopyOutResponse) {
    const { sendCopyOutResponse } = require('../protocol/messageBuilders');
    const format = results.copyInfo.binary ? 1 : 0;
    const columnFormats = []; // Default to text format for all columns
    sendCopyOutResponse(socket, format, columnFormats);
    
    // Generate and send mock data
    handleCopyOut(socket, results.copyInfo, connState);
    return; // Command complete will be sent after all data
  }

  // Send result data if query returns rows
  if (results.columns && results.columns.length > 0) {
    sendRowDescription(socket, results.columns);

    // Send each data row
    for (const row of results.rows || []) {
      sendDataRow(socket, row);
    }
  }

  // Send command completion
  const commandTag = formatCommandTag(results.command, results.rowCount);
  sendCommandComplete(socket, commandTag);

  // Update transaction status based on command
  updateTransactionStatus(connState, results.command);
}

/**
 * Processes multiple SQL statements from a query string
 * @param {string} queryString - Raw query string potentially containing multiple statements
 * @param {Socket} socket - Client socket for sending responses
 * @param {ConnectionState} connState - Connection state object
 */
function executeQueryString(queryString, socket, connState) {
  const { parseQueryStatements } = require('../protocol/utils');

  // Parse multiple statements
  const statements = parseQueryStatements(queryString);

  if (statements.length === 0) {
    sendEmptyQueryResponse(socket);
    return;
  }

  // Execute each statement
  for (const statement of statements) {
    if (statement.trim() === '') {
      sendEmptyQueryResponse(socket);
    } else {
      executeQuery(statement, socket, connState);

      // Stop execution if we're in a failed transaction state
      if (connState.transactionStatus === TRANSACTION_STATUS.IN_FAILED_TRANSACTION) {
        break;
      }
    }
  }
}

/**
 * Processes a single SQL query and returns result structure
 * @param {string} query - The SQL query to process
 * @param {ConnectionState} connState - Connection state object
 * @returns {QueryResult} Query execution result
 */
function processQuery(query, connState) {
  const normalizedQuery = query.trim().toUpperCase();

  console.log(`Processing query: ${normalizedQuery}`);

  try {
    // Route to appropriate handler based on query type

    // Check for EXPLAIN queries first (before other routing)
    if (normalizedQuery.startsWith('EXPLAIN')) {
      return handleExplainQuery(normalizedQuery, connState);
    }

    // Check for database introspection queries first (before general SELECT)
    if (
      normalizedQuery.includes('INFORMATION_SCHEMA.') ||
      normalizedQuery.includes('PG_CATALOG.')
    ) {
      return handleIntrospectionQuery(normalizedQuery, connState);
    } else if (normalizedQuery.startsWith('SELECT')) {
      return handleSelectQuery(normalizedQuery, connState);
    } else if (normalizedQuery.startsWith('SHOW')) {
      return handleShowQuery(normalizedQuery, connState);
    } else if (normalizedQuery.startsWith('BEGIN')) {
      return handleTransactionQuery('BEGIN', connState);
    } else if (normalizedQuery.startsWith('COMMIT')) {
      return handleTransactionQuery('COMMIT', connState);
    } else if (normalizedQuery.startsWith('ROLLBACK')) {
      return handleTransactionQuery('ROLLBACK', connState);
    } else if (normalizedQuery.startsWith('SET')) {
      return handleSetQuery(normalizedQuery, connState);
    } else if (normalizedQuery.startsWith('INSERT')) {
      return handleInsertQuery(normalizedQuery, connState);
    } else if (normalizedQuery.startsWith('UPDATE')) {
      return handleUpdateQuery(normalizedQuery, connState);
    } else if (normalizedQuery.startsWith('DELETE')) {
      return handleDeleteQuery(normalizedQuery, connState);
    } else if (normalizedQuery.startsWith('CREATE')) {
      return handleCreateQuery(normalizedQuery, connState);
    } else if (normalizedQuery.startsWith('DROP')) {
      return handleDropQuery(normalizedQuery, connState);
    } else if (normalizedQuery.startsWith('COPY')) {
      return handleCopyQuery(normalizedQuery, connState);
    } else {
      return handleUnknownQuery(normalizedQuery, connState);
    }
  } catch (error) {
    console.error('Error processing query:', error);

    // Wrap the error with enhanced details
    const wrappedError = wrapError(
      error,
      'An unexpected error occurred while processing the query'
    );

    return {
      error: wrappedError,
    };
  }
}

/**
 * Handles SELECT queries
 * @param {string} query - The SELECT query
 * @param {ConnectionState} connState - Connection state object
 * @returns {QueryResult} Query result
 */
function handleSelectQuery(query, connState) {
  // Handle array-specific queries first
  if (query.includes('ARRAY') || query.includes('::')) {
    return handleArrayQuery(query, connState);
  }

  // Handle specific SELECT queries
  switch (query) {
    case 'SELECT 1':
    case 'SELECT 1;':
      return {
        columns: [
          {
            name: '?column?',
            dataTypeOID: DATA_TYPES.INT4,
            dataTypeSize: 4,
          },
        ],
        rows: [['1']],
        command: 'SELECT',
        rowCount: 1,
      };

    case 'SELECT VERSION()':
    case 'SELECT VERSION();':
      return {
        columns: [
          {
            name: 'version',
            dataTypeOID: DATA_TYPES.TEXT,
            dataTypeSize: -1,
          },
        ],
        rows: [['PostgreSQL Wire Protocol Mock Server 1.0']],
        command: 'SELECT',
        rowCount: 1,
      };

    case 'SELECT CURRENT_USER':
    case 'SELECT CURRENT_USER;': {
      const currentUser = connState.parameters.get('user') || 'postgres';
      return {
        columns: [
          {
            name: 'current_user',
            dataTypeOID: DATA_TYPES.NAME,
            dataTypeSize: 64,
          },
        ],
        rows: [[currentUser]],
        command: 'SELECT',
        rowCount: 1,
      };
    }

    case 'SELECT CURRENT_DATABASE()':
    case 'SELECT CURRENT_DATABASE();': {
      const currentDb = connState.parameters.get('database') || 'postgres';
      return {
        columns: [
          {
            name: 'current_database',
            dataTypeOID: DATA_TYPES.NAME,
            dataTypeSize: 64,
          },
        ],
        rows: [[currentDb]],
        command: 'SELECT',
        rowCount: 1,
      };
    }

    case 'SELECT NOW()':
    case 'SELECT NOW();':
      return {
        columns: [
          {
            name: 'now',
            dataTypeOID: DATA_TYPES.TIMESTAMPTZ,
            dataTypeSize: 8,
          },
        ],
        rows: [[new Date().toISOString()]],
        command: 'SELECT',
        rowCount: 1,
      };

    default:
      // Generic SELECT response for unknown queries
      return {
        columns: [
          {
            name: 'result',
            dataTypeOID: DATA_TYPES.TEXT,
            dataTypeSize: -1,
          },
        ],
        rows: [['Mock response for: ' + query.substring(0, 50)]],
        command: 'SELECT',
        rowCount: 1,
      };
  }
}

/**
 * Handles array-specific SELECT queries
 * @param {string} query - The array query
 * @param {ConnectionState} _connState - Connection state object
 * @returns {QueryResult} Query result
 */
function handleArrayQuery(query, _connState) {
  const { parseArrayFromText, getArrayTypeOID } = require('../protocol/utils');

  // Handle ARRAY constructor syntax (including multidimensional)
  const arrayConstructorMatch = query.match(/SELECT\s+ARRAY\s*\[(.*?)\]/i);
  if (arrayConstructorMatch) {
    const elements = arrayConstructorMatch[1].split(',').map(el => el.trim().replace(/^'|'$/g, ''));

    // Check if it's a multidimensional array constructor
    if (query.includes('ARRAY[ARRAY[')) {
      return {
        columns: [
          {
            name: 'multidimensional_array',
            dataTypeOID: DATA_TYPES.TEXT_ARRAY,
            dataTypeSize: -1,
          },
        ],
        rows: [
          [
            [
              ['a', 'b', 'c'],
              ['d', 'e', 'f'],
            ],
          ],
        ],
        command: 'SELECT',
        rowCount: 1,
      };
    }

    return {
      columns: [
        {
          name: 'array',
          dataTypeOID: DATA_TYPES.TEXT_ARRAY,
          dataTypeSize: -1,
        },
      ],
      rows: [[elements]],
      command: 'SELECT',
      rowCount: 1,
    };
  }

  // Handle typed array casting
  const typedArrayMatch = query.match(/SELECT\s+'({.*?})'::(.*?)\[\]/i);
  if (typedArrayMatch) {
    const arrayText = typedArrayMatch[1];
    const typeName = typedArrayMatch[2].trim().toLowerCase();

    try {
      const parsedArray = parseArrayFromText(arrayText, typeName);
      const baseTypeOID = getTypeOIDFromName(typeName);
      const arrayTypeOID = getArrayTypeOID(baseTypeOID) || DATA_TYPES.TEXT_ARRAY;

      return {
        columns: [
          {
            name: 'array',
            dataTypeOID: arrayTypeOID,
            dataTypeSize: -1,
          },
        ],
        rows: [[parsedArray]],
        command: 'SELECT',
        rowCount: 1,
      };
    } catch (error) {
      return {
        error: ErrorFactory.invalidArrayFormat(`Invalid array syntax: ${error.message}`, {
          detail: `Failed to parse array literal: ${arrayText}`,
          context: `While parsing typed array cast to ${typeName}[]`,
        }),
      };
    }
  }

  // Handle array literal syntax (including multidimensional)
  const arrayLiteralMatch = query.match(/SELECT\s+'({.*?})'/i);
  if (arrayLiteralMatch) {
    const arrayText = arrayLiteralMatch[1];

    // Check if it's a multidimensional array literal
    if (arrayText.includes('{{')) {
      return {
        columns: [
          {
            name: 'multidimensional_array',
            dataTypeOID: DATA_TYPES.TEXT_ARRAY,
            dataTypeSize: -1,
          },
        ],
        rows: [
          [
            [
              ['a', 'b', 'c'],
              ['d', 'e', 'f'],
            ],
          ],
        ],
        command: 'SELECT',
        rowCount: 1,
      };
    }

    try {
      const parsedArray = parseArrayFromText(arrayText);
      return {
        columns: [
          {
            name: 'array',
            dataTypeOID: DATA_TYPES.TEXT_ARRAY,
            dataTypeSize: -1,
          },
        ],
        rows: [[parsedArray]],
        command: 'SELECT',
        rowCount: 1,
      };
    } catch (error) {
      return {
        error: ErrorFactory.invalidArrayFormat(`Invalid array syntax: ${error.message}`, {
          detail: `Failed to parse array literal: ${arrayText}`,
          context: 'While parsing array literal syntax',
        }),
      };
    }
  }

  // Handle multidimensional array examples
  if (query.includes('SELECT ARRAY[ARRAY[') || query.includes("SELECT '{{")) {
    return {
      columns: [
        {
          name: 'multidimensional_array',
          dataTypeOID: DATA_TYPES.TEXT_ARRAY,
          dataTypeSize: -1,
        },
      ],
      rows: [
        [
          [
            ['a', 'b', 'c'],
            ['d', 'e', 'f'],
          ],
        ],
      ],
      command: 'SELECT',
      rowCount: 1,
    };
  }

  // Fallback for other array queries
  return {
    columns: [
      {
        name: 'array_result',
        dataTypeOID: DATA_TYPES.TEXT_ARRAY,
        dataTypeSize: -1,
      },
    ],
    rows: [[[1, 2, 3, 4, 5]]],
    command: 'SELECT',
    rowCount: 1,
  };
}

/**
 * Gets the type OID from a PostgreSQL type name
 * @param {string} typeName - PostgreSQL type name
 * @param {Object} config - Server configuration for custom types (optional)
 * @returns {number} Type OID
 */
function getTypeOIDFromName(typeName, config = null) {
  if (!typeName || typeof typeName !== 'string') {
    return DATA_TYPES.TEXT;
  }

  // Check custom types first if config is provided
  if (config) {
    const { getCustomTypeByName } = require('../config/serverConfig');
    const customType = getCustomTypeByName(typeName, config);
    if (customType) {
      return customType.oid;
    }
  }

  // Standard PostgreSQL types
  const typeMapping = {
    bool: DATA_TYPES.BOOL,
    boolean: DATA_TYPES.BOOL,
    int2: DATA_TYPES.INT2,
    smallint: DATA_TYPES.INT2,
    int4: DATA_TYPES.INT4,
    int: DATA_TYPES.INT4,
    integer: DATA_TYPES.INT4,
    int8: DATA_TYPES.INT8,
    bigint: DATA_TYPES.INT8,
    float4: DATA_TYPES.FLOAT4,
    real: DATA_TYPES.FLOAT4,
    float8: DATA_TYPES.FLOAT8,
    'double precision': DATA_TYPES.FLOAT8,
    numeric: DATA_TYPES.NUMERIC,
    text: DATA_TYPES.TEXT,
    varchar: DATA_TYPES.VARCHAR,
    char: DATA_TYPES.CHAR,
    bpchar: DATA_TYPES.BPCHAR,
    date: DATA_TYPES.DATE,
    time: DATA_TYPES.TIME,
    timestamp: DATA_TYPES.TIMESTAMP,
    timestamptz: DATA_TYPES.TIMESTAMPTZ,
    interval: DATA_TYPES.INTERVAL,
    uuid: DATA_TYPES.UUID,
    json: DATA_TYPES.JSON,
    jsonb: DATA_TYPES.JSONB,
  };

  return typeMapping[typeName.toLowerCase()] || DATA_TYPES.TEXT;
}

/**
 * Handles SHOW queries
 * @param {string} query - The SHOW query
 * @param {ConnectionState} _connState - Connection state object
 * @returns {QueryResult} Query result
 */
function handleShowQuery(query, _connState) {
  switch (query) {
    case 'SHOW DOCS':
    case 'SHOW DOCS;':
      return {
        columns: [
          {
            name: 'docs',
            dataTypeOID: DATA_TYPES.TEXT,
            dataTypeSize: -1,
          },
        ],
        rows: [['https://www.postgresql.org/docs/']],
        command: 'SHOW',
        rowCount: 1,
      };

    case 'SHOW SERVER_VERSION':
    case 'SHOW SERVER_VERSION;':
      return {
        columns: [
          {
            name: 'server_version',
            dataTypeOID: DATA_TYPES.TEXT,
            dataTypeSize: -1,
          },
        ],
        rows: [['13.0 (Mock)']],
        command: 'SHOW',
        rowCount: 1,
      };

    case 'SHOW TIMEZONE':
    case 'SHOW TIMEZONE;':
    case 'SHOW TIME ZONE':
    case 'SHOW TIME ZONE;':
      return {
        columns: [
          {
            name: 'TimeZone',
            dataTypeOID: DATA_TYPES.TEXT,
            dataTypeSize: -1,
          },
        ],
        rows: [['UTC']],
        command: 'SHOW',
        rowCount: 1,
      };

    default:
      // Generic SHOW response
      return {
        columns: [
          {
            name: 'setting',
            dataTypeOID: DATA_TYPES.TEXT,
            dataTypeSize: -1,
          },
        ],
        rows: [['Mock setting value']],
        command: 'SHOW',
        rowCount: 1,
      };
  }
}

/**
 * Handles transaction control queries (BEGIN, COMMIT, ROLLBACK)
 * @param {string} command - The transaction command
 * @param {ConnectionState} connState - Connection state object
 * @returns {QueryResult} Query result
 */
function handleTransactionQuery(command, connState) {
  switch (command) {
    case 'BEGIN':
      connState.transactionStatus = TRANSACTION_STATUS.IN_TRANSACTION;
      return { command: 'BEGIN', rowCount: 0 };

    case 'COMMIT':
      connState.transactionStatus = TRANSACTION_STATUS.IDLE;
      return { command: 'COMMIT', rowCount: 0 };

    case 'ROLLBACK':
      connState.transactionStatus = TRANSACTION_STATUS.IDLE;
      return { command: 'ROLLBACK', rowCount: 0 };

    default:
      return {
        error: {
          code: ERROR_CODES.SYNTAX_ERROR,
          message: `${ERROR_MESSAGES.UNKNOWN_TRANSACTION_COMMAND}: ${command}`,
        },
      };
  }
}

/**
 * Handles SET queries
 * @param {string} query - The SET query
 * @param {ConnectionState} _connState - Connection state object
 * @returns {QueryResult} Query result
 */
function handleSetQuery(query, _connState) {
  // Simple SET command parsing
  const setMatch = query.match(/SET\s+(\w+)\s+(?:=\s*|\s+TO\s+)(.+)/i);

  if (setMatch) {
    const [, parameter, value] = setMatch;
    console.log(`Setting parameter ${parameter} = ${value}`);

    // In a real implementation, we'd update server state
    return { command: 'SET', rowCount: 0 };
  }

  return {
    error: {
      code: ERROR_CODES.SYNTAX_ERROR,
      message: ERROR_MESSAGES.INVALID_SET_SYNTAX,
    },
  };
}

/**
 * Handles INSERT queries (mock implementation)
 * @param {string} _query - The INSERT query
 * @param {ConnectionState} _connState - Connection state object
 * @returns {QueryResult} Query result
 */
function handleInsertQuery(_query, _connState) {
  // Mock INSERT - always reports 1 row inserted
  return {
    command: 'INSERT',
    rowCount: 1,
  };
}

/**
 * Handles UPDATE queries (mock implementation)
 * @param {string} _query - The UPDATE query
 * @param {ConnectionState} _connState - Connection state object
 * @returns {QueryResult} Query result
 */
function handleUpdateQuery(_query, _connState) {
  // Mock UPDATE - reports random number of rows updated
  const mockRowCount = Math.floor(Math.random() * 5) + 1;
  return {
    command: 'UPDATE',
    rowCount: mockRowCount,
  };
}

/**
 * Handles DELETE queries (mock implementation)
 * @param {string} _query - The DELETE query
 * @param {ConnectionState} _connState - Connection state object
 * @returns {QueryResult} Query result
 */
function handleDeleteQuery(_query, _connState) {
  // Mock DELETE - reports random number of rows deleted
  const mockRowCount = Math.floor(Math.random() * 3);
  return {
    command: 'DELETE',
    rowCount: mockRowCount,
  };
}

/**
 * Handles CREATE queries (mock implementation)
 * @param {string} query - The CREATE query
 * @param {ConnectionState} _connState - Connection state object
 * @param {Object} config - Server configuration for custom types (optional)
 * @returns {QueryResult} Query result
 */
function handleCreateQuery(query, _connState, config = null) {
  const upperQuery = query.toUpperCase();

  if (upperQuery.includes('CREATE TYPE')) {
    return handleCreateTypeQuery(query, _connState, config);
  } else if (upperQuery.includes('TABLE')) {
    return { command: 'CREATE TABLE', rowCount: 0 };
  } else if (upperQuery.includes('INDEX')) {
    return { command: 'CREATE INDEX', rowCount: 0 };
  } else {
    return { command: 'CREATE', rowCount: 0 };
  }
}

/**
 * Handles DROP queries (mock implementation)
 * @param {string} query - The DROP query
 * @param {ConnectionState} _connState - Connection state object
 * @returns {QueryResult} Query result
 */
function handleDropQuery(query, _connState) {
  if (query.includes('TABLE')) {
    return { command: 'DROP TABLE', rowCount: 0 };
  } else if (query.includes('INDEX')) {
    return { command: 'DROP INDEX', rowCount: 0 };
  } else {
    return { command: 'DROP', rowCount: 0 };
  }
}

/**
 * Handles unknown/unsupported queries
 * @param {string} _query - The unknown query
 * @param {ConnectionState} _connState - Connection state object
 * @returns {QueryResult} Query result
 */
function handleUnknownQuery(_query, _connState) {
  // Return a generic successful response for unknown queries
  return {
    columns: [
      {
        name: 'message',
        dataTypeOID: DATA_TYPES.TEXT,
        dataTypeSize: -1,
      },
    ],
    rows: [['Hello from PostgreSQL Wire Protocol Mock Server!']],
    command: 'SELECT',
    rowCount: 1,
  };
}

/**
 * Updates connection transaction status based on executed command
 * @param {ConnectionState} connState - Connection state object
 * @param {string} command - The executed command
 */
function updateTransactionStatus(connState, command) {
  if (!command) return;

  const upperCommand = command.toUpperCase();

  switch (upperCommand) {
    case 'BEGIN':
      connState.transactionStatus = TRANSACTION_STATUS.IN_TRANSACTION;
      break;
    case 'COMMIT':
    case 'ROLLBACK':
      connState.transactionStatus = TRANSACTION_STATUS.IDLE;
      break;
    // Other commands don't change transaction status
  }
}

/**
 * Validates SQL query syntax (basic implementation)
 * @param {string} query - Query to validate
 * @returns {Object} Validation result with isValid and error
 */
function validateQuery(query) {
  if (!query || query.trim().length === 0) {
    return {
      isValid: false,
      error: ErrorFactory.emptyQuery(),
    };
  }

  // Basic syntax validation - check for unmatched quotes
  const singleQuotes = (query.match(/'/g) || []).length;
  const doubleQuotes = (query.match(/"/g) || []).length;

  if (singleQuotes % 2 !== 0) {
    // Find position of unterminated string
    const lastQuotePos = query.lastIndexOf("'");
    return {
      isValid: false,
      error: ErrorFactory.unterminatedString(lastQuotePos + 1),
    };
  }

  if (doubleQuotes % 2 !== 0) {
    // Find position of unterminated identifier
    const lastQuotePos = query.lastIndexOf('"');
    return {
      isValid: false,
      error: ErrorFactory.unterminatedIdentifier(lastQuotePos + 1),
    };
  }

  return { isValid: true };
}

/**
 * Gets query type from SQL command
 * @param {string} query - The SQL query
 * @returns {string} Query type (SELECT, INSERT, etc.)
 */
function getQueryType(query) {
  const trimmed = query.trim().toUpperCase();
  const firstWord = trimmed.split(/\s+/)[0];
  return firstWord || 'UNKNOWN';
}

/**
 * Handles database introspection queries (information_schema and pg_catalog)
 * @param {string} query - The introspection query
 * @param {ConnectionState} connState - Connection state object
 * @returns {QueryResult} Query result
 */
function handleIntrospectionQuery(query, connState) {
  const upperQuery = query.toUpperCase();

  // Handle information_schema queries
  if (upperQuery.includes('INFORMATION_SCHEMA.TABLES')) {
    return handleInformationSchemaTables(query, connState);
  } else if (upperQuery.includes('INFORMATION_SCHEMA.COLUMNS')) {
    return handleInformationSchemaColumns(query, connState);
  } else if (upperQuery.includes('INFORMATION_SCHEMA.SCHEMATA')) {
    return handleInformationSchemaSchemata(query, connState);
  }

  // Handle pg_catalog queries (we'll implement these in step 4)
  else if (upperQuery.includes('PG_CATALOG.')) {
    return handlePgCatalogQuery(query, connState);
  }

  // Fallback for unknown introspection queries
  return {
    columns: [
      {
        name: 'note',
        dataTypeOID: DATA_TYPES.TEXT,
        dataTypeSize: -1,
      },
    ],
    rows: [['Introspection query not yet implemented: ' + query.substring(0, 100)]],
    command: 'SELECT',
    rowCount: 1,
  };
}

/**
 * Handles information_schema.tables queries
 * Returns list of tables in the database
 */
function handleInformationSchemaTables(_query, _connState) {
  // Build the standard information_schema.tables columns
  const columns = [
    { name: 'table_catalog', dataTypeOID: DATA_TYPES.NAME, dataTypeSize: 64 },
    { name: 'table_schema', dataTypeOID: DATA_TYPES.NAME, dataTypeSize: 64 },
    { name: 'table_name', dataTypeOID: DATA_TYPES.NAME, dataTypeSize: 64 },
    { name: 'table_type', dataTypeOID: DATA_TYPES.TEXT, dataTypeSize: -1 },
  ];

  // Convert our mock schema tables to information_schema format
  const rows = MOCK_SCHEMA.tables.map(table => [
    table.table_catalog,
    table.table_schema,
    table.table_name,
    table.table_type,
  ]);

  return {
    columns,
    rows,
    command: 'SELECT',
    rowCount: rows.length,
  };
}

/**
 * Handles information_schema.columns queries
 * Returns list of columns for tables
 */
function handleInformationSchemaColumns(_query, _connState) {
  const columns = [
    { name: 'table_catalog', dataTypeOID: DATA_TYPES.NAME, dataTypeSize: 64 },
    { name: 'table_schema', dataTypeOID: DATA_TYPES.NAME, dataTypeSize: 64 },
    { name: 'table_name', dataTypeOID: DATA_TYPES.NAME, dataTypeSize: 64 },
    { name: 'column_name', dataTypeOID: DATA_TYPES.NAME, dataTypeSize: 64 },
    { name: 'ordinal_position', dataTypeOID: DATA_TYPES.INT4, dataTypeSize: 4 },
    { name: 'column_default', dataTypeOID: DATA_TYPES.TEXT, dataTypeSize: -1 },
    { name: 'is_nullable', dataTypeOID: DATA_TYPES.TEXT, dataTypeSize: -1 },
    { name: 'data_type', dataTypeOID: DATA_TYPES.TEXT, dataTypeSize: -1 },
    { name: 'character_maximum_length', dataTypeOID: DATA_TYPES.INT4, dataTypeSize: 4 },
  ];

  // Build rows from all columns in all tables
  const rows = [];
  MOCK_SCHEMA.tables.forEach(table => {
    table.columns.forEach(column => {
      rows.push([
        table.table_catalog,
        table.table_schema,
        table.table_name,
        column.column_name,
        column.ordinal_position.toString(),
        column.column_default,
        column.is_nullable,
        column.data_type,
        column.character_maximum_length ? column.character_maximum_length.toString() : null,
      ]);
    });
  });

  return {
    columns,
    rows,
    command: 'SELECT',
    rowCount: rows.length,
  };
}

/**
 * Handles information_schema.schemata queries
 * Returns list of database schemas (namespaces)
 */
function handleInformationSchemaSchemata(_query, _connState) {
  const columns = [
    { name: 'catalog_name', dataTypeOID: DATA_TYPES.NAME, dataTypeSize: 64 },
    { name: 'schema_name', dataTypeOID: DATA_TYPES.NAME, dataTypeSize: 64 },
    { name: 'schema_owner', dataTypeOID: DATA_TYPES.NAME, dataTypeSize: 64 },
  ];

  const rows = MOCK_SCHEMA.schemas.map(schema => [
    'postgres', // catalog_name
    schema.schema_name,
    'postgres', // schema_owner
  ]);

  return {
    columns,
    rows,
    command: 'SELECT',
    rowCount: rows.length,
  };
}

/**
 * Handles CREATE TYPE queries
 * @param {string} _query - The CREATE TYPE query
 * @param {ConnectionState} _connState - Connection state object
 * @param {Object} _config - Server configuration for custom types
 * @returns {QueryResult} Query result
 */
function handleCreateTypeQuery(_query, _connState, _config) {
  // For now, return a success message for CREATE TYPE statements
  // In a real implementation, you would parse the CREATE TYPE syntax
  // and register the type using registerCustomType

  return {
    columns: [],
    rows: [],
    command: 'CREATE TYPE',
    rowCount: 0,
  };
}

/**
 * Handles pg_catalog queries (PostgreSQL system catalogs)
 * @param {string} query - The pg_catalog query
 * @param {ConnectionState} connState - Connection state object
 * @param {Object} config - Server configuration for custom types (optional)
 * @returns {QueryResult} Query result
 */
function handlePgCatalogQuery(query, connState, config = null) {
  const upperQuery = query.toUpperCase();

  if (upperQuery.includes('PG_CATALOG.PG_TABLES')) {
    return handlePgTables(query, connState, config);
  } else if (upperQuery.includes('PG_CATALOG.PG_TYPE')) {
    return handlePgType(query, connState, config);
  } else if (upperQuery.includes('PG_CATALOG.PG_CLASS')) {
    return handlePgClass(query, connState, config);
  }

  // Fallback for unknown pg_catalog queries
  return {
    columns: [
      {
        name: 'note',
        dataTypeOID: DATA_TYPES.TEXT,
        dataTypeSize: -1,
      },
    ],
    rows: [['pg_catalog query not yet implemented: ' + query.substring(0, 100)]],
    command: 'SELECT',
    rowCount: 1,
  };
}

/**
 * Handles pg_catalog.pg_tables queries
 * PostgreSQL-specific table information
 */
function handlePgTables(_query, _connState) {
  const columns = [
    { name: 'schemaname', dataTypeOID: DATA_TYPES.NAME, dataTypeSize: 64 },
    { name: 'tablename', dataTypeOID: DATA_TYPES.NAME, dataTypeSize: 64 },
    { name: 'tableowner', dataTypeOID: DATA_TYPES.NAME, dataTypeSize: 64 },
    { name: 'tablespace', dataTypeOID: DATA_TYPES.NAME, dataTypeSize: 64 },
    { name: 'hasindexes', dataTypeOID: DATA_TYPES.BOOL, dataTypeSize: 1 },
    { name: 'hasrules', dataTypeOID: DATA_TYPES.BOOL, dataTypeSize: 1 },
    { name: 'hastriggers', dataTypeOID: DATA_TYPES.BOOL, dataTypeSize: 1 },
    { name: 'rowsecurity', dataTypeOID: DATA_TYPES.BOOL, dataTypeSize: 1 },
  ];

  const rows = MOCK_SCHEMA.tables
    .filter(table => table.table_type === 'BASE TABLE')
    .map(table => [
      table.table_schema, // schemaname
      table.table_name, // tablename
      'postgres', // tableowner
      null, // tablespace
      'true', // hasindexes
      'false', // hasrules
      'false', // hastriggers
      'false', // rowsecurity
    ]);

  return {
    columns,
    rows,
    command: 'SELECT',
    rowCount: rows.length,
  };
}

/**
 * Handles pg_catalog.pg_type queries
 * PostgreSQL data type information
 * @param {string} _query - The query (unused)
 * @param {ConnectionState} _connState - Connection state (unused)
 * @param {Object} config - Server configuration for custom types (optional)
 */
function handlePgType(_query, _connState, config = null) {
  const columns = [
    { name: 'oid', dataTypeOID: DATA_TYPES.OID, dataTypeSize: 4 },
    { name: 'typname', dataTypeOID: DATA_TYPES.NAME, dataTypeSize: 64 },
    { name: 'typnamespace', dataTypeOID: DATA_TYPES.OID, dataTypeSize: 4 },
    { name: 'typlen', dataTypeOID: DATA_TYPES.INT2, dataTypeSize: 2 },
    { name: 'typtype', dataTypeOID: DATA_TYPES.CHAR, dataTypeSize: 1 },
  ];

  // Common PostgreSQL data types
  const rows = [
    [DATA_TYPES.BOOL.toString(), 'bool', '11', '1', 'b'],
    [DATA_TYPES.INT2.toString(), 'int2', '11', '2', 'b'],
    [DATA_TYPES.INT4.toString(), 'int4', '11', '4', 'b'],
    [DATA_TYPES.INT8.toString(), 'int8', '11', '8', 'b'],
    [DATA_TYPES.TEXT.toString(), 'text', '11', '-1', 'b'],
    [DATA_TYPES.VARCHAR.toString(), 'varchar', '11', '-1', 'b'],
    [DATA_TYPES.TIMESTAMP.toString(), 'timestamp', '11', '8', 'b'],
    [DATA_TYPES.TIMESTAMPTZ.toString(), 'timestamptz', '11', '8', 'b'],
  ];

  // Add custom types if config is provided
  if (config) {
    const { getAllCustomTypes } = require('../config/serverConfig');
    const customTypes = getAllCustomTypes(config);

    for (const customType of customTypes) {
      rows.push([
        customType.oid.toString(),
        customType.name,
        '2200', // pg_catalog namespace OID
        customType.typlen.toString(),
        customType.typtype,
      ]);
    }
  }

  return {
    columns,
    rows,
    command: 'SELECT',
    rowCount: rows.length,
  };
}

/**
 * Handles pg_catalog.pg_class queries
 * PostgreSQL relation (table/index/sequence) information
 */
function handlePgClass(_query, _connState) {
  const columns = [
    { name: 'oid', dataTypeOID: DATA_TYPES.OID, dataTypeSize: 4 },
    { name: 'relname', dataTypeOID: DATA_TYPES.NAME, dataTypeSize: 64 },
    { name: 'relnamespace', dataTypeOID: DATA_TYPES.OID, dataTypeSize: 4 },
    { name: 'relkind', dataTypeOID: DATA_TYPES.CHAR, dataTypeSize: 1 },
    { name: 'relowner', dataTypeOID: DATA_TYPES.OID, dataTypeSize: 4 },
    { name: 'reltablespace', dataTypeOID: DATA_TYPES.OID, dataTypeSize: 4 },
    { name: 'reltuples', dataTypeOID: DATA_TYPES.FLOAT4, dataTypeSize: 4 },
    { name: 'relpages', dataTypeOID: DATA_TYPES.INT4, dataTypeSize: 4 },
  ];

  // Mock relations (tables) from our schema
  const rows = MOCK_SCHEMA.tables.map((table, index) => [
    (16384 + index).toString(), // oid (fake but realistic)
    table.table_name, // relname
    '2200', // relnamespace (public schema)
    'r', // relkind ('r' = ordinary table)
    '10', // relowner (postgres user)
    '0', // reltablespace (default)
    '100.0', // reltuples (estimated row count)
    '10', // relpages (estimated page count)
  ]);

  return {
    columns,
    rows,
    command: 'SELECT',
    rowCount: rows.length,
  };
}

/**
 * Handles COPY queries for bulk data transfer
 * @param {string} query - The COPY query
 * @param {ConnectionState} connState - Connection state object
 * @returns {QueryResult} Query result with COPY setup
 */
function handleCopyQuery(query, connState) {
  const copyInfo = parseCopyQuery(query);
  
  if (copyInfo.error) {
    return {
      error: {
        code: '42601', // Syntax error
        message: copyInfo.error,
        severity: 'ERROR'
      }
    };
  }

  // Set copy state in connection
  const copyStateInfo = {
    ...copyInfo,
    active: true,
    direction: copyInfo.direction === 'FROM' ? 'in' : 'out',
    format: copyInfo.format || 'text',
    table: copyInfo.tableName,
    columns: copyInfo.columns || null,
    binary: copyInfo.binary || false,
    rowsProcessed: 0
  };
  connState.setCopyState(copyStateInfo);

  // Return appropriate response based on COPY direction
  if (copyInfo.direction === 'FROM') {
    return {
      command: 'COPY_FROM',
      copyInfo: copyInfo,
      needsCopyInResponse: true,
      rowCount: 0,
    };
  } else if (copyInfo.direction === 'TO') {
    return {
      command: 'COPY_TO',
      copyInfo: copyInfo,
      needsCopyOutResponse: true,
      rowCount: 0,
    };
  }

  throw ErrorFactory.createSyntaxError('Invalid COPY command');
}

/**
 * Parses COPY query to extract parameters
 * @param {string} query - The COPY query
 * @returns {Object} Parsed COPY information
 */
function parseCopyQuery(query) {
  // Remove extra whitespace and normalize
  const normalizedQuery = query.trim().replace(/\s+/g, ' ');
  
  // Match COPY FROM STDIN
  let match = normalizedQuery.match(/^COPY\s+([^\s]+)\s+FROM\s+STDIN(?:\s+WITH\s+(.*))?$/i);
  if (match) {
    const tableName = match[1];
    const options = parseCopyOptions(match[2] || '');
    
    return {
      direction: 'FROM',
      tableName: tableName,
      source: 'STDIN',
      format: options.format || 'text',
      delimiter: options.delimiter || '\t',
      nullString: options.null || '\\N',
      header: options.header || false,
      quote: options.quote || '"',
      escape: options.escape || '"',
      binary: options.format === 'binary',
      columns: options.columns || null,
    };
  }
  
  // Match COPY TO STDOUT
  const copyToPattern = /^COPY\s+(?:\(([^)]+)\)\s+FROM\s+)?([^\s]+)\s+TO\s+STDOUT(?:\s+WITH\s+(.*))?$/i;
  match = normalizedQuery.match(copyToPattern);
  if (match) {
    const selectClause = match[1];
    const tableOrQuery = match[2];
    const options = parseCopyOptions(match[3] || '');
    
    return {
      direction: 'TO',
      tableName: tableOrQuery,
      destination: 'STDOUT',
      format: options.format || 'text',
      delimiter: options.delimiter || '\t',
      nullString: options.null || '\\N',
      header: options.header || false,
      quote: options.quote || '"',
      escape: options.escape || '"',
      binary: options.format === 'binary',
      selectClause: selectClause,
    };
  }
  
  // Match COPY (SELECT ...) TO STDOUT
  match = normalizedQuery.match(/^COPY\s+\(([^)]+)\)\s+TO\s+STDOUT(?:\s+WITH\s+(.*))?$/i);
  if (match) {
    const selectQuery = match[1];
    const options = parseCopyOptions(match[2] || '');
    
    return {
      direction: 'TO',
      query: selectQuery,
      destination: 'STDOUT',
      format: options.format || 'text',
      delimiter: options.delimiter || '\t',
      nullString: options.null || '\\N',
      header: options.header || false,
      quote: options.quote || '"',
      escape: options.escape || '"',
      binary: options.format === 'binary',
    };
  }

  return { error: 'Invalid COPY syntax' };
}

/**
 * Parses COPY WITH options
 * @param {string} optionsStr - The options string
 * @returns {Object} Parsed options
 */
function parseCopyOptions(optionsStr) {
  const options = {};
  
  if (!optionsStr) {
    return options;
  }
  
  // Remove parentheses if present
  let cleanOptionsStr = optionsStr.trim();
  if (cleanOptionsStr.startsWith('(') && cleanOptionsStr.endsWith(')')) {
    cleanOptionsStr = cleanOptionsStr.slice(1, -1).trim();
  }
  
  // Split by comma, but handle quoted values
  const parts = [];
  let current = '';
  let inQuotes = false;
  let quoteChar = null;
  
  for (let i = 0; i < cleanOptionsStr.length; i++) {
    const char = cleanOptionsStr[i];
    
    if (!inQuotes && (char === '"' || char === "'")) {
      inQuotes = true;
      quoteChar = char;
      current += char;
    } else if (inQuotes && char === quoteChar) {
      inQuotes = false;
      quoteChar = null;
      current += char;
    } else if (!inQuotes && char === ',') {
      parts.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  
  if (current.trim()) {
    parts.push(current.trim());
  }
  
  // Parse each option
  for (const part of parts) {
    const optionMatch = part.match(/^\s*([A-Z_]+)(?:\s+(.+))?\s*$/i);
    if (optionMatch) {
      const key = optionMatch[1].toLowerCase();
      let value = optionMatch[2];
      
      if (value) {
        // Remove quotes if present
        value = value.replace(/^['"]|['"]$/g, '');
        
        // Handle specific option types
        switch (key) {
          case 'format':
            options.format = value.toLowerCase();
            break;
          case 'delimiter':
            options.delimiter = value;
            break;
          case 'null':
            options.null = value;
            break;
          case 'header':
            options.header = value.toLowerCase() === 'true' || value === '1';
            break;
          case 'quote':
            options.quote = value;
            break;
          case 'escape':
            options.escape = value;
            break;
          default:
            options[key] = value;
        }
      } else {
        // Boolean options without values
        switch (key) {
          case 'header':
            options.header = true;
            break;
          case 'binary':
            options.format = 'binary';
            break;
          default:
            options[key] = true;
        }
      }
    }
  }
  
  return options;
}

/**
 * Generates mock data for COPY TO operations
 * @param {Object} copyInfo - COPY operation info
 * @param {number} rowCount - Number of rows to generate
 * @returns {Array} Array of data rows
 */
function generateMockCopyData(copyInfo, rowCount = 100) {
  const rows = [];
  
  // Define mock data based on table name
  const mockData = {
    users: [
      { id: 1, name: 'John Doe', email: 'john@example.com', created_at: '2023-01-01 10:00:00' },
      { id: 2, name: 'Jane Smith', email: 'jane@example.com', created_at: '2023-01-02 11:00:00' },
      { id: 3, name: 'Bob Johnson', email: 'bob@example.com', created_at: '2023-01-03 12:00:00' },
    ],
    posts: [
      { id: 1, title: 'First Post', content: 'Hello World', user_id: 1, created_at: '2023-01-01 15:00:00' },
      { id: 2, title: 'Second Post', content: 'More content', user_id: 2, created_at: '2023-01-02 16:00:00' },
    ],
    products: [
      { id: 1, name: 'Widget A', price: 19.99, category: 'widgets' },
      { id: 2, name: 'Gadget B', price: 29.99, category: 'gadgets' },
    ]
  };
  
  const tableName = copyInfo.tableName || 'users';
  const baseData = mockData[tableName.toLowerCase()] || mockData.users;
  
  // Generate requested number of rows
  for (let i = 0; i < rowCount; i++) {
    const baseRow = baseData[i % baseData.length];
    const row = { ...baseRow };
    
    // Modify some fields to create variety
    if (row.id) {
      row.id = i + 1;
    }
    if (row.name) {
      row.name = `${baseRow.name} ${Math.floor(i / baseData.length) + 1}`;
    }
    if (row.email) {
      row.email = `user${i + 1}@example.com`;
    }
    if (row.title) {
      row.title = `${baseRow.title} ${Math.floor(i / baseData.length) + 1}`;
    }
    
    rows.push(row);
  }
  
  return rows;
}

/**
 * Formats data for COPY output
 * @param {Array} rows - Data rows
 * @param {Object} copyInfo - COPY format info
 * @returns {string} Formatted data string
 */
function formatCopyData(rows, copyInfo) {
  if (copyInfo.binary) {
    return formatCopyDataBinary(rows, copyInfo);
  } else {
    return formatCopyDataText(rows, copyInfo);
  }
}

/**
 * Formats data for text COPY output
 * @param {Array} rows - Data rows
 * @param {Object} copyInfo - COPY format info
 * @returns {string} Formatted text data
 */
function formatCopyDataText(rows, copyInfo) {
  const lines = [];
  const delimiter = copyInfo.delimiter;
  const nullString = copyInfo.nullString;
  
  for (const row of rows) {
    const values = Object.values(row).map(value => {
      if (value === null || value === undefined) {
        return nullString;
      }
      
      // Convert to string and escape if needed
      let strValue = String(value);
      
      // Escape special characters
      if (strValue.includes(delimiter) || strValue.includes('\n') || strValue.includes('\r')) {
        strValue = `"${strValue.replace(/"/g, '""')}"`;
      }
      
      return strValue;
    });
    
    lines.push(values.join(delimiter));
  }
  
  return lines.join('\n');
}

/**
 * Formats data for binary COPY output
 * @param {Array} rows - Data rows
 * @param {Object} copyInfo - COPY format info
 * @returns {Buffer} Binary data buffer
 */
function formatCopyDataBinary(rows, copyInfo) {
  // Simplified binary format - in real implementation this would be more complex
  const buffers = [];
  
  // Binary header
  const header = Buffer.alloc(15);
  header.write('PGCOPY\n\xff\r\n\0', 0, 11, 'binary');
  header.writeInt32BE(0, 11); // Flags field
  buffers.push(header);
  
  // Extension area length (0)
  const extensionLength = Buffer.alloc(4);
  extensionLength.writeInt32BE(0, 0);
  buffers.push(extensionLength);
  
  for (const row of rows) {
    const values = Object.values(row);
    
    // Field count
    const fieldCount = Buffer.alloc(2);
    fieldCount.writeInt16BE(values.length, 0);
    buffers.push(fieldCount);
    
    for (const value of values) {
      if (value === null || value === undefined) {
        // NULL value
        const nullLength = Buffer.alloc(4);
        nullLength.writeInt32BE(-1, 0);
        buffers.push(nullLength);
      } else {
        // Convert value to buffer
        const valueStr = String(value);
        const valueBuffer = Buffer.from(valueStr, 'utf8');
        
        const length = Buffer.alloc(4);
        length.writeInt32BE(valueBuffer.length, 0);
        buffers.push(length);
        buffers.push(valueBuffer);
      }
    }
  }
  
  // End marker
  const endMarker = Buffer.alloc(2);
  endMarker.writeInt16BE(-1, 0);
  buffers.push(endMarker);
  
  return Buffer.concat(buffers);
}

/**
 * Handle COPY OUT operations - send mock data to client
 * @param {net.Socket} socket - Client socket
 * @param {Object} copyInfo - COPY operation info
 * @param {ConnectionState} connState - Connection state
 */
function handleCopyOut(socket, copyInfo, connState) {
  try {
    const { sendCopyData, sendCopyDone } = require('../protocol/messageBuilders');
    const { sendCommandComplete } = require('../protocol/messageBuilders');
    
    // Generate mock data based on COPY type
    let mockData = [];
    const rowCount = copyInfo.options.rowCount || 100; // Default 100 rows
    
    if (copyInfo.from === 'table') {
      // Generate mock table data
      mockData = generateMockCopyData(copyInfo.source, rowCount);
    } else if (copyInfo.from === 'query') {
      // Generate mock query result data
      mockData = generateMockQueryCopyData(copyInfo.query, rowCount);
    }
    
    // Format and send data
    for (const row of mockData) {
      const formattedData = formatCopyData(row, copyInfo);
      sendCopyData(socket, formattedData);
    }
    
    // Send COPY completion
    sendCopyDone(socket);
    
    // Send command completion
    const commandTag = formatCommandTag('COPY', rowCount);
    sendCommandComplete(socket, commandTag);
    
    // Update connection state
    connState.clearCopyState();
    
    console.log(`COPY OUT completed: ${rowCount} rows sent`);
  } catch (error) {
    console.error('Error in handleCopyOut:', error);
    const { sendErrorResponse } = require('../protocol/messageBuilders');
    sendErrorResponse(socket, 'ERROR', '08P01', 'COPY OUT failed', error.message);
  }
}

/**
 * Generate mock data for COPY queries (SELECT ... INTO OUTFILE equivalent)
 * @param {string} query - The query to generate data for
 * @param {number} rowCount - Number of rows to generate
 * @returns {Array} Array of row data
 */
function generateMockQueryCopyData(query, rowCount) {
  // Simple mock data generator for COPY queries
  const mockData = [];
  
  for (let i = 1; i <= rowCount; i++) {
    mockData.push([
      i, // id
      `user_${i}`, // name
      `user${i}@example.com`, // email
      new Date().toISOString(), // created_at
    ]);
  }
  
  return mockData;
 * Handles EXPLAIN queries to provide mock query execution plans
 * @param {string} query - The EXPLAIN query
 * @param {ConnectionState} connState - Connection state object
 * @returns {QueryResult} Query result with execution plan
 */
function handleExplainQuery(query, connState) {
  // Parse EXPLAIN options and inner query
  const explainInfo = parseExplainQuery(query);

  if (explainInfo.error) {
    throw ErrorFactory.createSyntaxError(explainInfo.error);
  }

  let innerResult;
  try {
    // Get the inner query result to understand structure
    innerResult = processQuery(explainInfo.innerQuery, connState);

    // If inner query has error, propagate it
    if (innerResult.error) {
      return innerResult;
    }
  } catch (error) {
    // If inner query fails, propagate the error
    return { error };
  }

  // Generate mock execution plan
  const plan = generateMockExecutionPlan(explainInfo, innerResult);

  // Format the plan according to specified format
  const formattedPlan = formatExplainOutput(plan, explainInfo.format, explainInfo.analyze);

  return {
    columns: [
      {
        name: 'QUERY PLAN',
        dataTypeOID: DATA_TYPES.TEXT,
        dataTypeSize: -1,
      },
    ],
    rows: formattedPlan.split('\n').map(line => [line]),
    command: 'EXPLAIN',
    rowCount: formattedPlan.split('\n').length,
  };
}

/**
 * Parses EXPLAIN query to extract options and inner query
 * @param {string} query - The EXPLAIN query
 * @returns {Object} Parsed EXPLAIN information
 */
function parseExplainQuery(query) {
  const normalizedQuery = query.trim();

  // Enhanced EXPLAIN parsing regex to handle ANALYZE keyword
  let explainMatch = normalizedQuery.match(/^EXPLAIN\s+ANALYZE\s+(.*)/i);
  let isAnalyze = false;

  if (explainMatch) {
    isAnalyze = true;
  } else {
    explainMatch = normalizedQuery.match(/^EXPLAIN\s*(?:\((.*?)\))?\s*(.*)/i);
  }

  if (!explainMatch) {
    return { error: 'Invalid EXPLAIN syntax' };
  }

  const optionsStr = isAnalyze ? '' : explainMatch[1] || '';
  const innerQuery = explainMatch[isAnalyze ? 1 : 2];

  if (!innerQuery.trim()) {
    return { error: 'EXPLAIN requires a query to analyze' };
  }

  // Parse options
  const options = {
    analyze: isAnalyze, // Set to true if EXPLAIN ANALYZE was used
    verbose: false,
    costs: true,
    buffers: false,
    timing: true,
    format: 'TEXT',
  };

  if (optionsStr) {
    const optionPairs = optionsStr.split(',').map(opt => opt.trim());

    for (const optionPair of optionPairs) {
      const [key, value] = optionPair.split(/\s+/).map(s => s.trim().toUpperCase());

      switch (key) {
        case 'ANALYZE':
          options.analyze = value !== 'FALSE';
          break;
        case 'VERBOSE':
          options.verbose = value !== 'FALSE';
          break;
        case 'COSTS':
          options.costs = value !== 'FALSE';
          break;
        case 'BUFFERS':
          options.buffers = value !== 'FALSE';
          break;
        case 'TIMING':
          options.timing = value !== 'FALSE';
          break;
        case 'FORMAT':
          if (!['TEXT', 'JSON', 'XML', 'YAML'].includes(value)) {
            return { error: `unrecognized value for EXPLAIN option "format": "${value}"` };
          }
          options.format = value;
          break;
      }
    }
  }

  return {
    innerQuery: innerQuery.trim(),
    analyze: options.analyze,
    verbose: options.verbose,
    costs: options.costs,
    buffers: options.buffers,
    timing: options.timing,
    format: options.format,
  };
}

/**
 * Generates a mock execution plan based on query analysis
 * @param {Object} explainInfo - Parsed EXPLAIN information
 * @param {Object} innerResult - Result from processing inner query
 * @returns {Object} Mock execution plan
 */
function generateMockExecutionPlan(explainInfo, innerResult) {
  const innerQuery = explainInfo.innerQuery.toUpperCase();

  // Generate plan nodes based on query type
  let planNodes = [];

  if (innerQuery.startsWith('SELECT')) {
    planNodes = generateSelectPlan(innerQuery, innerResult, explainInfo);
  } else if (innerQuery.startsWith('INSERT')) {
    planNodes = generateInsertPlan(innerQuery, innerResult, explainInfo);
  } else if (innerQuery.startsWith('UPDATE')) {
    planNodes = generateUpdatePlan(innerQuery, innerResult, explainInfo);
  } else if (innerQuery.startsWith('DELETE')) {
    planNodes = generateDeletePlan(innerQuery, innerResult, explainInfo);
  } else {
    // Generic plan for other queries
    planNodes = [
      {
        nodeType: 'Result',
        startupCost: 0.0,
        totalCost: 0.01,
        planRows: 1,
        planWidth: 0,
        actualStartupTime: explainInfo.analyze ? 0.001 : null,
        actualTotalTime: explainInfo.analyze ? 0.002 : null,
        actualRows: explainInfo.analyze ? 1 : null,
        actualLoops: explainInfo.analyze ? 1 : null,
      },
    ];
  }

  return {
    nodes: planNodes,
    planningTime: explainInfo.analyze ? (Math.random() * 0.5 + 0.1).toFixed(3) : null,
    executionTime: explainInfo.analyze ? (Math.random() * 5 + 1).toFixed(3) : null,
  };
}

/**
 * Generates execution plan for SELECT queries
 */
function generateSelectPlan(query, result, explainInfo) {
  const hasWhere = query.includes('WHERE');
  const hasJoin = query.includes('JOIN');
  const hasOrderBy = query.includes('ORDER BY');

  // Handle simple queries like SELECT 1
  if (query.match(/SELECT\s+\d+/i) || query.match(/SELECT\s+\d+\s*;?\s*$/i)) {
    return [
      {
        nodeType: 'Result',
        startupCost: 0.0,
        totalCost: 0.01,
        planRows: 1,
        planWidth: 4,
        actualStartupTime: explainInfo.analyze ? 0.001 : null,
        actualTotalTime: explainInfo.analyze ? 0.002 : null,
        actualRows: explainInfo.analyze ? 1 : null,
        actualLoops: explainInfo.analyze ? 1 : null,
      },
    ];
  }

  const estimatedRows = result.rowCount || 1000;
  const estimatedWidth = 100; // Average row width estimate

  let nodes = [];

  if (hasJoin) {
    // Hash Join example
    nodes.push({
      nodeType: 'Hash Join',
      joinType: 'Inner',
      startupCost: 15.0,
      totalCost: 45.5,
      planRows: estimatedRows,
      planWidth: estimatedWidth,
      actualStartupTime: explainInfo.analyze ? 0.123 : null,
      actualTotalTime: explainInfo.analyze ? 2.456 : null,
      actualRows: explainInfo.analyze ? estimatedRows : null,
      actualLoops: explainInfo.analyze ? 1 : null,
      hashCondition: 'users.id = posts.user_id',
      children: [
        {
          nodeType: 'Seq Scan',
          relationName: 'users',
          startupCost: 0.0,
          totalCost: 15.0,
          planRows: 100,
          planWidth: 50,
          actualStartupTime: explainInfo.analyze ? 0.012 : null,
          actualTotalTime: explainInfo.analyze ? 0.891 : null,
          actualRows: explainInfo.analyze ? 100 : null,
          actualLoops: explainInfo.analyze ? 1 : null,
        },
        {
          nodeType: 'Hash',
          startupCost: 12.5,
          totalCost: 12.5,
          planRows: 500,
          planWidth: 50,
          actualStartupTime: explainInfo.analyze ? 0.045 : null,
          actualTotalTime: explainInfo.analyze ? 0.045 : null,
          actualRows: explainInfo.analyze ? 500 : null,
          actualLoops: explainInfo.analyze ? 1 : null,
          children: [
            {
              nodeType: 'Seq Scan',
              relationName: 'posts',
              startupCost: 0.0,
              totalCost: 12.5,
              planRows: 500,
              planWidth: 50,
              actualStartupTime: explainInfo.analyze ? 0.001 : null,
              actualTotalTime: explainInfo.analyze ? 0.234 : null,
              actualRows: explainInfo.analyze ? 500 : null,
              actualLoops: explainInfo.analyze ? 1 : null,
            },
          ],
        },
      ],
    });
  } else {
    // Simple sequential scan
    const node = {
      nodeType: 'Seq Scan',
      relationName: extractTableName(query) || 'table',
      startupCost: 0.0,
      totalCost: (estimatedRows * 0.01 + 5).toFixed(2),
      planRows: estimatedRows,
      planWidth: estimatedWidth,
      actualStartupTime: explainInfo.analyze ? 0.012 : null,
      actualTotalTime: explainInfo.analyze ? (estimatedRows * 0.001 + 0.5).toFixed(3) : null,
      actualRows: explainInfo.analyze ? estimatedRows : null,
      actualLoops: explainInfo.analyze ? 1 : null,
    };

    if (hasWhere) {
      node.filter = extractWhereCondition(query) || '(condition)';
      node.rowsRemovedByFilter = explainInfo.analyze ? Math.floor(estimatedRows * 0.1) : null;
    }

    nodes.push(node);
  }

  // Add sort node if ORDER BY
  if (hasOrderBy) {
    const sortNode = {
      nodeType: 'Sort',
      startupCost: nodes[0].totalCost + 5.0,
      totalCost: nodes[0].totalCost + 10.0,
      planRows: estimatedRows,
      planWidth: estimatedWidth,
      actualStartupTime: explainInfo.analyze ? 1.234 : null,
      actualTotalTime: explainInfo.analyze ? 1.456 : null,
      actualRows: explainInfo.analyze ? estimatedRows : null,
      actualLoops: explainInfo.analyze ? 1 : null,
      sortKey: extractOrderByColumns(query) || 'column',
      sortMethod: 'quicksort',
      sortSpaceUsed: explainInfo.analyze ? Math.floor(estimatedRows / 10) : null,
      children: nodes,
    };
    nodes = [sortNode];
  }

  return nodes;
}

/**
 * Generates execution plan for INSERT queries
 */
function generateInsertPlan(query, result, explainInfo) {
  return [
    {
      nodeType: 'Insert',
      relationName: extractTableName(query) || 'table',
      startupCost: 0.0,
      totalCost: 0.01,
      planRows: 0,
      planWidth: 0,
      actualStartupTime: explainInfo.analyze ? 0.001 : null,
      actualTotalTime: explainInfo.analyze ? 0.234 : null,
      actualRows: explainInfo.analyze ? result.rowCount || 1 : null,
      actualLoops: explainInfo.analyze ? 1 : null,
      children: [
        {
          nodeType: 'Result',
          startupCost: 0.0,
          totalCost: 0.01,
          planRows: 1,
          planWidth: 32,
          actualStartupTime: explainInfo.analyze ? 0.001 : null,
          actualTotalTime: explainInfo.analyze ? 0.001 : null,
          actualRows: explainInfo.analyze ? 1 : null,
          actualLoops: explainInfo.analyze ? 1 : null,
        },
      ],
    },
  ];
}

/**
 * Generates execution plan for UPDATE queries
 */
function generateUpdatePlan(query, result, explainInfo) {
  const hasWhere = query.includes('WHERE');
  const estimatedRows = result.rowCount || 100;

  return [
    {
      nodeType: 'Update',
      relationName: extractTableName(query) || 'table',
      startupCost: hasWhere ? 15.0 : 0.0,
      totalCost: hasWhere ? 25.5 : 0.01,
      planRows: 0,
      planWidth: 0,
      actualStartupTime: explainInfo.analyze ? 0.123 : null,
      actualTotalTime: explainInfo.analyze ? 1.234 : null,
      actualRows: explainInfo.analyze ? result.rowCount || 1 : null,
      actualLoops: explainInfo.analyze ? 1 : null,
      children: hasWhere
        ? [
          {
            nodeType: 'Seq Scan',
            relationName: extractTableName(query) || 'table',
            startupCost: 0.0,
            totalCost: 15.0,
            planRows: estimatedRows,
            planWidth: 100,
            filter: extractWhereCondition(query) || '(condition)',
            actualStartupTime: explainInfo.analyze ? 0.012 : null,
            actualTotalTime: explainInfo.analyze ? 0.891 : null,
            actualRows: explainInfo.analyze ? result.rowCount || 1 : null,
            actualLoops: explainInfo.analyze ? 1 : null,
          },
        ]
        : [
          {
            nodeType: 'Result',
            startupCost: 0.0,
            totalCost: 0.01,
            planRows: 1,
            planWidth: 32,
            actualStartupTime: explainInfo.analyze ? 0.001 : null,
            actualTotalTime: explainInfo.analyze ? 0.001 : null,
            actualRows: explainInfo.analyze ? 1 : null,
            actualLoops: explainInfo.analyze ? 1 : null,
          },
        ],
    },
  ];
}

/**
 * Generates execution plan for DELETE queries
 */
function generateDeletePlan(query, result, explainInfo) {
  const hasWhere = query.includes('WHERE');
  const estimatedRows = result.rowCount || 100;

  return [
    {
      nodeType: 'Delete',
      relationName: extractTableName(query) || 'table',
      startupCost: hasWhere ? 15.0 : 0.0,
      totalCost: hasWhere ? 25.5 : 0.01,
      planRows: 0,
      planWidth: 0,
      actualStartupTime: explainInfo.analyze ? 0.123 : null,
      actualTotalTime: explainInfo.analyze ? 1.234 : null,
      actualRows: explainInfo.analyze ? result.rowCount || 1 : null,
      actualLoops: explainInfo.analyze ? 1 : null,
      children: hasWhere
        ? [
          {
            nodeType: 'Seq Scan',
            relationName: extractTableName(query) || 'table',
            startupCost: 0.0,
            totalCost: 15.0,
            planRows: estimatedRows,
            planWidth: 6,
            filter: extractWhereCondition(query) || '(condition)',
            actualStartupTime: explainInfo.analyze ? 0.012 : null,
            actualTotalTime: explainInfo.analyze ? 0.891 : null,
            actualRows: explainInfo.analyze ? result.rowCount || 1 : null,
            actualLoops: explainInfo.analyze ? 1 : null,
          },
        ]
        : null,
    },
  ];
}

/**
 * Formats execution plan according to specified format
 * @param {Object} plan - The execution plan
 * @param {string} format - Output format (TEXT, JSON, XML, YAML)
 * @param {boolean} analyze - Whether this is EXPLAIN ANALYZE
 * @returns {string} Formatted plan output
 */
function formatExplainOutput(plan, format, analyze) {
  switch (format) {
    case 'JSON':
      return formatPlanAsJSON(plan, analyze);
    case 'XML':
      return formatPlanAsXML(plan, analyze);
    case 'YAML':
      return formatPlanAsYAML(plan, analyze);
    default:
      return formatPlanAsText(plan, analyze);
  }
}

/**
 * Formats plan as traditional text output
 */
function formatPlanAsText(plan, analyze) {
  let output = [];

  function formatNode(node, level = 0) {
    const indent = '  '.repeat(level);
    let line = indent;

    if (level > 0) {
      line += '->  ';
    }

    line += node.nodeType;

    if (node.relationName) {
      line += ` on ${node.relationName}`;
    }

    if (node.joinType) {
      line += ` (${node.joinType})`;
    }

    const startupCost =
      typeof node.startupCost === 'number' ? node.startupCost.toFixed(2) : node.startupCost;
    const totalCost =
      typeof node.totalCost === 'number' ? node.totalCost.toFixed(2) : node.totalCost;
    line += `  (cost=${startupCost}..${totalCost} rows=${node.planRows} width=${node.planWidth})`;

    if (analyze && node.actualStartupTime !== null) {
      const actualStartup =
        typeof node.actualStartupTime === 'number'
          ? node.actualStartupTime.toFixed(3)
          : node.actualStartupTime;
      const actualTotal =
        typeof node.actualTotalTime === 'number'
          ? node.actualTotalTime.toFixed(3)
          : node.actualTotalTime;
      line +=
        ` (actual time=${actualStartup}..${actualTotal}` +
        ` rows=${node.actualRows} loops=${node.actualLoops})`;
    }

    output.push(line);

    if (node.filter) {
      output.push(indent + (level > 0 ? '    ' : '') + `Filter: ${node.filter}`);
      if (analyze && node.rowsRemovedByFilter) {
        const filterMsg = `Rows Removed by Filter: ${node.rowsRemovedByFilter}`;
        output.push(indent + (level > 0 ? '    ' : '') + filterMsg);
      }
    }

    if (node.hashCondition) {
      output.push(indent + (level > 0 ? '    ' : '') + `Hash Cond: ${node.hashCondition}`);
    }

    if (node.sortKey) {
      output.push(indent + (level > 0 ? '    ' : '') + `Sort Key: ${node.sortKey}`);
      if (analyze && node.sortMethod) {
        const sortMsg = `Sort Method: ${node.sortMethod}  Memory: ${node.sortSpaceUsed}kB`;
        output.push(indent + (level > 0 ? '    ' : '') + sortMsg);
      }
    }

    if (node.children) {
      for (const child of node.children) {
        formatNode(child, level + 1);
      }
    }
  }

  for (const node of plan.nodes) {
    formatNode(node);
  }

  if (analyze) {
    if (plan.planningTime) {
      output.push(`Planning Time: ${plan.planningTime} ms`);
    }
    if (plan.executionTime) {
      output.push(`Execution Time: ${plan.executionTime} ms`);
    }
  }

  return output.join('\n');
}

/**
 * Formats plan as JSON output
 */
function formatPlanAsJSON(plan, analyze) {
  function convertNode(node) {
    const result = {
      'Node Type': node.nodeType,
      'Startup Cost': parseFloat(node.startupCost),
      'Total Cost': parseFloat(node.totalCost),
      'Plan Rows': node.planRows,
      'Plan Width': node.planWidth,
    };

    if (node.relationName) {
      result['Relation Name'] = node.relationName;
    }

    if (node.joinType) {
      result['Join Type'] = node.joinType;
    }

    if (analyze && node.actualStartupTime !== null) {
      result['Actual Startup Time'] = parseFloat(node.actualStartupTime);
      result['Actual Total Time'] = parseFloat(node.actualTotalTime);
      result['Actual Rows'] = node.actualRows;
      result['Actual Loops'] = node.actualLoops;
    }

    if (node.filter) {
      result['Filter'] = node.filter;
      if (analyze && node.rowsRemovedByFilter) {
        result['Rows Removed by Filter'] = node.rowsRemovedByFilter;
      }
    }

    if (node.hashCondition) {
      result['Hash Cond'] = node.hashCondition;
    }

    if (node.sortKey) {
      result['Sort Key'] = [node.sortKey];
      if (analyze && node.sortMethod) {
        result['Sort Method'] = node.sortMethod;
        result['Sort Space Used'] = node.sortSpaceUsed;
        result['Sort Space Type'] = 'Memory';
      }
    }

    if (node.children && node.children.length > 0) {
      result['Plans'] = node.children.map(convertNode);
    }

    return result;
  }

  const jsonPlan = {
    Plan: convertNode(plan.nodes[0]),
  };

  if (analyze) {
    if (plan.planningTime) {
      jsonPlan['Planning Time'] = parseFloat(plan.planningTime);
    }
    if (plan.executionTime) {
      jsonPlan['Execution Time'] = parseFloat(plan.executionTime);
    }
  }

  return JSON.stringify([jsonPlan], null, 2);
}

/**
 * Formats plan as XML output
 */
function formatPlanAsXML(plan, analyze) {
  function convertNode(node, level = 1) {
    const indent = '  '.repeat(level);
    let xml = `${indent}<Plan>\n`;

    xml += `${indent}  <Node-Type>${node.nodeType}</Node-Type>\n`;
    xml += `${indent}  <Startup-Cost>${node.startupCost}</Startup-Cost>\n`;
    xml += `${indent}  <Total-Cost>${node.totalCost}</Total-Cost>\n`;
    xml += `${indent}  <Plan-Rows>${node.planRows}</Plan-Rows>\n`;
    xml += `${indent}  <Plan-Width>${node.planWidth}</Plan-Width>\n`;

    if (node.relationName) {
      xml += `${indent}  <Relation-Name>${node.relationName}</Relation-Name>\n`;
    }

    if (node.joinType) {
      xml += `${indent}  <Join-Type>${node.joinType}</Join-Type>\n`;
    }

    if (analyze && node.actualStartupTime !== null) {
      xml += `${indent}  <Actual-Startup-Time>${node.actualStartupTime}</Actual-Startup-Time>\n`;
      xml += `${indent}  <Actual-Total-Time>${node.actualTotalTime}</Actual-Total-Time>\n`;
      xml += `${indent}  <Actual-Rows>${node.actualRows}</Actual-Rows>\n`;
      xml += `${indent}  <Actual-Loops>${node.actualLoops}</Actual-Loops>\n`;
    }

    if (node.filter) {
      xml += `${indent}  <Filter>${node.filter}</Filter>\n`;
      if (analyze && node.rowsRemovedByFilter) {
        xml += `${indent}  <Rows-Removed-by-Filter>${node.rowsRemovedByFilter}</Rows-Removed-by-Filter>\n`;
      }
    }

    if (node.hashCondition) {
      xml += `${indent}  <Hash-Cond>${node.hashCondition}</Hash-Cond>\n`;
    }

    if (node.sortKey) {
      xml += `${indent}  <Sort-Key>\n${indent}    <Item>${node.sortKey}</Item>\n${indent}  </Sort-Key>\n`;
      if (analyze && node.sortMethod) {
        xml += `${indent}  <Sort-Method>${node.sortMethod}</Sort-Method>\n`;
        xml += `${indent}  <Sort-Space-Used>${node.sortSpaceUsed}</Sort-Space-Used>\n`;
        xml += `${indent}  <Sort-Space-Type>Memory</Sort-Space-Type>\n`;
      }
    }

    if (node.children && node.children.length > 0) {
      xml += `${indent}  <Plans>\n`;
      for (const child of node.children) {
        xml += convertNode(child, level + 2);
      }
      xml += `${indent}  </Plans>\n`;
    }

    xml += `${indent}</Plan>\n`;
    return xml;
  }

  let xml =
    '<?xml version="1.0" encoding="UTF-8"?>\n<explain xmlns="http://www.postgresql.org/2009/explain">\n';
  xml += '  <Query>\n';
  xml += convertNode(plan.nodes[0], 2);
  xml += '  </Query>\n';

  if (analyze) {
    if (plan.planningTime) {
      xml += `  <Planning-Time>${plan.planningTime}</Planning-Time>\n`;
    }
    if (plan.executionTime) {
      xml += `  <Execution-Time>${plan.executionTime}</Execution-Time>\n`;
    }
  }

  xml += '</explain>';
  return xml;
}

/**
 * Formats plan as YAML output
 */
function formatPlanAsYAML(plan, analyze) {
  function convertNode(node, level = 0) {
    const indent = '  '.repeat(level);
    let yaml = `${indent}- Node Type: "${node.nodeType}"\n`;
    yaml += `${indent}  Startup Cost: ${node.startupCost}\n`;
    yaml += `${indent}  Total Cost: ${node.totalCost}\n`;
    yaml += `${indent}  Plan Rows: ${node.planRows}\n`;
    yaml += `${indent}  Plan Width: ${node.planWidth}\n`;

    if (node.relationName) {
      yaml += `${indent}  Relation Name: "${node.relationName}"\n`;
    }

    if (node.joinType) {
      yaml += `${indent}  Join Type: "${node.joinType}"\n`;
    }

    if (analyze && node.actualStartupTime !== null) {
      yaml += `${indent}  Actual Startup Time: ${node.actualStartupTime}\n`;
      yaml += `${indent}  Actual Total Time: ${node.actualTotalTime}\n`;
      yaml += `${indent}  Actual Rows: ${node.actualRows}\n`;
      yaml += `${indent}  Actual Loops: ${node.actualLoops}\n`;
    }

    if (node.filter) {
      yaml += `${indent}  Filter: "${node.filter}"\n`;
      if (analyze && node.rowsRemovedByFilter) {
        yaml += `${indent}  Rows Removed by Filter: ${node.rowsRemovedByFilter}\n`;
      }
    }

    if (node.hashCondition) {
      yaml += `${indent}  Hash Cond: "${node.hashCondition}"\n`;
    }

    if (node.sortKey) {
      yaml += `${indent}  Sort Key:\n${indent}    - "${node.sortKey}"\n`;
      if (analyze && node.sortMethod) {
        yaml += `${indent}  Sort Method: "${node.sortMethod}"\n`;
        yaml += `${indent}  Sort Space Used: ${node.sortSpaceUsed}\n`;
        yaml += `${indent}  Sort Space Type: "Memory"\n`;
      }
    }

    if (node.children && node.children.length > 0) {
      yaml += `${indent}  Plans:\n`;
      for (const child of node.children) {
        yaml += convertNode(child, level + 2);
      }
    }

    return yaml;
  }

  let yaml = '- Plan:\n';
  yaml += convertNode(plan.nodes[0], 1);

  if (analyze) {
    if (plan.planningTime) {
      yaml += `  Planning Time: ${plan.planningTime}\n`;
    }
    if (plan.executionTime) {
      yaml += `  Execution Time: ${plan.executionTime}\n`;
    }
  }

  return yaml;
}

/**
 * Helper functions to extract information from queries
 */
function extractTableName(query) {
  // Simple table name extraction - can be enhanced
  const patterns = [
    /FROM\s+([^\s,;]+)/i,
    /UPDATE\s+([^\s,;]+)/i,
    /INSERT\s+INTO\s+([^\s,;(]+)/i,
    /DELETE\s+FROM\s+([^\s,;]+)/i,
  ];

  for (const pattern of patterns) {
    const match = query.match(pattern);
    if (match) {
      return match[1].replace(/["`]/g, ''); // Remove quotes
    }
  }

  return null;
}

function extractWhereCondition(query) {
  const match = query.match(/WHERE\s+([^;]*?)(?:\s+ORDER\s+BY|\s+GROUP\s+BY|\s+LIMIT|$)/i);
  return match ? match[1].trim() : null;
}

function extractOrderByColumns(query) {
  const match = query.match(/ORDER\s+BY\s+([^;]*?)(?:\s+LIMIT|$)/i);
  return match ? match[1].trim() : null;
}

module.exports = {
  executeQuery,
  executeQueryString,
  processQuery,
  handleSelectQuery,
  handleArrayQuery,
  handleShowQuery,
  handleTransactionQuery,
  handleSetQuery,
  handleInsertQuery,
  handleUpdateQuery,
  handleDeleteQuery,
  handleCreateQuery,
  handleCreateTypeQuery,
  handleDropQuery,
  handleCopyQuery,
  parseCopyQuery,
  parseCopyOptions,
  handleUnknownQuery,
  generateMockCopyData,
  formatCopyData,
  handleCopyOut,
  generateMockQueryCopyData,
  handleIntrospectionQuery,
  handleExplainQuery,
  handleInformationSchemaTables,
  handleInformationSchemaColumns,
  handleInformationSchemaSchemata,
  handlePgCatalogQuery,
  handlePgTables,
  handlePgType,
  handlePgClass,
  updateTransactionStatus,
  validateQuery,
  getQueryType,
  getTypeOIDFromName,
  configureQueryLogger,
};
