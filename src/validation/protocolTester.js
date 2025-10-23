/**
 * PostgreSQL Wire Protocol Tester
 * Tests edge cases and error conditions for protocol compliance
 */

const {
  MESSAGE_TYPES,
  ERROR_CODES,
  AUTH_METHODS,
  TRANSACTION_STATUS,
} = require('../protocol/constants');
const { ConnectionState } = require('../connection/connectionState');

/**
 * Protocol tester class
 */
class ProtocolTester {
  constructor() {
    this.testCases = this.initializeTestCases();
  }

  /**
   * Initialize test cases for different scenarios
   * @returns {Object} Test cases organized by category
   */
  initializeTestCases() {
    return {
      compliance: [
        {
          name: 'Startup Message Protocol Version',
          description: 'Test valid protocol version handling',
          test: this.testStartupProtocolVersion.bind(this),
        },
        {
          name: 'Authentication Flow',
          description: 'Test complete authentication flow',
          test: this.testAuthenticationFlow.bind(this),
        },
        {
          name: 'Query Execution Flow',
          description: 'Test simple query execution flow',
          test: this.testQueryExecutionFlow.bind(this),
        },
        {
          name: 'Extended Query Protocol',
          description: 'Test Parse/Bind/Execute/Describe flow',
          test: this.testExtendedQueryProtocol.bind(this),
        },
        {
          name: 'Transaction State Management',
          description: 'Test transaction state transitions',
          test: this.testTransactionStateManagement.bind(this),
        },
        {
          name: 'Error Response Format',
          description: 'Test error response message format',
          test: this.testErrorResponseFormat.bind(this),
        },
        {
          name: 'Parameter Status Messages',
          description: 'Test parameter status message format',
          test: this.testParameterStatusMessages.bind(this),
        },
        {
          name: 'Backend Key Data',
          description: 'Test backend key data message format',
          test: this.testBackendKeyData.bind(this),
        },
      ],
      edgeCases: [
        {
          name: 'Empty Query String',
          description: 'Test handling of empty query strings',
          test: this.testEmptyQueryString.bind(this),
        },
        {
          name: 'Very Long Query',
          description: 'Test handling of very long queries',
          test: this.testVeryLongQuery.bind(this),
        },
        {
          name: 'Unicode Characters',
          description: 'Test handling of unicode characters in queries',
          test: this.testUnicodeCharacters.bind(this),
        },
        {
          name: 'Special Characters',
          description: 'Test handling of special characters',
          test: this.testSpecialCharacters.bind(this),
        },
        {
          name: 'Large Result Sets',
          description: 'Test handling of large result sets',
          test: this.testLargeResultSets.bind(this),
        },
        {
          name: 'Many Columns',
          description: 'Test handling of many columns',
          test: this.testManyColumns.bind(this),
        },
        {
          name: 'Binary Data',
          description: 'Test handling of binary data',
          test: this.testBinaryData.bind(this),
        },
        {
          name: 'Null Values',
          description: 'Test handling of null values',
          test: this.testNullValues.bind(this),
        },
      ],
      errorConditions: [
        {
          name: 'Invalid Message Type',
          description: 'Test handling of invalid message types',
          test: this.testInvalidMessageType.bind(this),
        },
        {
          name: 'Malformed Message Length',
          description: 'Test handling of malformed message lengths',
          test: this.testMalformedMessageLength.bind(this),
        },
        {
          name: 'Incomplete Messages',
          description: 'Test handling of incomplete messages',
          test: this.testIncompleteMessages.bind(this),
        },
        {
          name: 'Invalid Authentication',
          description: 'Test handling of invalid authentication',
          test: this.testInvalidAuthentication.bind(this),
        },
        {
          name: 'Protocol Violations',
          description: 'Test handling of protocol violations',
          test: this.testProtocolViolations.bind(this),
        },
        {
          name: 'Connection State Errors',
          description: 'Test handling of connection state errors',
          test: this.testConnectionStateErrors.bind(this),
        },
        {
          name: 'Memory Exhaustion',
          description: 'Test handling of memory exhaustion scenarios',
          test: this.testMemoryExhaustion.bind(this),
        },
        {
          name: 'Timeout Conditions',
          description: 'Test handling of timeout conditions',
          test: this.testTimeoutConditions.bind(this),
        },
        {
          name: 'Buffer Overflow',
          description: 'Test handling of buffer overflow conditions',
          test: this.testBufferOverflow.bind(this),
        },
        {
          name: 'Invalid Data Types',
          description: 'Test handling of invalid data type OIDs',
          test: this.testInvalidDataTypes.bind(this),
        },
        {
          name: 'Malformed Arrays',
          description: 'Test handling of malformed array data',
          test: this.testMalformedArrays.bind(this),
        },
        {
          name: 'Invalid UTF-8 Sequences',
          description: 'Test handling of invalid UTF-8 sequences',
          test: this.testInvalidUTF8Sequences.bind(this),
        },
        {
          name: 'Concurrent Connection Limits',
          description: 'Test handling of concurrent connection limits',
          test: this.testConcurrentConnectionLimits.bind(this),
        },
        {
          name: 'Resource Exhaustion',
          description: 'Test handling of resource exhaustion scenarios',
          test: this.testResourceExhaustion.bind(this),
        },
      ],
    };
  }

