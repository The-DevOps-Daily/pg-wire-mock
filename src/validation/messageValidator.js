/**
 * PostgreSQL Wire Protocol Message Validator
 * Validates message formats against PostgreSQL specifications
 */

const { MESSAGE_TYPES, DATA_TYPES, ERROR_CODES, AUTH_METHODS } = require('../protocol/constants');

/**
 * Message format validator class
 */
class MessageValidator {
  constructor() {
    this.validationRules = this.initializeValidationRules();
  }

  /**
   * Initialize validation rules for all message types
   * @returns {Object} Validation rules
   */
  initializeValidationRules() {
    return {
      // Frontend messages
      [MESSAGE_TYPES.QUERY]: {
        minLength: 5, // type + length + null terminator
        maxLength: 1024 * 1024, // 1MB max query
        requiredFields: ['type', 'length'],
        optionalFields: ['query'],
        validation: this.validateQueryMessage.bind(this)
      },
      [MESSAGE_TYPES.PARSE]: {
        minLength: 5,
        maxLength: 1024 * 1024,
        requiredFields: ['type', 'length', 'statementName', 'query'],
        optionalFields: ['parameterCount', 'parameterTypes'],
        validation: this.validateParseMessage.bind(this)
      },
      [MESSAGE_TYPES.BIND]: {
        minLength: 5,
        maxLength: 1024 * 1024,
        requiredFields: ['type', 'length', 'portalName', 'statementName'],
        optionalFields: ['parameterFormats', 'parameters'],
        validation: this.validateBindMessage.bind(this)
      },
      [MESSAGE_TYPES.DESCRIBE]: {
        minLength: 6, // type + length + describe type
        maxLength: 1024,
        requiredFields: ['type', 'length', 'describeType', 'name'],
        validation: this.validateDescribeMessage.bind(this)
      },
      [MESSAGE_TYPES.EXECUTE]: {
        minLength: 5,
        maxLength: 1024,
        requiredFields: ['type', 'length', 'portalName'],
        optionalFields: ['rowLimit'],
        validation: this.validateExecuteMessage.bind(this)
      },
      [MESSAGE_TYPES.SYNC]: {
        minLength: 5,
        maxLength: 5,
        requiredFields: ['type', 'length'],
        validation: this.validateSyncMessage.bind(this)
      },
      [MESSAGE_TYPES.TERMINATE]: {
        minLength: 5,
        maxLength: 5,
        requiredFields: ['type', 'length'],
        validation: this.validateTerminateMessage.bind(this)
      },
      [MESSAGE_TYPES.PASSWORD_MESSAGE]: {
        minLength: 5,
        maxLength: 1024,
        requiredFields: ['type', 'length'],
        optionalFields: ['password', 'saslData'],
        validation: this.validatePasswordMessage.bind(this)
      },
      [MESSAGE_TYPES.COPY_DATA]: {
        minLength: 5,
        maxLength: 1024 * 1024,
        requiredFields: ['type', 'length'],
        optionalFields: ['data'],
        validation: this.validateCopyDataMessage.bind(this)
      },
      [MESSAGE_TYPES.COPY_DONE]: {
        minLength: 5,
        maxLength: 5,
        requiredFields: ['type', 'length'],
        validation: this.validateCopyDoneMessage.bind(this)
      },
      [MESSAGE_TYPES.COPY_FAIL]: {
        minLength: 5,
        maxLength: 1024,
        requiredFields: ['type', 'length'],
        optionalFields: ['errorMessage'],
        validation: this.validateCopyFailMessage.bind(this)
      },
      [MESSAGE_TYPES.FUNCTION_CALL]: {
        minLength: 5,
        maxLength: 1024 * 1024,
        requiredFields: ['type', 'length'],
        optionalFields: ['functionOID', 'arguments'],
        validation: this.validateFunctionCallMessage.bind(this)
      },

      // Backend messages
      [MESSAGE_TYPES.AUTHENTICATION]: {
        minLength: 5,
        maxLength: 1024,
        requiredFields: ['type', 'length', 'authMethod'],
        optionalFields: ['salt', 'serverData', 'mechanisms'],
        validation: this.validateAuthenticationMessage.bind(this)
      },
      [MESSAGE_TYPES.BACKEND_KEY_DATA]: {
        minLength: 13, // type + length + pid + secret
        maxLength: 13,
        requiredFields: ['type', 'length', 'pid', 'secret'],
        validation: this.validateBackendKeyDataMessage.bind(this)
      },
      [MESSAGE_TYPES.PARAMETER_STATUS]: {
        minLength: 5,
        maxLength: 1024,
        requiredFields: ['type', 'length', 'name', 'value'],
        validation: this.validateParameterStatusMessage.bind(this)
      },
      [MESSAGE_TYPES.READY_FOR_QUERY]: {
        minLength: 6, // type + length + status
        maxLength: 6,
        requiredFields: ['type', 'length', 'status'],
        validation: this.validateReadyForQueryMessage.bind(this)
      },
      [MESSAGE_TYPES.ROW_DESCRIPTION]: {
        minLength: 7, // type + length + field count
        maxLength: 1024 * 1024,
        requiredFields: ['type', 'length', 'fieldCount'],
        optionalFields: ['fields'],
        validation: this.validateRowDescriptionMessage.bind(this)
      },
      [MESSAGE_TYPES.DATA_ROW]: {
        minLength: 7, // type + length + field count
        maxLength: 1024 * 1024,
        requiredFields: ['type', 'length', 'fieldCount'],
        optionalFields: ['fields'],
        validation: this.validateDataRowMessage.bind(this)
      },
      [MESSAGE_TYPES.COMMAND_COMPLETE]: {
        minLength: 5,
        maxLength: 1024,
        requiredFields: ['type', 'length'],
        optionalFields: ['tag'],
        validation: this.validateCommandCompleteMessage.bind(this)
      },
      [MESSAGE_TYPES.EMPTY_QUERY_RESPONSE]: {
        minLength: 5,
        maxLength: 5,
        requiredFields: ['type', 'length'],
        validation: this.validateEmptyQueryResponseMessage.bind(this)
      },
      [MESSAGE_TYPES.ERROR_RESPONSE]: {
        minLength: 5,
        maxLength: 1024,
        requiredFields: ['type', 'length'],
        optionalFields: ['errorFields'],
        validation: this.validateErrorResponseMessage.bind(this)
      },
      [MESSAGE_TYPES.NOTICE_RESPONSE]: {
        minLength: 5,
        maxLength: 1024,
        requiredFields: ['type', 'length'],
        optionalFields: ['noticeFields'],
        validation: this.validateNoticeResponseMessage.bind(this)
      },
      [MESSAGE_TYPES.NOTIFICATION_RESPONSE]: {
        minLength: 5,
        maxLength: 1024,
        requiredFields: ['type', 'length', 'pid', 'channel'],
        optionalFields: ['payload'],
        validation: this.validateNotificationResponseMessage.bind(this)
      },
      [MESSAGE_TYPES.PARSE_COMPLETE]: {
        minLength: 5,
        maxLength: 5,
        requiredFields: ['type', 'length'],
        validation: this.validateParseCompleteMessage.bind(this)
      },
      [MESSAGE_TYPES.BIND_COMPLETE]: {
        minLength: 5,
        maxLength: 5,
        requiredFields: ['type', 'length'],
        validation: this.validateBindCompleteMessage.bind(this)
      },
      [MESSAGE_TYPES.PARAMETER_DESCRIPTION]: {
        minLength: 7, // type + length + parameter count
        maxLength: 1024,
        requiredFields: ['type', 'length', 'parameterCount'],
        optionalFields: ['parameterTypes'],
        validation: this.validateParameterDescriptionMessage.bind(this)
      },
      [MESSAGE_TYPES.NO_DATA]: {
        minLength: 5,
        maxLength: 5,
        requiredFields: ['type', 'length'],
        validation: this.validateNoDataMessage.bind(this)
      },
      [MESSAGE_TYPES.PORTAL_SUSPENDED]: {
        minLength: 5,
        maxLength: 5,
        requiredFields: ['type', 'length'],
        validation: this.validatePortalSuspendedMessage.bind(this)
      },
      [MESSAGE_TYPES.COPY_IN_RESPONSE]: {
        minLength: 5,
        maxLength: 1024,
        requiredFields: ['type', 'length'],
        optionalFields: ['format', 'columnFormats'],
        validation: this.validateCopyInResponseMessage.bind(this)
      },
      [MESSAGE_TYPES.COPY_OUT_RESPONSE]: {
        minLength: 5,
        maxLength: 1024,
        requiredFields: ['type', 'length'],
        optionalFields: ['format', 'columnFormats'],
        validation: this.validateCopyOutResponseMessage.bind(this)
      },
      [MESSAGE_TYPES.COPY_BOTH_RESPONSE]: {
        minLength: 5,
        maxLength: 1024,
        requiredFields: ['type', 'length'],
        optionalFields: ['format', 'columnFormats'],
        validation: this.validateCopyBothResponseMessage.bind(this)
      }
    };
  }

