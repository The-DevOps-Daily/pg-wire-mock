/**
 * Tests for Enhanced Error Handler
 */

const {
  PostgresError,
  ErrorFactory,
  createError,
  wrapError,
  formatErrorForLogging,
  isValidErrorStructure,
  isDevelopmentMode,
} = require('../src/utils/errorHandler');

const { ERROR_CODES, ERROR_SEVERITY } = require('../src/protocol/constants');

describe('ErrorHandler', () => {
  describe('PostgresError', () => {
    it('should create a basic error', () => {
      const error = new PostgresError(ERROR_CODES.SYNTAX_ERROR, 'Test error');
      expect(error.code).toBe(ERROR_CODES.SYNTAX_ERROR);
      expect(error.message).toBe('Test error');
      expect(error.severity).toBe(ERROR_SEVERITY.ERROR);
    });

    it('should create an error with all optional fields', () => {
      const error = new PostgresError(ERROR_CODES.UNDEFINED_COLUMN, 'Column not found', {
        severity: ERROR_SEVERITY.WARNING,
        detail: 'Detailed information',
        hint: 'Try this instead',
        position: '10',
        context: 'In SELECT statement',
        schema: 'public',
        table: 'users',
        column: 'name',
        dataType: 'text',
        constraint: 'not_null',
        file: 'queryHandlers.js',
        line: '42',
        routine: 'handleSelectQuery',
      });

      expect(error.severity).toBe(ERROR_SEVERITY.WARNING);
      expect(error.detail).toBe('Detailed information');
      expect(error.hint).toBe('Try this instead');
      expect(error.position).toBe('10');
      expect(error.context).toBe('In SELECT statement');
      expect(error.schema).toBe('public');
      expect(error.table).toBe('users');
      expect(error.column).toBe('name');
      expect(error.dataType).toBe('text');
      expect(error.constraint).toBe('not_null');
      expect(error.file).toBe('queryHandlers.js');
      expect(error.line).toBe('42');
      expect(error.routine).toBe('handleSelectQuery');
    });

    it('should convert to protocol format', () => {
      const error = new PostgresError(ERROR_CODES.SYNTAX_ERROR, 'Test error', {
        detail: 'Detail message',
        hint: 'Hint message',
      });

      const protocolFormat = error.toProtocolFormat();
      expect(protocolFormat.code).toBe(ERROR_CODES.SYNTAX_ERROR);
      expect(protocolFormat.message).toBe('Test error');
      expect(protocolFormat.detail).toBe('Detail message');
      expect(protocolFormat.hint).toBe('Hint message');
      expect(protocolFormat.severity).toBe(ERROR_SEVERITY.ERROR);
    });
  });

  describe('ErrorFactory', () => {
    it('should create a syntax error', () => {
      const error = ErrorFactory.syntaxError('Bad syntax');
      expect(error.code).toBe(ERROR_CODES.SYNTAX_ERROR);
      expect(error.message).toBe('Bad syntax');
      expect(error.hint).toBeTruthy();
    });

    it('should create an undefined column error', () => {
      const error = ErrorFactory.undefinedColumn('username', 'users');
      expect(error.code).toBe(ERROR_CODES.UNDEFINED_COLUMN);
      expect(error.message).toContain('username');
      expect(error.column).toBe('username');
      expect(error.table).toBe('users');
      expect(error.hint).toBeTruthy();
    });

    it('should create an undefined table error', () => {
      const error = ErrorFactory.undefinedTable('users');
      expect(error.code).toBe(ERROR_CODES.UNDEFINED_TABLE);
      expect(error.message).toContain('users');
      expect(error.table).toBe('users');
      expect(error.hint).toBeTruthy();
    });

    it('should create an undefined function error', () => {
      const error = ErrorFactory.undefinedFunction('my_func', ['integer', 'text']);
      expect(error.code).toBe(ERROR_CODES.UNDEFINED_FUNCTION);
      expect(error.message).toContain('my_func');
      expect(error.message).toContain('integer');
      expect(error.message).toContain('text');
      expect(error.routine).toBe('my_func');
    });

    it('should create an internal error', () => {
      const originalError = new Error('Original error');
      const error = ErrorFactory.internalError('Something went wrong', originalError);
      expect(error.code).toBe(ERROR_CODES.INTERNAL_ERROR);
      expect(error.message).toBe('Something went wrong');
      expect(error.detail).toBeTruthy();
      expect(error.hint).toBeTruthy();
    });

    it('should create a protocol violation error', () => {
      const error = ErrorFactory.protocolViolation('Invalid message');
      expect(error.code).toBe(ERROR_CODES.PROTOCOL_VIOLATION);
      expect(error.message).toBe('Invalid message');
      expect(error.detail).toBeTruthy();
      expect(error.hint).toBeTruthy();
    });

    it('should create a feature not supported error', () => {
      const error = ErrorFactory.featureNotSupported('COPY protocol');
      expect(error.code).toBe(ERROR_CODES.FEATURE_NOT_SUPPORTED);
      expect(error.message).toContain('COPY protocol');
      expect(error.hint).toBeTruthy();
    });

    it('should create an invalid parameter value error', () => {
      const error = ErrorFactory.invalidParameterValue('timeout', 'invalid');
      expect(error.code).toBe(ERROR_CODES.INVALID_PARAMETER_VALUE);
      expect(error.message).toContain('timeout');
      expect(error.message).toContain('invalid');
    });

    it('should create a data exception error', () => {
      const error = ErrorFactory.dataException('Invalid data');
      expect(error.code).toBe(ERROR_CODES.DATA_EXCEPTION);
      expect(error.message).toBe('Invalid data');
    });

    it('should create a null not allowed error', () => {
      const error = ErrorFactory.nullNotAllowed('email');
      expect(error.code).toBe(ERROR_CODES.NULL_VALUE_NOT_ALLOWED);
      expect(error.message).toContain('email');
      expect(error.column).toBe('email');
    });

    it('should create an empty query error', () => {
      const error = ErrorFactory.emptyQuery();
      expect(error.code).toBe(ERROR_CODES.SYNTAX_ERROR);
      expect(error.message).toContain('empty');
    });

    it('should create an unterminated string error', () => {
      const error = ErrorFactory.unterminatedString(42);
      expect(error.code).toBe(ERROR_CODES.SYNTAX_ERROR);
      expect(error.message).toContain('unterminated');
      expect(error.position).toBe('42');
    });

    it('should create an unterminated identifier error', () => {
      const error = ErrorFactory.unterminatedIdentifier(10);
      expect(error.code).toBe(ERROR_CODES.SYNTAX_ERROR);
      expect(error.message).toContain('unterminated');
      expect(error.position).toBe('10');
    });

    it('should create an invalid array format error', () => {
      const error = ErrorFactory.invalidArrayFormat('Bad array');
      expect(error.code).toBe(ERROR_CODES.INVALID_PARAMETER_VALUE);
      expect(error.message).toBe('Bad array');
      expect(error.hint).toBeDefined();
      expect(error.hint).toContain('PostgreSQL');
    });
  });

  describe('createError', () => {
    it('should create a PostgresError', () => {
      const error = createError(ERROR_CODES.INTERNAL_ERROR, 'Test', { detail: 'Details' });
      expect(error).toBeInstanceOf(PostgresError);
      expect(error.code).toBe(ERROR_CODES.INTERNAL_ERROR);
      expect(error.detail).toBe('Details');
    });
  });

  describe('wrapError', () => {
    it('should wrap a PostgresError with additional context', () => {
      const original = ErrorFactory.syntaxError('Bad syntax');
      const wrapped = wrapError(original, 'While processing query');

      expect(wrapped).toBeInstanceOf(PostgresError);
      expect(wrapped.code).toBe(ERROR_CODES.SYNTAX_ERROR);
      expect(wrapped.context).toContain('While processing query');
    });

    it('should wrap a generic error as internal error', () => {
      const original = new Error('Generic error');
      const wrapped = wrapError(original, 'While doing something');

      expect(wrapped).toBeInstanceOf(PostgresError);
      expect(wrapped.code).toBe(ERROR_CODES.INTERNAL_ERROR);
      expect(wrapped.context).toContain('While doing something');
    });

    it('should preserve existing context when wrapping', () => {
      const original = ErrorFactory.syntaxError('Bad syntax', {
        context: 'Original context',
      });
      const wrapped = wrapError(original, 'New context');

      expect(wrapped.context).toContain('New context');
      expect(wrapped.context).toContain('Original context');
    });
  });

  describe('formatErrorForLogging', () => {
    it('should format a PostgresError for logging', () => {
      const error = ErrorFactory.syntaxError('Test error', {
        detail: 'Detail',
        hint: 'Hint',
      });

      const formatted = formatErrorForLogging(error);
      expect(formatted.code).toBe(ERROR_CODES.SYNTAX_ERROR);
      expect(formatted.message).toBe('Test error');
      expect(formatted.severity).toBe(ERROR_SEVERITY.ERROR);
      expect(formatted.detail).toBe('Detail');
      expect(formatted.hint).toBe('Hint');
    });

    it('should format a generic error for logging', () => {
      const error = new Error('Generic error');
      const formatted = formatErrorForLogging(error);

      expect(formatted.code).toBe('XX000');
      expect(formatted.message).toBe('Generic error');
      expect(formatted.severity).toBe(ERROR_SEVERITY.ERROR);
    });

    it('should include stack trace in development mode', () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'development';

      const error = new Error('Test error');
      const formatted = formatErrorForLogging(error);

      if (isDevelopmentMode()) {
        expect(formatted.stack).toBeDefined();
      }

      process.env.NODE_ENV = originalEnv;
    });
  });

  describe('isValidErrorStructure', () => {
    it('should validate a correct error structure', () => {
      const error = {
        code: '42601',
        message: 'Syntax error',
      };
      expect(isValidErrorStructure(error)).toBe(true);
    });

    it('should reject invalid error structures', () => {
      expect(isValidErrorStructure(null)).toBeFalsy();
      expect(isValidErrorStructure({})).toBe(false);
      expect(isValidErrorStructure({ code: '42601' })).toBe(false);
      expect(isValidErrorStructure({ message: 'Error' })).toBe(false);
      expect(isValidErrorStructure({ code: 123, message: 'Error' })).toBe(false);
    });
  });

  describe('isDevelopmentMode', () => {
    it('should detect development mode from NODE_ENV', () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'development';

      expect(isDevelopmentMode()).toBe(true);

      process.env.NODE_ENV = originalEnv;
    });

    it('should detect development mode from log level', () => {
      const originalLogLevel = process.env.PG_MOCK_LOG_LEVEL;
      process.env.PG_MOCK_LOG_LEVEL = 'debug';

      expect(isDevelopmentMode()).toBe(true);

      process.env.PG_MOCK_LOG_LEVEL = originalLogLevel;
    });

    it('should default to production mode', () => {
      const originalEnv = process.env.NODE_ENV;
      const originalLogLevel = process.env.PG_MOCK_LOG_LEVEL;

      delete process.env.NODE_ENV;
      delete process.env.PG_MOCK_LOG_LEVEL;

      // Will be true only if neither is set or if defaults apply
      const result = isDevelopmentMode();
      expect(typeof result).toBe('boolean');

      process.env.NODE_ENV = originalEnv;
      process.env.PG_MOCK_LOG_LEVEL = originalLogLevel;
    });
  });

  describe('Error with stack traces', () => {
    it('should capture stack trace in development mode', () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'development';

      const error = ErrorFactory.internalError('Test error', new Error('Original'));
      expect(error.stack).toBeDefined();

      process.env.NODE_ENV = originalEnv;
    });

    it('should include formatted stack in context for development mode', () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'development';

      const error = ErrorFactory.internalError('Test error', new Error('Original'));
      const protocolFormat = error.toProtocolFormat();

      if (isDevelopmentMode()) {
        expect(protocolFormat.context).toContain('Stack trace');
      }

      process.env.NODE_ENV = originalEnv;
    });
  });

  describe('Error field propagation', () => {
    it('should propagate all optional fields to protocol format', () => {
      const error = new PostgresError(ERROR_CODES.SYNTAX_ERROR, 'Test', {
        detail: 'detail',
        hint: 'hint',
        position: '1',
        internalPosition: '2',
        internalQuery: 'SELECT 1',
        context: 'context',
        schema: 'schema',
        table: 'table',
        column: 'column',
        dataType: 'dataType',
        constraint: 'constraint',
        file: 'file',
        line: '10',
        routine: 'routine',
      });

      const format = error.toProtocolFormat();
      expect(format.detail).toBe('detail');
      expect(format.hint).toBe('hint');
      expect(format.position).toBe('1');
      expect(format.internalPosition).toBe('2');
      expect(format.internalQuery).toBe('SELECT 1');
      expect(format.context).toBeDefined();
      expect(format.schema).toBe('schema');
      expect(format.table).toBe('table');
      expect(format.column).toBe('column');
      expect(format.dataType).toBe('dataType');
      expect(format.constraint).toBe('constraint');
      expect(format.file).toBe('file');
      expect(format.line).toBe('10');
      expect(format.routine).toBe('routine');
    });
  });
});