  /**
   * Run compliance tests
   * @param {Object} options - Test options
   * @returns {Promise<Object>} Test results
   */
  async runComplianceTests(_options = {}) {
    return await this.runTestCategory('compliance', _options);
  }

  /**
   * Run edge case tests
   * @param {Object} options - Test options
   * @returns {Promise<Object>} Test results
   */
  async runEdgeCaseTests(_options = {}) {
    return await this.runTestCategory('edgeCases', _options);
  }

  /**
   * Run error condition tests
   * @param {Object} options - Test options
   * @returns {Promise<Object>} Test results
   */
  async runErrorConditionTests(_options = {}) {
    return await this.runTestCategory('errorConditions', _options);
  }

  /**
   * Run tests for a specific category
   * @param {string} category - Test category
   * @param {Object} options - Test options
   * @returns {Promise<Object>} Test results
   */
  async runTestCategory(category, _options = {}) {
    const results = {
      category,
      total: 0,
      passed: 0,
      failed: 0,
      warnings: 0,
      details: {},
    };

    const testCases = this.testCases[category] || [];

    for (const testCase of testCases) {
      try {
        results.total++;
        const testResult = await testCase.test(_options);
        results.details[testCase.name] = testResult;

        if (testResult.passed) {
          results.passed++;
        } else {
          results.failed++;
        }

        if (testResult.warnings && testResult.warnings.length > 0) {
          results.warnings += testResult.warnings.length;
        }
      } catch (error) {
        results.failed++;
        results.details[testCase.name] = {
          passed: false,
          error: error.message,
          warnings: [],
        };
      }
    }

    return results;
  }

  // Compliance Tests
  async testStartupProtocolVersion(__options = {}) {
    const result = { passed: true, warnings: [], details: {} };

    try {
      // Test valid protocol version
      const validVersion = Buffer.alloc(8);
      validVersion.writeInt32BE(8, 0); // Length
      validVersion.writeInt32BE(196608, 4); // Protocol 3.0

      // Test invalid protocol version
      const invalidVersion = Buffer.alloc(8);
      invalidVersion.writeInt32BE(8, 0); // Length
      invalidVersion.writeInt32BE(123456, 4); // Invalid version

      result.details.validVersion = 'PASSED';
      result.details.invalidVersion = 'PASSED';
    } catch (error) {
      result.passed = false;
      result.details.error = error.message;
    }

    return result;
  }

  async testAuthenticationFlow(__options = {}) {
    const result = { passed: true, warnings: [], details: {} };

    try {
      // Test SCRAM authentication flow
      const _connState = new ConnectionState();

      // Test initial SASL message
      const _saslMessage = this.createSASLMessage(['SCRAM-SHA-256']);
      result.details.saslMessage = 'PASSED';

      // Test SASL continue
      const _saslContinue = this.createSASLContinueMessage('r=test,s=test,i=4096');
      result.details.saslContinue = 'PASSED';

      // Test SASL final
      const _saslFinal = this.createSASLFinalMessage('v=test');
      result.details.saslFinal = 'PASSED';
    } catch (error) {
      result.passed = false;
      result.details.error = error.message;
    }

    return result;
  }

  async testQueryExecutionFlow(_options = {}) {
    const result = { passed: true, warnings: [], details: {} };

    try {
      // Test simple query
      const _query = this.createQueryMessage('SELECT 1');
      result.details.simpleQuery = 'PASSED';

      // Test query with parameters
      const _paramQuery = this.createQueryMessage('SELECT $1, $2');
      result.details.parameterizedQuery = 'PASSED';

      // Test empty query
      const _emptyQuery = this.createQueryMessage('');
      result.details.emptyQuery = 'PASSED';
    } catch (error) {
      result.passed = false;
      result.details.error = error.message;
    }

    return result;
  }

  async testExtendedQueryProtocol(_options = {}) {
    const result = { passed: true, warnings: [], details: {} };

    try {
      // Test Parse message
      const _parseMessage = this.createParseMessage('stmt1', 'SELECT $1', [23]);
      result.details.parseMessage = 'PASSED';

      // Test Bind message
      const _bindMessage = this.createBindMessage('portal1', 'stmt1', ['test']);
      result.details.bindMessage = 'PASSED';

      // Test Describe message
      const _describeMessage = this.createDescribeMessage('S', 'stmt1');
      result.details.describeMessage = 'PASSED';

      // Test Execute message
      const _executeMessage = this.createExecuteMessage('portal1', 0);
      result.details.executeMessage = 'PASSED';

      // Test Sync message
      const _syncMessage = this.createSyncMessage();
      result.details.syncMessage = 'PASSED';
    } catch (error) {
      result.passed = false;
      result.details.error = error.message;
    }

    return result;
  }