  /**
   * Validate all message formats
   * @param {Object} options - Validation options
   * @returns {Promise<Object>} Validation results
   */
  async validateAllMessageFormats(options = {}) {
    const results = {
      total: 0,
      passed: 0,
      failed: 0,
      warnings: 0,
      details: {}
    };

    for (const [messageType, rules] of Object.entries(this.validationRules)) {
      try {
        const validationResult = await this.validateMessageFormat(messageType, rules, options);
        // Convert valid to passed for consistency
        validationResult.passed = validationResult.valid;
        results.details[messageType] = validationResult;
        results.total++;
        
        if (validationResult.valid) {
          results.passed++;
        } else {
          results.failed++;
        }
        
        if (validationResult.warnings && validationResult.warnings.length > 0) {
          results.warnings += validationResult.warnings.length;
        }
      } catch (error) {
        results.details[messageType] = {
          valid: false,
          passed: false,
          error: error.message,
          warnings: []
        };
        results.total++;
        results.failed++;
      }
    }

    return results;
  }

  /**
   * Validate specific message format
   * @param {string} messageType - Message type
   * @param {Object} rules - Validation rules
   * @param {Object} options - Validation options
   * @returns {Promise<Object>} Validation result
   */
  async validateMessageFormat(messageType, rules, options = {}) {
    const result = {
      valid: true,
      errors: [],
      warnings: [],
      messageType,
      rules
    };

    // Test with valid message
    try {
      const validMessage = this.generateValidMessage(messageType);
      const validation = this.validateMessage(validMessage, rules);
      
      if (!validation.valid) {
        result.valid = false;
        result.errors.push(`Valid message failed validation: ${validation.errors.join(', ')}`);
      }
    } catch (error) {
      result.valid = false;
      result.errors.push(`Failed to generate valid message: ${error.message}`);
    }

    // Test with invalid messages
    const invalidMessages = this.generateInvalidMessages(messageType, rules);
    for (const invalidMessage of invalidMessages) {
      const validation = this.validateMessage(invalidMessage.buffer, rules);
      if (validation.valid) {
        result.warnings.push(`Invalid message should have failed: ${invalidMessage.description}`);
      }
    }

    // Test edge cases
    const edgeCases = this.generateEdgeCases(messageType, rules);
    for (const edgeCase of edgeCases) {
      const validation = this.validateMessage(edgeCase.buffer, rules);
      if (!validation.valid && edgeCase.shouldPass) {
        result.warnings.push(`Edge case should have passed: ${edgeCase.description}`);
      } else if (validation.valid && !edgeCase.shouldPass) {
        result.warnings.push(`Edge case should have failed: ${edgeCase.description}`);
      }
    }

    return result;
  }

