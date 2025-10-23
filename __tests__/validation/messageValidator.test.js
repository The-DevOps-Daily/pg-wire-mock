/**
 * Tests for Message Validator
 */

const MessageValidator = require('../../src/validation/messageValidator');
const { MESSAGE_TYPES, AUTH_METHODS } = require('../../src/protocol/constants');

describe('Message Validator', () => {
  let validator;

  beforeEach(() => {
    validator = new MessageValidator();
  });

  describe('Message Format Validation', () => {
    test('should validate all message formats', async () => {
      const results = await validator.validateAllMessageFormats();
      
      expect(results).toHaveProperty('total');
      expect(results).toHaveProperty('passed');
      expect(results).toHaveProperty('failed');
      expect(results).toHaveProperty('warnings');
      expect(results).toHaveProperty('details');
      
      expect(results.total).toBeGreaterThan(0);
    });

    test('should validate specific message format', async () => {
      const rules = validator.validationRules[MESSAGE_TYPES.QUERY];
      const result = await validator.validateMessageFormat(MESSAGE_TYPES.QUERY, rules);
      
      expect(result).toHaveProperty('valid');
      expect(result).toHaveProperty('errors');
      expect(result).toHaveProperty('warnings');
      expect(result).toHaveProperty('messageType');
    });
  });

  describe('Message Validation', () => {
    test('should validate valid message', () => {
      const validMessage = validator.createQueryMessage('SELECT 1');
      const rules = validator.validationRules[MESSAGE_TYPES.QUERY];
      const result = validator.validateMessage(validMessage, rules);
      
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    test('should reject message that is too short', () => {
      const shortMessage = Buffer.alloc(3);
      const rules = validator.validationRules[MESSAGE_TYPES.QUERY];
      const result = validator.validateMessage(shortMessage, rules);
      
      expect(result.valid).toBe(false);
      expect(result.errors).toContain(expect.stringContaining('too short'));
    });

    test('should reject message that is too long', () => {
      const longMessage = Buffer.alloc(1024 * 1024 + 1);
      const rules = validator.validationRules[MESSAGE_TYPES.QUERY];
      const result = validator.validateMessage(longMessage, rules);
      
      expect(result.valid).toBe(false);
      expect(result.errors).toContain(expect.stringContaining('too long'));
    });

    test('should reject message with invalid type', () => {
      const invalidMessage = Buffer.alloc(5);
      invalidMessage[0] = 0xFF; // Invalid message type
      invalidMessage.writeInt32BE(4, 1);
      const rules = validator.validationRules[MESSAGE_TYPES.QUERY];
      const result = validator.validateMessage(invalidMessage, rules);
      
      expect(result.valid).toBe(false);
      expect(result.errors).toContain(expect.stringContaining('Invalid message type'));
    });

    test('should reject message with length mismatch', () => {
      const message = Buffer.alloc(10);
      message[0] = MESSAGE_TYPES.QUERY.charCodeAt(0);
      message.writeInt32BE(999, 1); // Wrong length
      const rules = validator.validationRules[MESSAGE_TYPES.QUERY];
      const result = validator.validateMessage(message, rules);
      
      expect(result.valid).toBe(false);
      expect(result.errors).toContain(expect.stringContaining('Length mismatch'));
    });
  });

  describe('Message Generation', () => {
    test('should generate valid query message', () => {
      const message = validator.createQueryMessage('SELECT 1');
      
      expect(message.length).toBeGreaterThan(5);
      expect(String.fromCharCode(message[0])).toBe(MESSAGE_TYPES.QUERY);
      expect(message.readInt32BE(1)).toBe(message.length - 1);
    });

    test('should generate valid sync message', () => {
      const message = validator.createSyncMessage();
      
      expect(message.length).toBe(5);
      expect(String.fromCharCode(message[0])).toBe(MESSAGE_TYPES.SYNC);
      expect(message.readInt32BE(1)).toBe(4);
    });

    test('should generate valid authentication message', () => {
      const message = validator.createAuthenticationMessage(AUTH_METHODS.OK);
      
      expect(message.length).toBe(9);
      expect(String.fromCharCode(message[0])).toBe(MESSAGE_TYPES.AUTHENTICATION);
      expect(message.readInt32BE(1)).toBe(8);
      expect(message.readInt32BE(5)).toBe(AUTH_METHODS.OK);
    });
  });

  describe('Specific Message Validators', () => {
    test('should validate query message correctly', () => {
      const validQuery = validator.createQueryMessage('SELECT 1');
      const result = validator.validateQueryMessage(validQuery);
      
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    test('should validate sync message correctly', () => {
      const validSync = validator.createSyncMessage();
      const result = validator.validateSyncMessage(validSync);
      
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    test('should validate ready for query message correctly', () => {
      const validReady = validator.createReadyForQueryMessage('I');
      const result = validator.validateReadyForQueryMessage(validReady);
      
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    test('should reject ready for query with invalid status', () => {
      const invalidReady = Buffer.alloc(6);
      invalidReady[0] = MESSAGE_TYPES.READY_FOR_QUERY.charCodeAt(0);
      invalidReady.writeInt32BE(5, 1);
      invalidReady[5] = 'X'.charCodeAt(0); // Invalid status
      const result = validator.validateReadyForQueryMessage(invalidReady);
      
      expect(result.valid).toBe(false);
      expect(result.errors).toContain(expect.stringContaining('Invalid transaction status'));
    });
  });

  describe('Edge Cases', () => {
    test('should handle empty query string', () => {
      const emptyQuery = validator.createQueryMessage('');
      const rules = validator.validationRules[MESSAGE_TYPES.QUERY];
      const result = validator.validateMessage(emptyQuery, rules);
      
      expect(result.valid).toBe(true);
    });

    test('should handle very long query', () => {
      const longQuery = 'SELECT ' + '1, '.repeat(1000) + '1';
      const longQueryMessage = validator.createQueryMessage(longQuery);
      const rules = validator.validationRules[MESSAGE_TYPES.QUERY];
      const result = validator.validateMessage(longQueryMessage, rules);
      
      expect(result.valid).toBe(true);
    });

    test('should handle unicode characters', () => {
      const unicodeQuery = validator.createQueryMessage('SELECT \'你好世界\' as greeting');
      const rules = validator.validationRules[MESSAGE_TYPES.QUERY];
      const result = validator.validateMessage(unicodeQuery, rules);
      
      expect(result.valid).toBe(true);
    });
  });

  describe('Invalid Message Generation', () => {
    test('should generate invalid messages for testing', () => {
      const rules = validator.validationRules[MESSAGE_TYPES.QUERY];
      const invalidMessages = validator.generateInvalidMessages(MESSAGE_TYPES.QUERY, rules);
      
      expect(invalidMessages).toHaveLength(4); // 4 types of invalid messages
      
      for (const invalidMessage of invalidMessages) {
        expect(invalidMessage).toHaveProperty('buffer');
        expect(invalidMessage).toHaveProperty('description');
      }
    });

    test('should generate edge cases for testing', () => {
      const rules = validator.validationRules[MESSAGE_TYPES.QUERY];
      const edgeCases = validator.generateEdgeCases(MESSAGE_TYPES.QUERY, rules);
      
      expect(edgeCases).toHaveLength(2); // Min and max length
      
      for (const edgeCase of edgeCases) {
        expect(edgeCase).toHaveProperty('buffer');
        expect(edgeCase).toHaveProperty('description');
        expect(edgeCase).toHaveProperty('shouldPass');
      }
    });
  });
});