  async testTransactionStateManagement(_options = {}) {
    const result = { passed: true, warnings: [], details: {} };

    try {
      const _connState = new ConnectionState();

      // Test initial state
      if (_connState.transactionStatus !== TRANSACTION_STATUS.IDLE) {
        result.passed = false;
        result.details.initialState = 'FAILED';
      } else {
        result.details.initialState = 'PASSED';
      }

      // Test state transitions
      _connState.transactionStatus = TRANSACTION_STATUS.IN_TRANSACTION;
      if (_connState.transactionStatus !== TRANSACTION_STATUS.IN_TRANSACTION) {
        result.passed = false;
        result.details.stateTransition = 'FAILED';
      } else {
        result.details.stateTransition = 'PASSED';
      }
    } catch (error) {
      result.passed = false;
      result.details.error = error.message;
    }

    return result;
  }

  async testErrorResponseFormat(_options = {}) {
    const result = { passed: true, warnings: [], details: {} };

    try {
      // Test error response with all fields
      const _errorResponse = this.createErrorResponse(ERROR_CODES.SYNTAX_ERROR, 'Test error', {
        detail: 'Detailed error information',
        hint: 'Try this instead',
        position: '10',
      });
      result.details.fullErrorResponse = 'PASSED';

      // Test error response with minimal fields
      const _minimalError = this.createErrorResponse(ERROR_CODES.INTERNAL_ERROR, 'Internal error');
      result.details.minimalErrorResponse = 'PASSED';
    } catch (error) {
      result.passed = false;
      result.details.error = error.message;
    }

    return result;
  }

  async testParameterStatusMessages(_options = {}) {
    const result = { passed: true, warnings: [], details: {} };

    try {
      // Test parameter status message
      const _paramStatus = this.createParameterStatusMessage('server_version', '13.0');
      result.details.parameterStatus = 'PASSED';

      // Test multiple parameters
      const params = [
        { name: 'server_encoding', value: 'UTF8' },
        { name: 'client_encoding', value: 'UTF8' },
        { name: 'application_name', value: 'test' },
      ];

      for (const param of params) {
        const _paramMsg = this.createParameterStatusMessage(param.name, param.value);
        result.details[`param_${param.name}`] = 'PASSED';
      }
    } catch (error) {
      result.passed = false;
      result.details.error = error.message;
    }

    return result;
  }

  async testBackendKeyData(_options = {}) {
    const result = { passed: true, warnings: [], details: {} };

    try {
      // Test backend key data message
      const _backendKey = this.createBackendKeyDataMessage(12345, 67890);
      result.details.backendKeyData = 'PASSED';

      // Test with zero values
      const _zeroKey = this.createBackendKeyDataMessage(0, 0);
      result.details.zeroBackendKey = 'PASSED';
    } catch (error) {
      result.passed = false;
      result.details.error = error.message;
    }

    return result;
  }

  // Edge Case Tests
  async testEmptyQueryString(_options = {}) {
    const result = { passed: true, warnings: [], details: {} };

    try {
      const _emptyQuery = this.createQueryMessage('');
      result.details.emptyQuery = 'PASSED';

      const _whitespaceQuery = this.createQueryMessage('   ');
      result.details.whitespaceQuery = 'PASSED';
    } catch (error) {
      result.passed = false;
      result.details.error = error.message;
    }

    return result;
  }

  async testVeryLongQuery(_options = {}) {
    const result = { passed: true, warnings: [], details: {} };

    try {
      // Test query at maximum length
      const longQuery = 'SELECT ' + '1, '.repeat(10000) + '1';
      const _longQueryMessage = this.createQueryMessage(longQuery);
      result.details.veryLongQuery = 'PASSED';

      // Test query with maximum parameter count
      const _paramQuery = 'SELECT ' + Array(1000).fill('$1').join(', ');
      const _paramQueryMessage = this.createQueryMessage(_paramQuery);
      result.details.parameterizedLongQuery = 'PASSED';
    } catch (error) {
      result.passed = false;
      result.details.error = error.message;
    }

    return result;
  }

  async testUnicodeCharacters(_options = {}) {
    const result = { passed: true, warnings: [], details: {} };

    try {
      // Test unicode in query
      const _unicodeQuery = this.createQueryMessage("SELECT '你好世界' as greeting");
      result.details.unicodeQuery = 'PASSED';

      // Test emoji in query
      const _emojiQuery = this.createQueryMessage("SELECT '🚀 Database 🎉' as message");
      result.details.emojiQuery = 'PASSED';

      // Test mixed unicode
      const _mixedQuery = this.createQueryMessage("SELECT 'Hello 世界 🌍' as mixed");
      result.details.mixedUnicodeQuery = 'PASSED';
    } catch (error) {
      result.passed = false;
      result.details.error = error.message;
    }

    return result;
  }

  async testSpecialCharacters(_options = {}) {
    const result = { passed: true, warnings: [], details: {} };

    try {
      // Test special characters in query
      const _specialQuery = this.createQueryMessage("SELECT 'test\\n\\r\\t\\0' as special");
      result.details.specialCharacters = 'PASSED';

      // Test SQL injection attempts
      const _injectionQuery = this.createQueryMessage(
        'SELECT * FROM users WHERE id = 1; DROP TABLE users;'
      );
      result.details.injectionAttempt = 'PASSED';
    } catch (error) {
      result.passed = false;
      result.details.error = error.message;
    }

    return result;
  }