  /**
   * Validate a message buffer against rules
   * @param {Buffer} buffer - Message buffer
   * @param {Object} rules - Validation rules
   * @returns {Object} Validation result
   */
  validateMessage(buffer, rules) {
    const result = {
      valid: true,
      errors: [],
      warnings: []
    };

    // Check minimum length
    if (buffer.length < rules.minLength) {
      result.valid = false;
      result.errors.push(`Message too short: ${buffer.length} < ${rules.minLength}`);
    }

    // Check maximum length
    if (buffer.length > rules.maxLength) {
      result.valid = false;
      result.errors.push(`Message too long: ${buffer.length} > ${rules.maxLength}`);
    }

    // Check message type
    if (buffer.length > 0) {
      const messageType = String.fromCharCode(buffer[0]);
      if (!Object.values(MESSAGE_TYPES).includes(messageType)) {
        result.valid = false;
        result.errors.push(`Invalid message type: ${messageType}`);
      }
    }

    // Check length field
    if (buffer.length >= 5) {
      const length = buffer.readInt32BE(1);
      const expectedLength = buffer.length - 1; // -1 for message type
      if (length !== expectedLength) {
        result.valid = false;
        result.errors.push(`Length mismatch: expected ${expectedLength}, got ${length}`);
      }
    }

    // Run specific validation
    if (rules.validation) {
      try {
        const specificValidation = rules.validation(buffer);
        if (!specificValidation.valid) {
          result.valid = false;
          result.errors.push(...specificValidation.errors);
        }
        result.warnings.push(...specificValidation.warnings);
      } catch (error) {
        result.valid = false;
        result.errors.push(`Validation error: ${error.message}`);
      }
    }

    return result;
  }

