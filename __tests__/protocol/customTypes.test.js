const {
  encodeCustomType,
  decodeCustomType,
  isCustomType,
  getTypeName,
} = require('../../src/protocol/utils');

const { registerCustomType, DEFAULT_CONFIG } = require('../../src/config/serverConfig');

const { DATA_TYPES } = require('../../src/protocol/constants');

describe('Custom Type Protocol Utilities', () => {
  let testConfig;

  beforeEach(() => {
    // Create a fresh config for each test
    testConfig = { ...DEFAULT_CONFIG, customTypes: {} };

    // Register test custom types
    registerCustomType(
      {
        name: 'email',
        oid: 100001,
        encode: value => `email:${value}`,
        decode: text => text.replace('email:', ''),
      },
      testConfig
    );

    registerCustomType(
      {
        name: 'json_object',
        oid: 100002,
        encode: value => JSON.stringify(value),
        decode: text => JSON.parse(text),
      },
      testConfig
    );

    registerCustomType(
      {
        name: 'uuid_upper',
        oid: 100003,
        encode: value => value.toUpperCase(),
        decode: text => text.toLowerCase(),
      },
      testConfig
    );
  });

  describe('encodeCustomType', () => {
    test('should encode value using custom encoder', () => {
      const result = encodeCustomType('test@example.com', 100001, testConfig);
      expect(result).toBe('email:test@example.com');
    });

    test('should encode complex objects', () => {
      const testData = { id: 1, name: 'test', active: true };
      const result = encodeCustomType(testData, 100002, testConfig);
      const expected = JSON.stringify(testData);
      expect(result).toBe(expected);
    });

    test('should throw error for unknown type OID', () => {
      expect(() => {
        encodeCustomType('test', 999999, testConfig);
      }).toThrow('Unknown custom type OID: 999999');
    });

    test('should throw error when encoder function fails', () => {
      // Register a type with a faulty encoder
      registerCustomType(
        {
          name: 'faulty',
          oid: 100010,
          encode: () => {
            throw new Error('Encoder failed');
          },
          decode: () => '',
        },
        testConfig
      );

      expect(() => {
        encodeCustomType('test', 100010, testConfig);
      }).toThrow("Failed to encode custom type 'faulty': Encoder failed");
    });
  });

  describe('decodeCustomType', () => {
    test('should decode value using custom decoder', () => {
      const result = decodeCustomType('email:test@example.com', 100001, testConfig);
      expect(result).toBe('test@example.com');
    });

    test('should decode complex objects', () => {
      const testData = { id: 1, name: 'test', active: true };
      const jsonString = JSON.stringify(testData);
      const result = decodeCustomType(jsonString, 100002, testConfig);
      expect(result).toEqual(testData);
    });

    test('should throw error for unknown type OID', () => {
      expect(() => {
        decodeCustomType('test', 999999, testConfig);
      }).toThrow('Unknown custom type OID: 999999');
    });

    test('should throw error when decoder function fails', () => {
      // Register a type with a faulty decoder
      registerCustomType(
        {
          name: 'faulty_decode',
          oid: 100011,
          encode: () => '',
          decode: () => {
            throw new Error('Decoder failed');
          },
        },
        testConfig
      );

      expect(() => {
        decodeCustomType('test', 100011, testConfig);
      }).toThrow("Failed to decode custom type 'faulty_decode': Decoder failed");
    });
  });

  describe('isCustomType', () => {
    test('should return true for registered custom type OID', () => {
      expect(isCustomType(100001, testConfig)).toBe(true);
      expect(isCustomType(100002, testConfig)).toBe(true);
      expect(isCustomType(100003, testConfig)).toBe(true);
    });

    test('should return false for standard PostgreSQL type OID', () => {
      expect(isCustomType(DATA_TYPES.TEXT, testConfig)).toBe(false);
      expect(isCustomType(DATA_TYPES.INT4, testConfig)).toBe(false);
      expect(isCustomType(DATA_TYPES.BOOL, testConfig)).toBe(false);
    });

    test('should return false for unknown OID', () => {
      expect(isCustomType(999999, testConfig)).toBe(false);
    });

    test('should return false when config has no custom types', () => {
      const emptyConfig = { customTypes: {} };
      expect(isCustomType(100001, emptyConfig)).toBe(false);
    });
  });

  describe('getTypeName', () => {
    test('should return custom type name for custom OID', () => {
      expect(getTypeName(100001, testConfig)).toBe('email');
      expect(getTypeName(100002, testConfig)).toBe('json_object');
      expect(getTypeName(100003, testConfig)).toBe('uuid_upper');
    });

    test('should return standard type name for PostgreSQL OID', () => {
      expect(getTypeName(DATA_TYPES.TEXT, testConfig)).toBe('text');
      expect(getTypeName(DATA_TYPES.INT4, testConfig)).toBe('int4');
      expect(getTypeName(DATA_TYPES.BOOL, testConfig)).toBe('bool');
      expect(getTypeName(DATA_TYPES.VARCHAR, testConfig)).toBe('varchar');
      expect(getTypeName(DATA_TYPES.TIMESTAMP, testConfig)).toBe('timestamp');
    });

    test('should return "unknown" for unrecognized OID', () => {
      expect(getTypeName(999999, testConfig)).toBe('unknown');
    });

    test('should work without config for standard types', () => {
      expect(getTypeName(DATA_TYPES.TEXT, null)).toBe('text');
      expect(getTypeName(DATA_TYPES.INT4, null)).toBe('int4');
    });

    test('should return "unknown" for custom OID without config', () => {
      expect(getTypeName(100001, null)).toBe('unknown');
    });
  });

  describe('Round-trip encoding/decoding', () => {
    test('should maintain data integrity through encode/decode cycle', () => {
      const testData = [
        ['email', 100001, 'user@domain.com'],
        ['json_object', 100002, { id: 42, name: 'test', nested: { a: 1, b: 2 } }],
        ['uuid_upper', 100003, 'a1b2c3d4-e5f6-7890-abcd-ef1234567890'],
      ];

      for (const [, oid, originalValue] of testData) {
        const encoded = encodeCustomType(originalValue, oid, testConfig);
        const decoded = decodeCustomType(encoded, oid, testConfig);
        expect(decoded).toEqual(originalValue);
      }
    });

    test('should handle edge cases', () => {
      // Test null/undefined handling
      const nullResult = encodeCustomType(null, 100001, testConfig);
      expect(nullResult).toBe('email:null');

      const undefinedResult = encodeCustomType(undefined, 100001, testConfig);
      expect(undefinedResult).toBe('email:undefined');

      // Test empty values
      const emptyStringResult = encodeCustomType('', 100001, testConfig);
      expect(emptyStringResult).toBe('email:');
      expect(decodeCustomType(emptyStringResult, 100001, testConfig)).toBe('');
    });

    test('should handle special characters', () => {
      const specialString = 'test@domain.com with "quotes" and \\backslashes\\';
      const encoded = encodeCustomType(specialString, 100001, testConfig);
      const decoded = decodeCustomType(encoded, 100001, testConfig);
      expect(decoded).toBe(specialString);
    });
  });

  describe('Error handling', () => {
    test('should provide meaningful error messages', () => {
      try {
        encodeCustomType('test', 999999, testConfig);
      } catch (error) {
        expect(error.message).toContain('Unknown custom type OID: 999999');
      }

      try {
        decodeCustomType('test', 999999, testConfig);
      } catch (error) {
        expect(error.message).toContain('Unknown custom type OID: 999999');
      }
    });

    test('should handle encoding errors gracefully', () => {
      registerCustomType(
        {
          name: 'circular_ref',
          oid: 100020,
          encode: value => {
            if (value && typeof value === 'object') {
              // This will fail for circular references
              return JSON.stringify(value);
            }
            return String(value);
          },
          decode: text => text,
        },
        testConfig
      );

      // Create circular reference
      const obj = { name: 'test' };
      obj.self = obj;

      expect(() => {
        encodeCustomType(obj, 100020, testConfig);
      }).toThrow('Failed to encode custom type');
    });

    test('should handle decoding errors gracefully', () => {
      registerCustomType(
        {
          name: 'strict_json',
          oid: 100021,
          encode: value => JSON.stringify(value),
          decode: text => JSON.parse(text), // Will fail on invalid JSON
        },
        testConfig
      );

      expect(() => {
        decodeCustomType('invalid json', 100021, testConfig);
      }).toThrow('Failed to decode custom type');
    });
  });
});