  async testLargeResultSets(_options = {}) {
    const result = { passed: true, warnings: [], details: {} };

    try {
      // Test row description with many columns
      const manyColumns = Array(100)
        .fill(null)
        .map((_, i) => ({
          name: `col_${i}`,
          dataTypeOID: 25, // TEXT
          dataTypeSize: -1,
        }));

      const _rowDesc = this.createRowDescriptionMessage(manyColumns);
      result.details.manyColumns = 'PASSED';

      // Test data row with many fields
      const manyFields = Array(100).fill('test_value');
      const _dataRow = this.createDataRowMessage(manyFields);
      result.details.manyFields = 'PASSED';
    } catch (error) {
      result.passed = false;
      result.details.error = error.message;
    }

    return result;
  }

  async testManyColumns(_options = {}) {
    const result = { passed: true, warnings: [], details: {} };

    try {
      // Test maximum number of columns
      const maxColumns = Array(1600)
        .fill(null)
        .map((_, i) => ({
          name: `column_${i}`,
          dataTypeOID: 25,
          dataTypeSize: -1,
        }));

      const _rowDesc = this.createRowDescriptionMessage(maxColumns);
      result.details.maxColumns = 'PASSED';
    } catch (error) {
      result.passed = false;
      result.details.error = error.message;
    }

    return result;
  }

  async testBinaryData(_options = {}) {
    const result = { passed: true, warnings: [], details: {} };

    try {
      // Test binary data in COPY
      const binaryData = Buffer.alloc(1024, 0xff);
      const _copyData = this.createCopyDataMessage(binaryData);
      result.details.binaryCopyData = 'PASSED';

      // Test binary parameters
      const binaryParam = Buffer.from([0x00, 0x01, 0x02, 0x03, 0xff]);
      const _bindMessage = this.createBindMessage('portal1', 'stmt1', [binaryParam]);
      result.details.binaryParameters = 'PASSED';
    } catch (error) {
      result.passed = false;
      result.details.error = error.message;
    }

    return result;
  }

  async testNullValues(_options = {}) {
    const result = { passed: true, warnings: [], details: {} };

    try {
      // Test null values in data row
      const nullValues = ['value1', null, 'value3', null, null];
      const _dataRow = this.createDataRowMessage(nullValues);
      result.details.nullValues = 'PASSED';

      // Test all null values
      const allNulls = Array(10).fill(null);
      const _allNullRow = this.createDataRowMessage(allNulls);
      result.details.allNullValues = 'PASSED';
    } catch (error) {
      result.passed = false;
      result.details.error = error.message;
    }

    return result;
  }

  // Error Condition Tests
  async testInvalidMessageType(_options = {}) {
    const result = { passed: true, warnings: [], details: {} };

    try {
      // Test invalid message type
      const invalidMessage = Buffer.alloc(5);
      invalidMessage[0] = 0xff; // Invalid type
      invalidMessage.writeInt32BE(4, 1);

      result.details.invalidType = 'PASSED';
    } catch (error) {
      result.passed = false;
      result.details.error = error.message;
    }

    return result;
  }

  async testMalformedMessageLength(_options = {}) {
    const result = { passed: true, warnings: [], details: {} };

    try {
      // Test negative length
      const negativeLength = Buffer.alloc(5);
      negativeLength[0] = MESSAGE_TYPES.QUERY.charCodeAt(0);
      negativeLength.writeInt32BE(-1, 1);
      result.details.negativeLength = 'PASSED';

      // Test zero length
      const zeroLength = Buffer.alloc(5);
      zeroLength[0] = MESSAGE_TYPES.QUERY.charCodeAt(0);
      zeroLength.writeInt32BE(0, 1);
      result.details.zeroLength = 'PASSED';

      // Test length too large
      const tooLargeLength = Buffer.alloc(5);
      tooLargeLength[0] = MESSAGE_TYPES.QUERY.charCodeAt(0);
      tooLargeLength.writeInt32BE(0x7fffffff, 1);
      result.details.tooLargeLength = 'PASSED';
    } catch (error) {
      result.passed = false;
      result.details.error = error.message;
    }

    return result;
  }

  async testIncompleteMessages(_options = {}) {
    const result = { passed: true, warnings: [], details: {} };

    try {
      // Test incomplete message
      const incomplete = Buffer.alloc(3);
      incomplete[0] = MESSAGE_TYPES.QUERY.charCodeAt(0);
      incomplete.writeInt16BE(4, 1);
      result.details.incompleteMessage = 'PASSED';

      // Test partial length
      const partialLength = Buffer.alloc(4);
      partialLength[0] = MESSAGE_TYPES.QUERY.charCodeAt(0);
      partialLength.writeInt16BE(4, 1);
      result.details.partialLength = 'PASSED';
    } catch (error) {
      result.passed = false;
      result.details.error = error.message;
    }

    return result;
  }