  /**
   * Generate valid message for testing
   * @param {string} messageType - Message type
   * @returns {Buffer} Valid message buffer
   */
  generateValidMessage(messageType) {
    switch (messageType) {
      case MESSAGE_TYPES.QUERY:
        return this.createQueryMessage('SELECT 1');
      case MESSAGE_TYPES.SYNC:
        return this.createSyncMessage();
      case MESSAGE_TYPES.TERMINATE:
        return this.createTerminateMessage();
      case MESSAGE_TYPES.AUTHENTICATION:
        return this.createAuthenticationMessage(AUTH_METHODS.OK);
      case MESSAGE_TYPES.READY_FOR_QUERY:
        return this.createReadyForQueryMessage('I');
      case MESSAGE_TYPES.EMPTY_QUERY_RESPONSE:
        return this.createEmptyQueryResponseMessage();
      case MESSAGE_TYPES.PARSE_COMPLETE:
        return this.createParseCompleteMessage();
      case MESSAGE_TYPES.BIND_COMPLETE:
        return this.createBindCompleteMessage();
      case MESSAGE_TYPES.NO_DATA:
        return this.createNoDataMessage();
      case MESSAGE_TYPES.PORTAL_SUSPENDED:
        return this.createPortalSuspendedMessage();
      default:
        return this.createBasicMessage(messageType);
    }
  }

