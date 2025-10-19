/**
 * Enhanced Error Response Tests
 * Tests for comprehensive error handling with detailed debugging information
 */

const { PostgresError, ErrorContext } = require('../src/utils/errorHandler');

const { ErrorHandlerMiddleware, QueryErrorEnhancers } = require('../src/utils/errorMiddleware');

const { ERROR_CODES, ERROR_SEVERITY } = require('../src/protocol/constants');

describe('Enhanced Error Response System', () => {
  // Store original NODE_ENV
  const originalNodeEnv = process.env.NODE_ENV;

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
  });

  describe('PostgresError Enhanced Features', () => {
    it('should create error with development mode debugging info', () => {
      process.env.NODE_ENV = 'development';

      const error = new PostgresError(ERROR_CODES.SYNTAX_ERROR, 'Test error', {
        queryContext: {
          originalQuery: 'SELECT * FROM invalid_table',
          queryType: 'SELECT',
          connectionId: 'conn_123',
        },
      });

      expect(error.debugInfo).toBeDefined();
      expect(error.debugInfo.timestamp).toBeDefined();
      expect(error.debugInfo.nodeVersion).toBe(process.version);
      expect(error.debugInfo.queryContext.originalQuery).toBe('SELECT * FROM invalid_table');
      expect(error.enhancedStack).toBeDefined();
      expect(error.enhancedStack.frames).toBeDefined();
    });

    it('should not include debug info in production mode', () => {
      process.env.NODE_ENV = 'production';

      const error = new PostgresError(ERROR_CODES.SYNTAX_ERROR, 'Test error');

      expect(error.debugInfo).toBeUndefined();
      expect(error.enhancedStack).toBeUndefined();
    });

    it('should parse stack frames correctly', () => {
      process.env.NODE_ENV = 'development';

      const error = new PostgresError(ERROR_CODES.SYNTAX_ERROR, 'Test error');
      const frame = error.parseStackFrame(
        '    at handleSelectQuery (/app/src/handlers/queryHandlers.js:123:45)'
      );

      expect(frame).toEqual({
        function: 'handleSelectQuery',
        file: '/app/src/handlers/queryHandlers.js',
        line: 123,
        column: 45,
        isInternal: false,
      });
    });

    it('should identify internal stack frames', () => {
      process.env.NODE_ENV = 'development';

      const error = new PostgresError(ERROR_CODES.SYNTAX_ERROR, 'Test error');
      const frame = error.parseStackFrame(
        '    at Module.load (node:internal/modules/cjs/loader.js:123:45)'
      );

      expect(frame.isInternal).toBe(true);
    });
  });

  describe('ErrorContext Generators', () => {
    describe('Parsing Context', () => {
      it('should generate detailed parsing context', () => {
        const query = 'SELECT name, email\nFROM users\nWHERE invalid_syntax';
        const position = 35; // Position of "invalid_syntax"

        const context = ErrorContext.generateParsingContext(query, position, 'identifier');

        expect(context.detail).toContain('line 3');
        expect(context.hint).toContain('Expected: identifier');
        expect(context.position).toBe('35');
        expect(context.queryContext.lineNumber).toBe(3);
        expect(context.queryContext.errorLine).toBe('WHERE invalid_syntax');
      });

      it('should handle single line queries', () => {
        const query = 'SELECT * FROM users WHERE invalid';
        const position = 25; // Position of "invalid"

        const context = ErrorContext.generateParsingContext(query, position);

        expect(context.detail).toContain('line 1');
        expect(context.queryContext.lineNumber).toBe(1);
      });
    });

    describe('Function Context', () => {
      it('should generate function context with suggestions', () => {
        const availableFunctions = ['count', 'concat', 'coalesce', 'current_timestamp'];
        const context = ErrorContext.generateFunctionContext(
          'concate',
          ['text', 'text'],
          availableFunctions
        );

        expect(context.detail).toContain('Function "concate(text, text)" does not exist');
        expect(context.hint).toContain('Did you mean: concat');
        expect(context.routine).toBe('concate');
      });

      it('should handle functions without arguments', () => {
        const context = ErrorContext.generateFunctionContext('now_invalid', []);

        expect(context.detail).toContain('Function "now_invalid()" does not exist');
        expect(context.dataType).toBe('void');
      });
    });

    describe('Schema Context', () => {
      it('should generate schema context with suggestions', () => {
        const schemaInfo = {
          schema: 'public',
          availableObjects: ['users', 'products', 'orders'],
        };

        const context = ErrorContext.generateSchemaContext('table', 'user', schemaInfo);

        expect(context.detail).toBe('Table "user" does not exist');
        expect(context.hint).toContain('Did you mean: users');
        expect(context.schema).toBe('public');
      });
    });

    describe('Constraint Context', () => {
      it('should generate not null constraint context', () => {
        const constraintInfo = {
          column: 'email',
          constraint: 'users_email_not_null',
          table: 'users',
          schema: 'public',
        };

        const context = ErrorContext.generateConstraintContext('not_null', constraintInfo);

        expect(context.detail).toContain(
          'Null value violates not-null constraint on column "email"'
        );
        expect(context.hint).toContain('Provide a value for this required column');
        expect(context.constraint).toBe('users_email_not_null');
      });

      it('should generate foreign key constraint context', () => {
        const constraintInfo = {
          constraint: 'orders_user_id_fkey',
          table: 'orders',
          schema: 'public',
        };

        const context = ErrorContext.generateConstraintContext('foreign_key', constraintInfo);

        expect(context.detail).toContain('Foreign key constraint "orders_user_id_fkey" violated');
        expect(context.hint).toContain('referenced record does not exist');
      });
    });

    describe('Similarity Functions', () => {
      it('should find similar function names', () => {
        const functions = ['count', 'concat', 'coalesce', 'current_timestamp', 'character_length'];
        const similar = ErrorContext.findSimilarFunctions('concate', functions);

        expect(similar).toContain('concat');
        expect(similar[0]).toBe('concat'); // Should be the most similar
      });

      it('should calculate similarity correctly', () => {
        expect(ErrorContext.calculateSimilarity('concat', 'concat')).toBe(1);
        expect(ErrorContext.calculateSimilarity('concat', 'concate')).toBeGreaterThanOrEqual(0.8);
        expect(ErrorContext.calculateSimilarity('count', 'xyz')).toBeLessThan(0.5);
      });
    });
  });

  describe('ErrorHandlerMiddleware', () => {
    describe('Handler Wrapping', () => {
      it('should wrap handler and catch errors', async () => {
        const mockHandler = jest.fn().mockRejectedValue(new Error('Test error'));
        const wrappedHandler = ErrorHandlerMiddleware.wrapHandler('testHandler', mockHandler);

        const result = await wrappedHandler('SELECT * FROM test', { id: 'conn_123' });

        expect(result.error).toBeInstanceOf(PostgresError);
        expect(result.success).toBe(false);
        expect(result.error.routine).toBe('testHandler');
      });

      it('should pass through successful results', async () => {
        const mockResult = { success: true, rows: [] };
        const mockHandler = jest.fn().mockResolvedValue(mockResult);
        const wrappedHandler = ErrorHandlerMiddleware.wrapHandler('testHandler', mockHandler);

        const result = await wrappedHandler('SELECT * FROM test', { id: 'conn_123' });

        expect(result).toBe(mockResult);
        expect(mockHandler).toHaveBeenCalledWith('SELECT * FROM test', { id: 'conn_123' });
      });

      it('should enhance existing PostgresError', async () => {
        const originalError = new PostgresError(ERROR_CODES.SYNTAX_ERROR, 'Syntax error');
        const mockHandler = jest.fn().mockRejectedValue(originalError);
        const wrappedHandler = ErrorHandlerMiddleware.wrapHandler('testHandler', mockHandler);

        const result = await wrappedHandler('SELECT * FROM test', { id: 'conn_123' });

        expect(result.error).toBe(originalError);
        expect(result.error.routine).toBe('testHandler');
      });
    });

    describe('Error Code Determination', () => {
      it('should map common error patterns to SQLSTATE codes', () => {
        expect(
          ErrorHandlerMiddleware.determineErrorCode(new Error('syntax error near "SELECT"'))
        ).toBe(ERROR_CODES.SYNTAX_ERROR);

        expect(
          ErrorHandlerMiddleware.determineErrorCode(new Error('column "name" does not exist'))
        ).toBe(ERROR_CODES.UNDEFINED_COLUMN);

        expect(
          ErrorHandlerMiddleware.determineErrorCode(new Error('relation "users" does not exist'))
        ).toBe(ERROR_CODES.UNDEFINED_TABLE);

        expect(
          ErrorHandlerMiddleware.determineErrorCode(new Error('function "invalid" does not exist'))
        ).toBe(ERROR_CODES.UNDEFINED_FUNCTION);
      });

      it('should default to internal error for unknown patterns', () => {
        expect(ErrorHandlerMiddleware.determineErrorCode(new Error('unknown error'))).toBe(
          ERROR_CODES.INTERNAL_ERROR
        );
      });
    });

    describe('Query Type Detection', () => {
      it('should detect query types correctly', () => {
        expect(ErrorHandlerMiddleware.getQueryType('SELECT * FROM users')).toBe('SELECT');
        expect(
          ErrorHandlerMiddleware.getQueryType('INSERT INTO users (name) VALUES ("test")')
        ).toBe('INSERT');
        expect(ErrorHandlerMiddleware.getQueryType('UPDATE users SET name = "test"')).toBe(
          'UPDATE'
        );
        expect(ErrorHandlerMiddleware.getQueryType('DELETE FROM users')).toBe('DELETE');
        expect(ErrorHandlerMiddleware.getQueryType('EXPLAIN SELECT * FROM users')).toBe('EXPLAIN');
        expect(ErrorHandlerMiddleware.getQueryType('COPY users FROM STDIN')).toBe('COPY');
        expect(ErrorHandlerMiddleware.getQueryType('')).toBe('UNKNOWN');
      });
    });
  });

  describe('QueryErrorEnhancers', () => {
    describe('SELECT Error Enhancement', () => {
      it('should enhance undefined column errors with suggestions', () => {
        const error = new PostgresError(
          ERROR_CODES.UNDEFINED_COLUMN,
          'Column "nam" does not exist'
        );
        const query = 'SELECT nam FROM users';
        const context = {
          availableColumns: ['name', 'email', 'created_at'],
        };

        const enhanced = QueryErrorEnhancers.enhanceSelectError(error, query, context);

        expect(enhanced.hint).toContain('Did you mean: name');
        expect(enhanced.detail).toContain('Column "nam" does not exist');
      });

      it('should enhance undefined table errors with suggestions', () => {
        const error = new PostgresError(ERROR_CODES.UNDEFINED_TABLE, 'Table "user" does not exist');
        const query = 'SELECT * FROM user';
        const context = {
          availableTables: ['users', 'products', 'orders'],
        };

        const enhanced = QueryErrorEnhancers.enhanceSelectError(error, query, context);

        expect(enhanced.hint).toContain('Did you mean: users');
      });
    });

    describe('INSERT Error Enhancement', () => {
      it('should enhance not null constraint errors', () => {
        const error = new PostgresError(ERROR_CODES.NULL_VALUE_NOT_ALLOWED, 'Null not allowed');
        error.column = 'email';
        const query = 'INSERT INTO users (name) VALUES ("test")';
        const context = {
          constraints: [{ column: 'email', name: 'users_email_not_null' }],
        };

        const enhanced = QueryErrorEnhancers.enhanceInsertError(error, query, context);

        expect(enhanced.detail).toBe('Column "email" cannot be null');
        expect(enhanced.constraint).toBe('users_email_not_null');
        expect(enhanced.context).toContain('NOT NULL constraint');
      });
    });

    describe('COPY Error Enhancement', () => {
      it('should enhance COPY errors with line information', () => {
        const error = new PostgresError(ERROR_CODES.DATA_EXCEPTION, 'Invalid data');
        const query = 'COPY users FROM STDIN';
        const context = {
          currentLine: 42,
          source: 'STDIN',
        };

        const enhanced = QueryErrorEnhancers.enhanceCopyError(error, query, context);

        expect(enhanced.detail).toContain('line 42');
        expect(enhanced.table).toBe('users');
        expect(enhanced.context).toContain('COPY users FROM STDIN');
        expect(enhanced.position).toBe('42');
      });
    });

    describe('EXPLAIN Error Enhancement', () => {
      it('should enhance EXPLAIN errors with inner query context', () => {
        const error = new PostgresError(ERROR_CODES.SYNTAX_ERROR, 'Syntax error');
        const query = 'EXPLAIN (FORMAT JSON) SELECT * FROM invalid_table';

        const enhanced = QueryErrorEnhancers.enhanceExplainError(error, query);

        expect(enhanced.internalQuery).toBe('SELECT * FROM invalid_table');
        expect(enhanced.context).toBe('EXPLAIN query analysis');
        expect(enhanced.hint).toContain('Check the syntax of the query being explained');
      });
    });
  });

  describe('PostgreSQL Protocol Compliance', () => {
    it('should include all required error fields', () => {
      const error = new PostgresError(ERROR_CODES.SYNTAX_ERROR, 'Test error', {
        detail: 'Detailed information',
        hint: 'Try this instead',
        position: '10',
      });

      const protocolFormat = error.toProtocolFormat();

      expect(protocolFormat.code).toBe(ERROR_CODES.SYNTAX_ERROR);
      expect(protocolFormat.message).toBe('Test error');
      expect(protocolFormat.additionalFields).toBeDefined();
    });

    it('should handle all PostgreSQL error field types', () => {
      const error = new PostgresError(ERROR_CODES.UNDEFINED_COLUMN, 'Column not found', {
        severity: ERROR_SEVERITY.ERROR,
        detail: 'Detailed message',
        hint: 'Suggestion',
        position: '15',
        internalPosition: '10',
        internalQuery: 'SELECT col',
        context: 'WHERE clause',
        schema: 'public',
        table: 'users',
        column: 'invalid_col',
        dataType: 'text',
        constraint: 'not_null_constraint',
        file: 'handler.js',
        line: '42',
        routine: 'handleSelect',
      });

      expect(error.severity).toBe(ERROR_SEVERITY.ERROR);
      expect(error.detail).toBe('Detailed message');
      expect(error.hint).toBe('Suggestion');
      expect(error.position).toBe('15');
      expect(error.schema).toBe('public');
      expect(error.table).toBe('users');
      expect(error.column).toBe('invalid_col');
    });
  });

  describe('Development vs Production Behavior', () => {
    it('should include stack traces only in development mode', () => {
      process.env.NODE_ENV = 'development';
      const devError = new PostgresError(ERROR_CODES.INTERNAL_ERROR, 'Dev error');

      process.env.NODE_ENV = 'production';
      const prodError = new PostgresError(ERROR_CODES.INTERNAL_ERROR, 'Prod error');

      expect(devError.enhancedStack).toBeDefined();
      expect(prodError.enhancedStack).toBeUndefined();
    });

    it('should exclude sensitive information in production', () => {
      process.env.NODE_ENV = 'production';

      const error = ErrorHandlerMiddleware.convertToPostgresError(
        new Error('Internal system error'),
        { handlerName: 'testHandler', query: 'SELECT * FROM secret_table' }
      );

      expect(error.detail).toBe('An unexpected error occurred');
      // Should not contain the actual stack trace or query details in production
    });
  });
});