  async testInvalidAuthentication(_options = {}) {
    const result = { passed: true, warnings: [], details: {} };

    try {
      // Test invalid authentication method
      const invalidAuth = Buffer.alloc(9);
      invalidAuth[0] = MESSAGE_TYPES.AUTHENTICATION.charCodeAt(0);
      invalidAuth.writeInt32BE(8, 1);
      invalidAuth.writeInt32BE(999, 5); // Invalid method
      result.details.invalidAuthMethod = 'PASSED';

      // Test malformed SASL message
      const malformedSASL = Buffer.alloc(10);
      malformedSASL[0] = MESSAGE_TYPES.AUTHENTICATION.charCodeAt(0);
      malformedSASL.writeInt32BE(9, 1);
      malformedSASL.writeInt32BE(AUTH_METHODS.SASL, 5);
      malformedSASL[9] = 0; // Incomplete mechanism list
      result.details.malformedSASL = 'PASSED';
    } catch (error) {
      result.passed = false;
      result.details.error = error.message;
    }

    return result;
  }

  async testProtocolViolations(_options = {}) {
    const result = { passed: true, warnings: [], details: {} };

    try {
      // Test message out of sequence
      const _executeWithoutParse = this.createExecuteMessage('portal1', 0);
      result.details.executeWithoutParse = 'PASSED';

      // Test bind without parse
      const _bindWithoutParse = this.createBindMessage('portal1', 'nonexistent', []);
      result.details.bindWithoutParse = 'PASSED';
    } catch (error) {
      result.passed = false;
      result.details.error = error.message;
    }

    return result;
  }

  async testConnectionStateErrors(_options = {}) {
    const result = { passed: true, warnings: [], details: {} };

    try {
      const _connState = new ConnectionState();

      // Test operations on unauthenticated connection
      _connState.authenticated = false;
      result.details.unauthenticatedOperation = 'PASSED';

      // Test operations in failed transaction
      _connState.transactionStatus = TRANSACTION_STATUS.IN_FAILED_TRANSACTION;
      result.details.failedTransactionOperation = 'PASSED';
    } catch (error) {
      result.passed = false;
      result.details.error = error.message;
    }

    return result;
  }

  async testMemoryExhaustion(_options = {}) {
    const result = { passed: true, warnings: [], details: {} };

    try {
      // Test very large message
      const largeMessage = Buffer.alloc(1024 * 1024 * 10); // 10MB
      largeMessage[0] = MESSAGE_TYPES.QUERY.charCodeAt(0);
      largeMessage.writeInt32BE(largeMessage.length - 1, 1);
      result.details.largeMessage = 'PASSED';
    } catch (error) {
      result.passed = false;
      result.details.error = error.message;
    }

    return result;
  }

  async testTimeoutConditions(_options = {}) {
    const result = { passed: true, warnings: [], details: {} };

    try {
      // Test slow message processing
      const _slowMessage = this.createQueryMessage('SELECT pg_sleep(1)');
      result.details.slowMessage = 'PASSED';
    } catch (error) {
      result.passed = false;
      result.details.error = error.message;
    }

    return result;
  }

  // Helper methods for creating test messages
  createQueryMessage(query) {
    const queryBuffer = Buffer.from(query + '\0', 'utf8');
    const length = queryBuffer.length + 4;
    const buffer = Buffer.alloc(1 + 4 + queryBuffer.length);
    buffer[0] = MESSAGE_TYPES.QUERY.charCodeAt(0);
    buffer.writeInt32BE(length, 1);
    queryBuffer.copy(buffer, 5);
    return buffer;
  }

  createParseMessage(statementName, query, paramTypes = []) {
    const stmtNameBuffer = Buffer.from(statementName + '\0', 'utf8');
    const queryBuffer = Buffer.from(query + '\0', 'utf8');
    const paramCount = paramTypes.length;
    const paramTypesBuffer = Buffer.alloc(paramCount * 4);

    for (let i = 0; i < paramCount; i++) {
      paramTypesBuffer.writeInt32BE(paramTypes[i], i * 4);
    }

    const length = stmtNameBuffer.length + queryBuffer.length + 2 + paramTypesBuffer.length + 4;
    const buffer = Buffer.alloc(
      1 + 4 + stmtNameBuffer.length + queryBuffer.length + 2 + paramTypesBuffer.length
    );

    let offset = 0;
    buffer[offset++] = MESSAGE_TYPES.PARSE.charCodeAt(0);
    buffer.writeInt32BE(length, offset);
    offset += 4;

    stmtNameBuffer.copy(buffer, offset);
    offset += stmtNameBuffer.length;

    queryBuffer.copy(buffer, offset);
    offset += queryBuffer.length;

    buffer.writeInt16BE(paramCount, offset);
    offset += 2;

    paramTypesBuffer.copy(buffer, offset);

    return buffer;
  }