  /**
   * Generate invalid messages for testing
   * @param {string} messageType - Message type
   * @param {Object} rules - Validation rules
   * @returns {Array} Array of invalid message objects
   */
  generateInvalidMessages(messageType, rules) {
    const invalidMessages = [];

    // Too short message
    if (rules.minLength > 1) {
      invalidMessages.push({
        buffer: Buffer.alloc(rules.minLength - 1),
        description: 'Message too short'
      });
    }

    // Too long message
    invalidMessages.push({
      buffer: Buffer.alloc(rules.maxLength + 1),
      description: 'Message too long'
    });

    // Invalid message type
    if (rules.minLength >= 1) {
      const invalidTypeBuffer = Buffer.alloc(rules.minLength);
      invalidTypeBuffer[0] = 0xFF; // Invalid message type
      invalidMessages.push({
        buffer: invalidTypeBuffer,
        description: 'Invalid message type'
      });
    }

    // Length mismatch
    if (rules.minLength >= 5) {
      const lengthMismatchBuffer = Buffer.alloc(rules.minLength);
      lengthMismatchBuffer[0] = messageType.charCodeAt(0);
      lengthMismatchBuffer.writeInt32BE(999, 1); // Wrong length
      invalidMessages.push({
        buffer: lengthMismatchBuffer,
        description: 'Length mismatch'
      });
    }

    return invalidMessages;
  }

  /**
   * Generate edge cases for testing
   * @param {string} messageType - Message type
   * @param {Object} rules - Validation rules
   * @returns {Array} Array of edge case objects
   */
  generateEdgeCases(messageType, rules) {
    const edgeCases = [];

    // Minimum length message
    if (rules.minLength > 0) {
      edgeCases.push({
        buffer: Buffer.alloc(rules.minLength),
        description: 'Minimum length message',
        shouldPass: true
      });
    }

    // Maximum length message
    edgeCases.push({
      buffer: Buffer.alloc(rules.maxLength),
      description: 'Maximum length message',
      shouldPass: true
    });

    return edgeCases;
  }

  // Message creation helpers
  createQueryMessage(query) {
    const queryBuffer = Buffer.from(query + '\0', 'utf8');
    const length = queryBuffer.length + 4; // +4 for length field
    const buffer = Buffer.alloc(1 + 4 + queryBuffer.length);
    buffer[0] = MESSAGE_TYPES.QUERY.charCodeAt(0);
    buffer.writeInt32BE(length, 1);
    queryBuffer.copy(buffer, 5);
    return buffer;
  }

  createSyncMessage() {
    const buffer = Buffer.alloc(5);
    buffer[0] = MESSAGE_TYPES.SYNC.charCodeAt(0);
    buffer.writeInt32BE(4, 1);
    return buffer;
  }

  createTerminateMessage() {
    const buffer = Buffer.alloc(5);
    buffer[0] = MESSAGE_TYPES.TERMINATE.charCodeAt(0);
    buffer.writeInt32BE(4, 1);
    return buffer;
  }

  createAuthenticationMessage(authMethod) {
    const buffer = Buffer.alloc(9);
    buffer[0] = MESSAGE_TYPES.AUTHENTICATION.charCodeAt(0);
    buffer.writeInt32BE(8, 1);
    buffer.writeInt32BE(authMethod, 5);
    return buffer;
  }

  createReadyForQueryMessage(status) {
    const buffer = Buffer.alloc(6);
    buffer[0] = MESSAGE_TYPES.READY_FOR_QUERY.charCodeAt(0);
    buffer.writeInt32BE(5, 1);
    buffer[5] = status.charCodeAt(0);
    return buffer;
  }

  createEmptyQueryResponseMessage() {
    const buffer = Buffer.alloc(5);
    buffer[0] = MESSAGE_TYPES.EMPTY_QUERY_RESPONSE.charCodeAt(0);
    buffer.writeInt32BE(4, 1);
    return buffer;
  }

  createParseCompleteMessage() {
    const buffer = Buffer.alloc(5);
    buffer[0] = MESSAGE_TYPES.PARSE_COMPLETE.charCodeAt(0);
    buffer.writeInt32BE(4, 1);
    return buffer;
  }

  createBindCompleteMessage() {
    const buffer = Buffer.alloc(5);
    buffer[0] = MESSAGE_TYPES.BIND_COMPLETE.charCodeAt(0);
    buffer.writeInt32BE(4, 1);
    return buffer;
  }

