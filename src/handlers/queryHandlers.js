/**
 * PostgreSQL Wire Protocol Query Handlers
 * Functions for processing SQL queries and generating appropriate responses
 */

const {
  DATA_TYPES,
  TRANSACTION_STATUS,
  ERROR_CODES
} = require('../protocol/constants');

const {
  formatCommandTag
} = require('../protocol/utils');

const {
  sendRowDescription,
  sendDataRow,
  sendCommandComplete,
  sendEmptyQueryResponse,
  sendErrorResponse
} = require('../protocol/messageBuilders');

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
 * Executes a single SQL query and sends appropriate protocol messages
 * @param {string} query - The SQL query to execute
 * @param {Socket} socket - Client socket for sending responses
 * @param {ConnectionState} connState - Connection state object
 */
function executeQuery(query, socket, connState) {
  console.log(`Executing query: ${query}`);
  
  // Process the query and get results
  const results = processQuery(query, connState);
  
  // Handle query errors
  if (results.error) {
    sendErrorResponse(socket, results.error.code, results.error.message, results.error.additionalFields);
    connState.transactionStatus = TRANSACTION_STATUS.IN_FAILED_TRANSACTION;
    return;
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
    if (normalizedQuery.startsWith('SELECT')) {
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
    } else {
      return handleUnknownQuery(normalizedQuery, connState);
    }
  } catch (error) {
    console.error('Error processing query:', error);
    return {
      error: {
        code: ERROR_CODES.INTERNAL_ERROR,
        message: `Internal server error: ${error.message}`,
        additionalFields: {
          'D': 'An unexpected error occurred while processing the query'
        }
      }
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
  // Handle specific SELECT queries
  switch (query) {
    case 'SELECT 1':
    case 'SELECT 1;':
      return {
        columns: [{ 
          name: '?column?', 
          dataTypeOID: DATA_TYPES.INT4, 
          dataTypeSize: 4 
        }],
        rows: [['1']],
        command: 'SELECT',
        rowCount: 1
      };
    
    case 'SELECT VERSION()':
    case 'SELECT VERSION();':
      return {
        columns: [{ 
          name: 'version', 
          dataTypeOID: DATA_TYPES.TEXT, 
          dataTypeSize: -1 
        }],
        rows: [['PostgreSQL Wire Protocol Mock Server 1.0']],
        command: 'SELECT',
        rowCount: 1
      };

    case 'SELECT CURRENT_USER':
    case 'SELECT CURRENT_USER;':
      const currentUser = connState.parameters.get('user') || 'postgres';
      return {
        columns: [{ 
          name: 'current_user', 
          dataTypeOID: DATA_TYPES.NAME, 
          dataTypeSize: 64 
        }],
        rows: [[currentUser]],
        command: 'SELECT',
        rowCount: 1
      };

    case 'SELECT CURRENT_DATABASE()':
    case 'SELECT CURRENT_DATABASE();':
      const currentDb = connState.parameters.get('database') || 'postgres';
      return {
        columns: [{ 
          name: 'current_database', 
          dataTypeOID: DATA_TYPES.NAME, 
          dataTypeSize: 64 
        }],
        rows: [[currentDb]],
        command: 'SELECT',
        rowCount: 1
      };

    case 'SELECT NOW()':
    case 'SELECT NOW();':
      return {
        columns: [{ 
          name: 'now', 
          dataTypeOID: DATA_TYPES.TIMESTAMPTZ, 
          dataTypeSize: 8 
        }],
        rows: [[new Date().toISOString()]],
        command: 'SELECT',
        rowCount: 1
      };

    default:
      // Generic SELECT response for unknown queries
      return {
        columns: [{ 
          name: 'result', 
          dataTypeOID: DATA_TYPES.TEXT, 
          dataTypeSize: -1 
        }],
        rows: [['Mock response for: ' + query.substring(0, 50)]],
        command: 'SELECT',
        rowCount: 1
      };
  }
}

/**
 * Handles SHOW queries
 * @param {string} query - The SHOW query
 * @param {ConnectionState} connState - Connection state object
 * @returns {QueryResult} Query result
 */
function handleShowQuery(query, connState) {
  switch (query) {
    case 'SHOW DOCS':
    case 'SHOW DOCS;':
      return {
        columns: [{ 
          name: 'docs', 
          dataTypeOID: DATA_TYPES.TEXT, 
          dataTypeSize: -1 
        }],
        rows: [['https://www.postgresql.org/docs/']],
        command: 'SHOW',
        rowCount: 1
      };

    case 'SHOW SERVER_VERSION':
    case 'SHOW SERVER_VERSION;':
      return {
        columns: [{ 
          name: 'server_version', 
          dataTypeOID: DATA_TYPES.TEXT, 
          dataTypeSize: -1 
        }],
        rows: [['13.0 (Mock)']],
        command: 'SHOW',
        rowCount: 1
      };

    case 'SHOW TIMEZONE':
    case 'SHOW TIMEZONE;':
    case 'SHOW TIME ZONE':
    case 'SHOW TIME ZONE;':
      return {
        columns: [{ 
          name: 'TimeZone', 
          dataTypeOID: DATA_TYPES.TEXT, 
          dataTypeSize: -1 
        }],
        rows: [['UTC']],
        command: 'SHOW',
        rowCount: 1
      };

    default:
      // Generic SHOW response
      return {
        columns: [{ 
          name: 'setting', 
          dataTypeOID: DATA_TYPES.TEXT, 
          dataTypeSize: -1 
        }],
        rows: [['Mock setting value']],
        command: 'SHOW',
        rowCount: 1
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
          message: `Unknown transaction command: ${command}`
        }
      };
  }
}

/**
 * Handles SET queries
 * @param {string} query - The SET query
 * @param {ConnectionState} connState - Connection state object
 * @returns {QueryResult} Query result
 */
function handleSetQuery(query, connState) {
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
      message: 'Invalid SET command syntax'
    }
  };
}