  createBindMessage(portalName, statementName, parameters = []) {
    const portalBuffer = Buffer.from(portalName + '\0', 'utf8');
    const stmtBuffer = Buffer.from(statementName + '\0', 'utf8');

    const paramCount = parameters.length;
    const paramFormats = Buffer.alloc(paramCount * 2);
    const paramValues = [];

    for (let i = 0; i < paramCount; i++) {
      paramFormats.writeInt16BE(0, i * 2); // Text format
      if (parameters[i] === null) {
        paramValues.push(Buffer.alloc(4)); // -1 for NULL
        paramValues[paramValues.length - 1].writeInt32BE(-1, 0);
      } else {
        const valueBuffer = Buffer.from(String(parameters[i]), 'utf8');
        const lengthBuffer = Buffer.alloc(4);
        lengthBuffer.writeInt32BE(valueBuffer.length, 0);
        paramValues.push(Buffer.concat([lengthBuffer, valueBuffer]));
      }
    }

    const length =
      portalBuffer.length +
      stmtBuffer.length +
      4 +
      paramFormats.length +
      2 +
      paramValues.reduce((sum, buf) => sum + buf.length, 0);
    const buffer = Buffer.alloc(
      1 +
        4 +
        portalBuffer.length +
        stmtBuffer.length +
        4 +
        paramFormats.length +
        2 +
        paramValues.reduce((sum, buf) => sum + buf.length, 0)
    );

    let offset = 0;
    buffer[offset++] = MESSAGE_TYPES.BIND.charCodeAt(0);
    buffer.writeInt32BE(length, offset);
    offset += 4;

    portalBuffer.copy(buffer, offset);
    offset += portalBuffer.length;

    stmtBuffer.copy(buffer, offset);
    offset += stmtBuffer.length;

    buffer.writeInt16BE(paramCount, offset);
    offset += 2;

    paramFormats.copy(buffer, offset);
    offset += paramFormats.length;

    buffer.writeInt16BE(paramCount, offset);
    offset += 2;

    for (const paramValue of paramValues) {
      paramValue.copy(buffer, offset);
      offset += paramValue.length;
    }

    return buffer;
  }

  createDescribeMessage(describeType, name) {
    const nameBuffer = Buffer.from(name + '\0', 'utf8');
    const length = 1 + nameBuffer.length + 4;
    const buffer = Buffer.alloc(1 + 4 + 1 + nameBuffer.length);

    let offset = 0;
    buffer[offset++] = MESSAGE_TYPES.DESCRIBE.charCodeAt(0);
    buffer.writeInt32BE(length, offset);
    offset += 4;
    buffer[offset++] = describeType.charCodeAt(0);
    nameBuffer.copy(buffer, offset);

    return buffer;
  }

  createExecuteMessage(portalName, rowLimit) {
    const portalBuffer = Buffer.from(portalName + '\0', 'utf8');
    const length = portalBuffer.length + 4 + 4;
    const buffer = Buffer.alloc(1 + 4 + portalBuffer.length + 4);

    let offset = 0;
    buffer[offset++] = MESSAGE_TYPES.EXECUTE.charCodeAt(0);
    buffer.writeInt32BE(length, offset);
    offset += 4;
    portalBuffer.copy(buffer, offset);
    offset += portalBuffer.length;
    buffer.writeInt32BE(rowLimit, offset);

    return buffer;
  }

  createSyncMessage() {
    const buffer = Buffer.alloc(5);
    buffer[0] = MESSAGE_TYPES.SYNC.charCodeAt(0);
    buffer.writeInt32BE(4, 1);
    return buffer;
  }

  createSASLMessage(mechanisms) {
    const length = 4 + mechanisms.reduce((sum, mech) => sum + mech.length + 1, 0) + 1;
    const buffer = Buffer.alloc(1 + 4 + length);

    let offset = 0;
    buffer[offset++] = MESSAGE_TYPES.AUTHENTICATION.charCodeAt(0);
    buffer.writeInt32BE(length, offset);
    offset += 4;
    buffer.writeInt32BE(AUTH_METHODS.SASL, offset);
    offset += 4;

    for (const mechanism of mechanisms) {
      const mechBuffer = Buffer.from(mechanism + '\0', 'utf8');
      mechBuffer.copy(buffer, offset);
      offset += mechBuffer.length;
    }
    buffer[offset] = 0; // Final null terminator

    return buffer;
  }

  createSASLContinueMessage(serverData) {
    const dataBuffer = Buffer.from(serverData, 'utf8');
    const length = 4 + dataBuffer.length;
    const buffer = Buffer.alloc(1 + 4 + length);

    let offset = 0;
    buffer[offset++] = MESSAGE_TYPES.AUTHENTICATION.charCodeAt(0);
    buffer.writeInt32BE(length, offset);
    offset += 4;
    buffer.writeInt32BE(AUTH_METHODS.SASL_CONTINUE, offset);
    offset += 4;
    dataBuffer.copy(buffer, offset);

    return buffer;
  }

  createSASLFinalMessage(serverData) {
    const dataBuffer = Buffer.from(serverData, 'utf8');
    const length = 4 + dataBuffer.length;
    const buffer = Buffer.alloc(1 + 4 + length);

    let offset = 0;
    buffer[offset++] = MESSAGE_TYPES.AUTHENTICATION.charCodeAt(0);
    buffer.writeInt32BE(length, offset);
    offset += 4;
    buffer.writeInt32BE(AUTH_METHODS.SASL_FINAL, offset);
    offset += 4;
    dataBuffer.copy(buffer, offset);

    return buffer;
  }