  createNoDataMessage() {
    const buffer = Buffer.alloc(5);
    buffer[0] = MESSAGE_TYPES.NO_DATA.charCodeAt(0);
    buffer.writeInt32BE(4, 1);
    return buffer;
  }

  createPortalSuspendedMessage() {
    const buffer = Buffer.alloc(5);
    buffer[0] = MESSAGE_TYPES.PORTAL_SUSPENDED.charCodeAt(0);
    buffer.writeInt32BE(4, 1);
    return buffer;
  }

  createBasicMessage(messageType) {
    const buffer = Buffer.alloc(5);
    buffer[0] = messageType.charCodeAt(0);
    buffer.writeInt32BE(4, 1);
    return buffer;
  }

  // Specific message validators
  validateQueryMessage(buffer) {
    const result = { valid: true, errors: [], warnings: [] };
    
    if (buffer.length < 5) {
      result.valid = false;
      result.errors.push('Query message too short');
      return result;
    }

    const query = buffer.slice(5).toString('utf8').replace(/\0$/, '');
    if (query.length === 0) {
      result.warnings.push('Empty query string');
    }

    return result;
  }

  validateParseMessage(buffer) {
    const result = { valid: true, errors: [], warnings: [] };
    
    if (buffer.length < 5) {
      result.valid = false;
      result.errors.push('Parse message too short');
      return result;
    }

    // Parse message structure: type + length + statementName + query + paramCount + paramTypes
    let offset = 5;
    
    // Find statement name (null-terminated)
    const stmtNameStart = offset;
    while (offset < buffer.length && buffer[offset] !== 0) offset++;
    if (offset >= buffer.length) {
      result.valid = false;
      result.errors.push('Missing statement name null terminator');
      return result;
    }
    offset++; // Skip null terminator

    // Find query (null-terminated)
    const queryStart = offset;
    while (offset < buffer.length && buffer[offset] !== 0) offset++;
    if (offset >= buffer.length) {
      result.valid = false;
      result.errors.push('Missing query null terminator');
      return result;
    }
    offset++; // Skip null terminator

    // Check parameter count
    if (offset + 2 > buffer.length) {
      result.valid = false;
      result.errors.push('Missing parameter count');
      return result;
    }

    const paramCount = buffer.readInt16BE(offset);
    offset += 2;

    // Check parameter types
    if (offset + (paramCount * 4) > buffer.length) {
      result.valid = false;
      result.errors.push('Insufficient data for parameter types');
      return result;
    }

    return result;
  }

  validateBindMessage(buffer) {
    const result = { valid: true, errors: [], warnings: [] };
    
    if (buffer.length < 5) {
      result.valid = false;
      result.errors.push('Bind message too short');
      return result;
    }

    // Similar structure validation as Parse
    let offset = 5;
    
    // Portal name
    while (offset < buffer.length && buffer[offset] !== 0) offset++;
    if (offset >= buffer.length) {
      result.valid = false;
      result.errors.push('Missing portal name null terminator');
      return result;
    }
    offset++;

    // Statement name
    while (offset < buffer.length && buffer[offset] !== 0) offset++;
    if (offset >= buffer.length) {
      result.valid = false;
      result.errors.push('Missing statement name null terminator');
      return result;
    }
    offset++;

    return result;
  }

  validateDescribeMessage(buffer) {
    const result = { valid: true, errors: [], warnings: [] };
    
    if (buffer.length < 6) {
      result.valid = false;
      result.errors.push('Describe message too short');
      return result;
    }

    const describeType = String.fromCharCode(buffer[5]);
    if (describeType !== 'S' && describeType !== 'P') {
      result.valid = false;
      result.errors.push(`Invalid describe type: ${describeType}`);
    }

    return result;
  }

