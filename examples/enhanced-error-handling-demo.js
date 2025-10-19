#!/usr/bin/env node

/**
 * Enhanced Error Handling Demo
 *
 * This script demonstrates the enhanced error handling capabilities
 * of pg-wire-mock with detailed debugging information and contextual suggestions.
 */

const { PostgresError, ErrorContext } = require('../src/utils/errorHandler');
const { ErrorHandlerMiddleware, QueryErrorEnhancers } = require('../src/utils/errorMiddleware');
const { ERROR_CODES } = require('../src/protocol/constants');

console.log('🔧 Enhanced Error Handling Demo\n');

// Set development mode for enhanced debugging
process.env.NODE_ENV = 'development';

// Demo 1: Basic Enhanced Error
console.log('📋 Demo 1: Basic Enhanced Error with Development Mode Debugging');
console.log('─'.repeat(60));

const basicError = new PostgresError(ERROR_CODES.UNDEFINED_COLUMN, 'column "nam" does not exist', {
  queryContext: {
    originalQuery: 'SELECT nam, email FROM users WHERE active = true',
    queryType: 'SELECT',
    connectionId: 'conn_abc123',
  },
});

console.log('Error Code:', basicError.code);
console.log('Message:', basicError.message);
console.log('Development Info Available:', !!basicError.debugInfo);
console.log('Stack Trace Available:', !!basicError.enhancedStack);
if (basicError.debugInfo) {
  console.log('Query Type:', basicError.debugInfo.queryContext?.queryType);
  console.log('Connection ID:', basicError.debugInfo.queryContext?.connectionId);
}
console.log();

// Demo 2: Error Context Generation
console.log('🎯 Demo 2: Intelligent Error Context Generation');
console.log('─'.repeat(60));

// Parsing error context
const parsingContext = ErrorContext.generateParsingContext(
  'SELECT name, email\\nFROM users\\nWHERE invalid_syntax_here',
  35, // Position of error
  'identifier, keyword, or operator'
);

console.log('Parsing Error Context:');
console.log('  Detail:', parsingContext.detail);
console.log('  Hint:', parsingContext.hint);
console.log('  Line Number:', parsingContext.queryContext.lineNumber);
console.log('  Error Line:', `"${parsingContext.queryContext.errorLine}"`);
console.log();

// Function suggestion context
const functionContext = ErrorContext.generateFunctionContext(
  'concate', // User typed "concate" instead of "concat"
  ['text', 'text'],
  ['concat', 'coalesce', 'count', 'current_timestamp']
);

console.log('Function Error Context:');
console.log('  Detail:', functionContext.detail);
console.log('  Hint:', functionContext.hint);
console.log('  Routine:', functionContext.routine);
console.log();

// Schema object suggestions
const schemaContext = ErrorContext.generateSchemaContext(
  'table',
  'user', // User typed "user" instead of "users"
  {
    schema: 'public',
    availableObjects: ['users', 'products', 'orders', 'user_profiles'],
  }
);

console.log('Schema Error Context:');
console.log('  Detail:', schemaContext.detail);
console.log('  Hint:', schemaContext.hint);
console.log('  Schema:', schemaContext.schema);
console.log();

// Demo 3: Query-Specific Error Enhancement
console.log('⚡ Demo 3: Query-Specific Error Enhancement');
console.log('─'.repeat(60));

// SELECT query error enhancement
let selectError = new PostgresError(ERROR_CODES.UNDEFINED_COLUMN, 'column "nam" does not exist');
const enhancedSelectError = QueryErrorEnhancers.enhanceSelectError(
  selectError,
  'SELECT nam, email FROM users',
  {
    availableColumns: ['name', 'email', 'created_at', 'updated_at'],
    availableTables: ['users', 'products', 'orders'],
  }
);

console.log('Enhanced SELECT Error:');
console.log('  Original Message:', selectError.message);
console.log('  Enhanced Hint:', enhancedSelectError.hint);
console.log('  Enhanced Detail:', enhancedSelectError.detail);
console.log();

// INSERT constraint error enhancement
let insertError = new PostgresError(ERROR_CODES.NULL_VALUE_NOT_ALLOWED, 'null value not allowed');
insertError.column = 'email';
const enhancedInsertError = QueryErrorEnhancers.enhanceInsertError(
  insertError,
  'INSERT INTO users (name) VALUES ("John Doe")',
  {
    constraints: [{ column: 'email', name: 'users_email_not_null', type: 'not_null' }],
  }
);

console.log('Enhanced INSERT Error:');
console.log('  Enhanced Detail:', enhancedInsertError.detail);
console.log('  Enhanced Hint:', enhancedInsertError.hint);
console.log('  Constraint:', enhancedInsertError.constraint);
console.log('  Context:', enhancedInsertError.context);
console.log();

// Demo 4: Error Middleware Simulation
console.log('🔄 Demo 4: Error Handling Middleware');
console.log('─'.repeat(60));

// Simulate a query handler that throws an error
async function mockQueryHandler(query, _connState) {
  // Simulate processing...
  if (query.includes('invalid_table')) {
    throw new Error('relation "invalid_table" does not exist');
  }
  return { success: true, rows: [] };
}

// Wrap with error middleware
const wrappedHandler = ErrorHandlerMiddleware.wrapHandler('mockSelectHandler', mockQueryHandler);

// Test with error-causing query
(async () => {
  const result = await wrappedHandler('SELECT * FROM invalid_table', {
    id: 'conn_456',
    clientAddress: '127.0.0.1:12345',
  });

  console.log('Middleware Result:');
  console.log('  Success:', result.success);
  console.log('  Error Type:', result.error?.constructor.name);
  console.log('  Error Code:', result.error?.code);
  console.log('  Error Message:', result.error?.message);
  console.log('  Routine:', result.error?.routine);
  console.log('  Context:', result.error?.context);
})();

console.log();

// Demo 5: Production vs Development Mode
console.log('🛡️  Demo 5: Production vs Development Mode Differences');
console.log('─'.repeat(60));

// Development mode error
process.env.NODE_ENV = 'development';
const devError = new PostgresError(ERROR_CODES.INTERNAL_ERROR, 'Internal server error', {
  queryContext: {
    originalQuery: 'SELECT * FROM secret_table',
    sensitiveData: 'password123',
  },
});

// Production mode error
process.env.NODE_ENV = 'production';
const prodError = new PostgresError(ERROR_CODES.INTERNAL_ERROR, 'Internal server error', {
  queryContext: {
    originalQuery: 'SELECT * FROM secret_table',
    sensitiveData: 'password123',
  },
});

console.log('Development Mode:');
console.log('  Debug Info Available:', !!devError.debugInfo);
console.log('  Stack Trace Available:', !!devError.enhancedStack);

console.log('\\nProduction Mode:');
console.log('  Debug Info Available:', !!prodError.debugInfo);
console.log('  Stack Trace Available:', !!prodError.enhancedStack);

console.log();
console.log('✅ Enhanced Error Handling Demo Complete!');
console.log();
console.log('Key Benefits:');
console.log('• Detailed error context with suggestions');
console.log('• Development mode debugging information');
console.log('• Production safety and security');
console.log('• PostgreSQL protocol compliance');
console.log('• Intelligent fuzzy matching for suggestions');
console.log('• Automatic error enhancement middleware');