/**
 * Handles INSERT queries (mock implementation)
 * @param {string} query - The INSERT query
 * @param {ConnectionState} connState - Connection state object
 * @returns {QueryResult} Query result
 */
function handleInsertQuery(query, connState) {
  // Mock INSERT - always reports 1 row inserted
  return { 
    command: 'INSERT', 
    rowCount: 1 
  };
}

/**
 * Handles UPDATE queries (mock implementation)
 * @param {string} query - The UPDATE query
 * @param {ConnectionState} connState - Connection state object
 * @returns {QueryResult} Query result
 */
function handleUpdateQuery(query, connState) {
  // Mock UPDATE - reports random number of rows updated
  const mockRowCount = Math.floor(Math.random() * 5) + 1;
  return { 
    command: 'UPDATE', 
    rowCount: mockRowCount 
  };
}

/**
 * Handles DELETE queries (mock implementation)
 * @param {string} query - The DELETE query
 * @param {ConnectionState} connState - Connection state object
 * @returns {QueryResult} Query result
 */
function handleDeleteQuery(query, connState) {
  // Mock DELETE - reports random number of rows deleted
  const mockRowCount = Math.floor(Math.random() * 3);
  return { 
    command: 'DELETE', 
    rowCount: mockRowCount 
  };
}

/**
 * Handles CREATE queries (mock implementation)
 * @param {string} query - The CREATE query
 * @param {ConnectionState} connState - Connection state object
 * @returns {QueryResult} Query result
 */
function handleCreateQuery(query, connState) {
  if (query.includes('TABLE')) {
    return { command: 'CREATE TABLE', rowCount: 0 };
  } else if (query.includes('INDEX')) {
    return { command: 'CREATE INDEX', rowCount: 0 };
  } else {
    return { command: 'CREATE', rowCount: 0 };
  }
}

/**
 * Handles DROP queries (mock implementation)
 * @param {string} query - The DROP query
 * @param {ConnectionState} connState - Connection state object
 * @returns {QueryResult} Query result
 */
function handleDropQuery(query, connState) {
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
 * @param {string} query - The unknown query
 * @param {ConnectionState} connState - Connection state object
 * @returns {QueryResult} Query result
 */
function handleUnknownQuery(query, connState) {
  // Return a generic successful response for unknown queries
  return {
    columns: [{ 
      name: 'message', 
      dataTypeOID: DATA_TYPES.TEXT, 
      dataTypeSize: -1 
    }],
    rows: [['Hello from PostgreSQL Wire Protocol Mock Server!']],
    command: 'SELECT',
    rowCount: 1
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
      error: {
        code: ERROR_CODES.SYNTAX_ERROR,
        message: 'Empty query string'
      }
    };
  }
  
  // Basic syntax validation - check for unmatched quotes
  const singleQuotes = (query.match(/'/g) || []).length;
  const doubleQuotes = (query.match(/"/g) || []).length;
  
  if (singleQuotes % 2 !== 0) {
    return {
      isValid: false,
      error: {
        code: ERROR_CODES.SYNTAX_ERROR,
        message: 'Unterminated quoted string'
      }
    };
  }
  
  if (doubleQuotes % 2 !== 0) {
    return {
      isValid: false,
      error: {
        code: ERROR_CODES.SYNTAX_ERROR,
        message: 'Unterminated quoted identifier'
      }
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

module.exports = {
  executeQuery,
  executeQueryString,
  processQuery,
  handleSelectQuery,
  handleShowQuery,
  handleTransactionQuery,
  handleSetQuery,
  handleInsertQuery,
  handleUpdateQuery,
  handleDeleteQuery,
  handleCreateQuery,
  handleDropQuery,
  handleUnknownQuery,
  updateTransactionStatus,
  validateQuery,
  getQueryType
};