  validateExecuteMessage(buffer) {
    const result = { valid: true, errors: [], warnings: [] };
    
    if (buffer.length < 5) {
      result.valid = false;
      result.errors.push('Execute message too short');
      return result;
    }

    // Portal name validation
    let offset = 5;
    while (offset < buffer.length && buffer[offset] !== 0) offset++;
    if (offset >= buffer.length) {
      result.valid = false;
      result.errors.push('Missing portal name null terminator');
      return result;
    }

    return result;
  }

  validateSyncMessage(buffer) {
    const result = { valid: true, errors: [], warnings: [] };
    
    if (buffer.length !== 5) {
      result.valid = false;
      result.errors.push('Sync message must be exactly 5 bytes');
    }

    return result;
  }

  validateTerminateMessage(buffer) {
    const result = { valid: true, errors: [], warnings: [] };
    
    if (buffer.length !== 5) {
      result.valid = false;
      result.errors.push('Terminate message must be exactly 5 bytes');
    }

    return result;
  }

  validatePasswordMessage(buffer) {
    const result = { valid: true, errors: [], warnings: [] };
    
    if (buffer.length < 5) {
      result.valid = false;
      result.errors.push('Password message too short');
    }

    return result;
  }

  validateCopyDataMessage(buffer) {
    const result = { valid: true, errors: [], warnings: [] };
    
    if (buffer.length < 5) {
      result.valid = false;
      result.errors.push('Copy data message too short');
    }

    return result;
  }

  validateCopyDoneMessage(buffer) {
    const result = { valid: true, errors: [], warnings: [] };
    
    if (buffer.length !== 5) {
      result.valid = false;
      result.errors.push('Copy done message must be exactly 5 bytes');
    }

    return result;
  }

  validateCopyFailMessage(buffer) {
    const result = { valid: true, errors: [], warnings: [] };
    
    if (buffer.length < 5) {
      result.valid = false;
      result.errors.push('Copy fail message too short');
    }

    return result;
  }

  validateFunctionCallMessage(buffer) {
    const result = { valid: true, errors: [], warnings: [] };
    
    if (buffer.length < 5) {
      result.valid = false;
      result.errors.push('Function call message too short');
    }

    return result;
  }

  validateAuthenticationMessage(buffer) {
    const result = { valid: true, errors: [], warnings: [] };
    
    if (buffer.length < 9) {
      result.valid = false;
      result.errors.push('Authentication message too short');
      return result;
    }

    const authMethod = buffer.readInt32BE(5);
    if (!Object.values(AUTH_METHODS).includes(authMethod)) {
      result.warnings.push(`Unknown authentication method: ${authMethod}`);
    }

    return result;
  }

  validateBackendKeyDataMessage(buffer) {
    const result = { valid: true, errors: [], warnings: [] };
    
    if (buffer.length !== 13) {
      result.valid = false;
      result.errors.push('Backend key data message must be exactly 13 bytes');
    }

    return result;
  }

  validateParameterStatusMessage(buffer) {
    const result = { valid: true, errors: [], warnings: [] };
    
    if (buffer.length < 5) {
      result.valid = false;
      result.errors.push('Parameter status message too short');
    }

    return result;
  }

  validateReadyForQueryMessage(buffer) {
    const result = { valid: true, errors: [], warnings: [] };
    
    if (buffer.length !== 6) {
      result.valid = false;
      result.errors.push('Ready for query message must be exactly 6 bytes');
      return result;
    }

    const status = String.fromCharCode(buffer[5]);
    if (status !== 'I' && status !== 'T' && status !== 'E') {
      result.valid = false;
      result.errors.push(`Invalid transaction status: ${status}`);
    }

    return result;
  }

  validateRowDescriptionMessage(buffer) {
    const result = { valid: true, errors: [], warnings: [] };
    
    if (buffer.length < 7) {
      result.valid = false;
      result.errors.push('Row description message too short');
      return result;
    }

    const fieldCount = buffer.readInt16BE(5);
    if (fieldCount < 0) {
      result.valid = false;
      result.errors.push('Invalid field count');
    }

    return result;
  }