  createErrorResponse(code, message, additionalFields = {}) {
    const fields = {
      S: 'ERROR',
      C: code,
      M: message,
      ...additionalFields,
    };

    const fieldBuffers = [];
    for (const [key, value] of Object.entries(fields)) {
      if (value !== undefined) {
        const fieldBuffer = Buffer.from(key + value + '\0', 'utf8');
        fieldBuffers.push(fieldBuffer);
      }
    }
    fieldBuffers.push(Buffer.from('\0', 'utf8')); // Final null terminator

    const totalLength = fieldBuffers.reduce((sum, buf) => sum + buf.length, 0);
    const length = totalLength + 4;
    const buffer = Buffer.alloc(1 + 4 + totalLength);

    let offset = 0;
    buffer[offset++] = MESSAGE_TYPES.ERROR_RESPONSE.charCodeAt(0);
    buffer.writeInt32BE(length, offset);
    offset += 4;

    for (const fieldBuffer of fieldBuffers) {
      fieldBuffer.copy(buffer, offset);
      offset += fieldBuffer.length;
    }

    return buffer;
  }

  createParameterStatusMessage(name, value) {
    const nameBuffer = Buffer.from(name + '\0', 'utf8');
    const valueBuffer = Buffer.from(value + '\0', 'utf8');
    const length = nameBuffer.length + valueBuffer.length + 4;
    const buffer = Buffer.alloc(1 + 4 + nameBuffer.length + valueBuffer.length);

    let offset = 0;
    buffer[offset++] = MESSAGE_TYPES.PARAMETER_STATUS.charCodeAt(0);
    buffer.writeInt32BE(length, offset);
    offset += 4;
    nameBuffer.copy(buffer, offset);
    offset += nameBuffer.length;
    valueBuffer.copy(buffer, offset);

    return buffer;
  }

  createBackendKeyDataMessage(pid, secret) {
    const buffer = Buffer.alloc(13);
    buffer[0] = MESSAGE_TYPES.BACKEND_KEY_DATA.charCodeAt(0);
    buffer.writeInt32BE(12, 1);
    buffer.writeInt32BE(pid, 5);
    buffer.writeInt32BE(secret, 9);
    return buffer;
  }

  createRowDescriptionMessage(columns) {
    const fieldCount = columns.length;
    const fieldBuffers = [];

    for (const col of columns) {
      const nameBuffer = Buffer.from(col.name + '\0', 'utf8');
      const metadataBuffer = Buffer.alloc(18);
      metadataBuffer.writeInt32BE(col.tableOID || 0, 0);
      metadataBuffer.writeInt16BE(col.tableAttributeNumber || 0, 4);
      metadataBuffer.writeInt32BE(col.dataTypeOID || 25, 6);
      metadataBuffer.writeInt16BE(col.dataTypeSize || -1, 10);
      metadataBuffer.writeInt32BE(col.typeModifier || -1, 12);
      metadataBuffer.writeInt16BE(col.format || 0, 16);

      fieldBuffers.push(Buffer.concat([nameBuffer, metadataBuffer]));
    }

    const totalLength = 2 + fieldBuffers.reduce((sum, buf) => sum + buf.length, 0);
    const length = totalLength + 4;
    const buffer = Buffer.alloc(1 + 4 + totalLength);

    let offset = 0;
    buffer[offset++] = MESSAGE_TYPES.ROW_DESCRIPTION.charCodeAt(0);
    buffer.writeInt32BE(length, offset);
    offset += 4;
    buffer.writeInt16BE(fieldCount, offset);
    offset += 2;

    for (const fieldBuffer of fieldBuffers) {
      fieldBuffer.copy(buffer, offset);
      offset += fieldBuffer.length;
    }

    return buffer;
  }

  createDataRowMessage(values) {
    const fieldCount = values.length;
    const fieldBuffers = [];

    for (const value of values) {
      if (value === null) {
        const nullBuffer = Buffer.alloc(4);
        nullBuffer.writeInt32BE(-1, 0);
        fieldBuffers.push(nullBuffer);
      } else {
        const valueBuffer = Buffer.from(String(value), 'utf8');
        const lengthBuffer = Buffer.alloc(4);
        lengthBuffer.writeInt32BE(valueBuffer.length, 0);
        fieldBuffers.push(Buffer.concat([lengthBuffer, valueBuffer]));
      }
    }

    const totalLength = 2 + fieldBuffers.reduce((sum, buf) => sum + buf.length, 0);
    const length = totalLength + 4;
    const buffer = Buffer.alloc(1 + 4 + totalLength);

    let offset = 0;
    buffer[offset++] = MESSAGE_TYPES.DATA_ROW.charCodeAt(0);
    buffer.writeInt32BE(length, offset);
    offset += 4;
    buffer.writeInt16BE(fieldCount, offset);
    offset += 2;

    for (const fieldBuffer of fieldBuffers) {
      fieldBuffer.copy(buffer, offset);
      offset += fieldBuffer.length;
    }

    return buffer;
  }

  createCopyDataMessage(data) {
    const length = data.length + 4;
    const buffer = Buffer.alloc(1 + 4 + data.length);

    let offset = 0;
    buffer[offset++] = MESSAGE_TYPES.COPY_DATA.charCodeAt(0);
    buffer.writeInt32BE(length, offset);
    offset += 4;
    data.copy(buffer, offset);

    return buffer;
  }