  validateDataRowMessage(buffer) {
    const result = { valid: true, errors: [], warnings: [] };
    
    if (buffer.length < 7) {
      result.valid = false;
      result.errors.push('Data row message too short');
      return result;
    }

    const fieldCount = buffer.readInt16BE(5);
    if (fieldCount < 0) {
      result.valid = false;
      result.errors.push('Invalid field count');
    }

    return result;
  }

  validateCommandCompleteMessage(buffer) {
    const result = { valid: true, errors: [], warnings: [] };
    
    if (buffer.length < 5) {
      result.valid = false;
      result.errors.push('Command complete message too short');
    }

    return result;
  }

  validateEmptyQueryResponseMessage(buffer) {
    const result = { valid: true, errors: [], warnings: [] };
    
    if (buffer.length !== 5) {
      result.valid = false;
      result.errors.push('Empty query response message must be exactly 5 bytes');
    }

    return result;
  }

  validateErrorResponseMessage(buffer) {
    const result = { valid: true, errors: [], warnings: [] };
    
    if (buffer.length < 5) {
      result.valid = false;
      result.errors.push('Error response message too short');
    }

    return result;
  }

  validateNoticeResponseMessage(buffer) {
    const result = { valid: true, errors: [], warnings: [] };
    
    if (buffer.length < 5) {
      result.valid = false;
      result.errors.push('Notice response message too short');
    }

    return result;
  }

  validateNotificationResponseMessage(buffer) {
    const result = { valid: true, errors: [], warnings: [] };
    
    if (buffer.length < 5) {
      result.valid = false;
      result.errors.push('Notification response message too short');
    }

    return result;
  }

  validateParseCompleteMessage(buffer) {
    const result = { valid: true, errors: [], warnings: [] };
    
    if (buffer.length !== 5) {
      result.valid = false;
      result.errors.push('Parse complete message must be exactly 5 bytes');
    }

    return result;
  }

  validateBindCompleteMessage(buffer) {
    const result = { valid: true, errors: [], warnings: [] };
    
    if (buffer.length !== 5) {
      result.valid = false;
      result.errors.push('Bind complete message must be exactly 5 bytes');
    }

    return result;
  }

  validateParameterDescriptionMessage(buffer) {
    const result = { valid: true, errors: [], warnings: [] };
    
    if (buffer.length < 7) {
      result.valid = false;
      result.errors.push('Parameter description message too short');
      return result;
    }

    const paramCount = buffer.readInt16BE(5);
    if (paramCount < 0) {
      result.valid = false;
      result.errors.push('Invalid parameter count');
    }

    return result;
  }

  validateNoDataMessage(buffer) {
    const result = { valid: true, errors: [], warnings: [] };
    
    if (buffer.length !== 5) {
      result.valid = false;
      result.errors.push('No data message must be exactly 5 bytes');
    }

    return result;
  }

  validatePortalSuspendedMessage(buffer) {
    const result = { valid: true, errors: [], warnings: [] };
    
    if (buffer.length !== 5) {
      result.valid = false;
      result.errors.push('Portal suspended message must be exactly 5 bytes');
    }

    return result;
  }

  validateCopyInResponseMessage(buffer) {
    const result = { valid: true, errors: [], warnings: [] };
    
    if (buffer.length < 5) {
      result.valid = false;
      result.errors.push('Copy in response message too short');
    }

    return result;
  }

  validateCopyOutResponseMessage(buffer) {
    const result = { valid: true, errors: [], warnings: [] };
    
    if (buffer.length < 5) {
      result.valid = false;
      result.errors.push('Copy out response message too short');
    }

    return result;
  }

  validateCopyBothResponseMessage(buffer) {
    const result = { valid: true, errors: [], warnings: [] };
    
    if (buffer.length < 5) {
      result.valid = false;
      result.errors.push('Copy both response message too short');
    }

    return result;
  }
}

module.exports = MessageValidator;