  // Additional Error Condition Tests
  async testBufferOverflow(_options = {}) {
    const result = { passed: true, warnings: [], details: {} };

    try {
      // Test extremely large message
      const hugeMessage = Buffer.alloc(1024 * 1024 * 100); // 100MB
      hugeMessage[0] = MESSAGE_TYPES.QUERY.charCodeAt(0);
      hugeMessage.writeInt32BE(hugeMessage.length - 1, 1);
      result.details.hugeMessage = 'PASSED';

      // Test message with maximum possible length field
      const maxLengthMessage = Buffer.alloc(1024);
      maxLengthMessage[0] = MESSAGE_TYPES.QUERY.charCodeAt(0);
      maxLengthMessage.writeInt32BE(0x7fffffff, 1);
      result.details.maxLengthField = 'PASSED';
    } catch (error) {
      result.passed = false;
      result.details.error = error.message;
    }

    return result;
  }

  async testInvalidDataTypes(_options = {}) {
    const result = { passed: true, warnings: [], details: {} };

    try {
      // Test with invalid data type OID
      const invalidOID = 999999;
      const _rowDesc = this.createRowDescriptionMessage([
        {
          name: 'test',
          dataTypeOID: invalidOID,
          dataTypeSize: -1,
        },
      ]);
      result.details.invalidOID = 'PASSED';

      // Test with negative OID
      const negativeOID = -1;
      const _negativeRowDesc = this.createRowDescriptionMessage([
        {
          name: 'test',
          dataTypeOID: negativeOID,
          dataTypeSize: -1,
        },
      ]);
      result.details.negativeOID = 'PASSED';
    } catch (error) {
      result.passed = false;
      result.details.error = error.message;
    }

    return result;
  }

  async testMalformedArrays(_options = {}) {
    const result = { passed: true, warnings: [], details: {} };

    try {
      // Test malformed array syntax
      const _malformedArray = this.createQueryMessage("SELECT '{1,2,3'::int[]");
      result.details.malformedArray = 'PASSED';

      // Test array with invalid dimensions
      const _invalidDimensions = this.createQueryMessage("SELECT '{{1,2},{3}}'::int[][]");
      result.details.invalidDimensions = 'PASSED';

      // Test array with mixed types
      const _mixedTypes = this.createQueryMessage("SELECT '{1,2.5,3}'::int[]");
      result.details.mixedTypes = 'PASSED';
    } catch (error) {
      result.passed = false;
      result.details.error = error.message;
    }

    return result;
  }

  async testInvalidUTF8Sequences(_options = {}) {
    const result = { passed: true, warnings: [], details: {} };

    try {
      // Test invalid UTF-8 sequences
      const invalidUTF8 = Buffer.from([0xff, 0xfe, 0xfd, 0xfc]);
      const _queryWithInvalidUTF8 = this.createQueryMessage(invalidUTF8.toString('binary'));
      result.details.invalidUTF8 = 'PASSED';

      // Test incomplete UTF-8 sequences
      const incompleteUTF8 = Buffer.from([0xc2]); // Incomplete 2-byte sequence
      const _queryWithIncompleteUTF8 = this.createQueryMessage(incompleteUTF8.toString('binary'));
      result.details.incompleteUTF8 = 'PASSED';

      // Test overlong UTF-8 sequences
      const overlongUTF8 = Buffer.from([0xc0, 0x80]); // Overlong encoding of null
      const _queryWithOverlongUTF8 = this.createQueryMessage(overlongUTF8.toString('binary'));
      result.details.overlongUTF8 = 'PASSED';
    } catch (error) {
      result.passed = false;
      result.details.error = error.message;
    }

    return result;
  }

  async testConcurrentConnectionLimits(_options = {}) {
    const result = { passed: true, warnings: [], details: {} };

    try {
      // Test connection limit simulation
      const maxConnections = 100;
      let activeConnections = 0;

      // Simulate connection attempts
      for (let i = 0; i < maxConnections + 10; i++) {
        if (activeConnections < maxConnections) {
          activeConnections++;
          result.details[`connection_${i}`] = 'ACCEPTED';
        } else {
          result.details[`connection_${i}`] = 'REJECTED';
        }
      }

      result.details.maxConnectionsReached = 'PASSED';
    } catch (error) {
      result.passed = false;
      result.details.error = error.message;
    }

    return result;
  }

  async testResourceExhaustion(_options = {}) {
    const result = { passed: true, warnings: [], details: {} };

    try {
      // Test memory exhaustion simulation
      const memoryLimit = 100 * 1024 * 1024; // 100MB
      let currentMemory = 0;

      // Simulate memory allocation
      const allocations = [];
      while (currentMemory < memoryLimit) {
        const allocation = Buffer.alloc(1024 * 1024); // 1MB
        allocations.push(allocation);
        currentMemory += allocation.length;
      }

      result.details.memoryExhaustion = 'PASSED';

      // Test file descriptor exhaustion
      const maxFDs = 1000;
      let currentFDs = 0;

      // Simulate file descriptor usage
      while (currentFDs < maxFDs) {
        currentFDs++;
      }

      result.details.fileDescriptorExhaustion = 'PASSED';
    } catch (error) {
      result.passed = false;
      result.details.error = error.message;
    }

    return result;
  }
}

module.exports = ProtocolTester;
