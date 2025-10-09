const {
  registerCustomType,
  getCustomType,
  getCustomTypeByName,
  getAllCustomTypes,
  DEFAULT_CONFIG,
} = require('../../src/config/serverConfig');

describe('Custom Types Configuration', () => {
  let testConfig;

  beforeEach(() => {
    // Create a fresh config for each test
    testConfig = { ...DEFAULT_CONFIG, customTypes: {} };
  });

  describe('registerCustomType', () => {
    test('should register a valid custom type', () => {
      const typeConfig = {
        name: 'email',
        oid: 100001,
        encode: value => `email:${value}`,
        decode: text => text.replace('email:', ''),
      };

      expect(() => registerCustomType(typeConfig, testConfig)).not.toThrow();
      expect(testConfig.customTypes[100001]).toBeDefined();
      expect(testConfig.customTypes[100001].name).toBe('email');
    });

    test('should throw error for invalid type configuration', () => {
      expect(() => registerCustomType(null, testConfig)).toThrow('must be an object');
      expect(() => registerCustomType({}, testConfig)).toThrow('must have a name');
      expect(() => registerCustomType({ name: 'test' }, testConfig)).toThrow(
        'must have a unique OID'
      );
    });

    test('should throw error for invalid OID', () => {
      const typeConfig = {
        name: 'test',
        oid: 50000, // Too low
        encode: () => '',
        decode: () => '',
      };

      expect(() => registerCustomType(typeConfig, testConfig)).toThrow('OID >= 100000');
    });

    test('should throw error for missing encode/decode functions', () => {
      const typeConfig = {
        name: 'test',
        oid: 100001,
      };

      expect(() => registerCustomType(typeConfig, testConfig)).toThrow('encode function');

      typeConfig.encode = () => '';
      expect(() => registerCustomType(typeConfig, testConfig)).toThrow('decode function');
    });

    test('should throw error for duplicate OID', () => {
      const typeConfig1 = {
        name: 'test1',
        oid: 100001,
        encode: () => '',
        decode: () => '',
      };

      const typeConfig2 = {
        name: 'test2',
        oid: 100001, // Same OID
        encode: () => '',
        decode: () => '',
      };

      registerCustomType(typeConfig1, testConfig);
      expect(() => registerCustomType(typeConfig2, testConfig)).toThrow('already registered');
    });

    test('should throw error for duplicate name', () => {
      const typeConfig1 = {
        name: 'email',
        oid: 100001,
        encode: () => '',
        decode: () => '',
      };

      const typeConfig2 = {
        name: 'EMAIL', // Same name, different case
        oid: 100002,
        encode: () => '',
        decode: () => '',
      };

      registerCustomType(typeConfig1, testConfig);
      expect(() => registerCustomType(typeConfig2, testConfig)).toThrow('already registered');
    });

    test('should set default typlen and typtype', () => {
      const typeConfig = {
        name: 'test',
        oid: 100001,
        encode: () => '',
        decode: () => '',
      };

      registerCustomType(typeConfig, testConfig);
      const registered = testConfig.customTypes[100001];

      expect(registered.typlen).toBe(-1);
      expect(registered.typtype).toBe('b');
    });

    test('should allow custom typlen and typtype', () => {
      const typeConfig = {
        name: 'test',
        oid: 100001,
        encode: () => '',
        decode: () => '',
        typlen: 16,
        typtype: 'c',
      };

      registerCustomType(typeConfig, testConfig);
      const registered = testConfig.customTypes[100001];

      expect(registered.typlen).toBe(16);
      expect(registered.typtype).toBe('c');
    });
  });

  describe('getCustomType', () => {
    beforeEach(() => {
      registerCustomType(
        {
          name: 'email',
          oid: 100001,
          encode: value => `email:${value}`,
          decode: text => text.replace('email:', ''),
        },
        testConfig
      );
    });

    test('should retrieve existing custom type by OID', () => {
      const customType = getCustomType(100001, testConfig);
      expect(customType).toBeDefined();
      expect(customType.name).toBe('email');
      expect(customType.oid).toBe(100001);
    });

    test('should return null for non-existent OID', () => {
      const customType = getCustomType(999999, testConfig);
      expect(customType).toBeNull();
    });

    test('should return null for empty config', () => {
      const emptyConfig = { customTypes: {} };
      const customType = getCustomType(100001, emptyConfig);
      expect(customType).toBeNull();
    });
  });

  describe('getCustomTypeByName', () => {
    beforeEach(() => {
      registerCustomType(
        {
          name: 'email',
          oid: 100001,
          encode: value => `email:${value}`,
          decode: text => text.replace('email:', ''),
        },
        testConfig
      );
    });

    test('should retrieve existing custom type by name', () => {
      const customType = getCustomTypeByName('email', testConfig);
      expect(customType).toBeDefined();
      expect(customType.name).toBe('email');
      expect(customType.oid).toBe(100001);
    });

    test('should be case insensitive', () => {
      const customType = getCustomTypeByName('EMAIL', testConfig);
      expect(customType).toBeDefined();
      expect(customType.name).toBe('email');
    });

    test('should return null for non-existent name', () => {
      const customType = getCustomTypeByName('nonexistent', testConfig);
      expect(customType).toBeNull();
    });

    test('should return null for invalid input', () => {
      expect(getCustomTypeByName(null, testConfig)).toBeNull();
      expect(getCustomTypeByName('', testConfig)).toBeNull();
    });
  });

  describe('getAllCustomTypes', () => {
    test('should return empty array for no custom types', () => {
      const customTypes = getAllCustomTypes(testConfig);
      expect(customTypes).toEqual([]);
    });

    test('should return all registered custom types', () => {
      registerCustomType(
        {
          name: 'email',
          oid: 100001,
          encode: () => '',
          decode: () => '',
        },
        testConfig
      );

      registerCustomType(
        {
          name: 'phone',
          oid: 100002,
          encode: () => '',
          decode: () => '',
        },
        testConfig
      );

      const customTypes = getAllCustomTypes(testConfig);
      expect(customTypes).toHaveLength(2);
      expect(customTypes.map(t => t.name)).toEqual(['email', 'phone']);
    });
  });

  describe('Integration with encode/decode', () => {
    test('should properly encode and decode values', () => {
      const typeConfig = {
        name: 'email',
        oid: 100001,
        encode: value => `<${value}>`,
        decode: text => text.slice(1, -1),
      };

      registerCustomType(typeConfig, testConfig);
      const customType = getCustomType(100001, testConfig);

      const encoded = customType.encode('test@example.com');
      expect(encoded).toBe('<test@example.com>');

      const decoded = customType.decode('<test@example.com>');
      expect(decoded).toBe('test@example.com');
    });

    test('should handle complex data structures', () => {
      const typeConfig = {
        name: 'json_array',
        oid: 100001,
        encode: value => JSON.stringify(value),
        decode: text => JSON.parse(text),
      };

      registerCustomType(typeConfig, testConfig);
      const customType = getCustomType(100001, testConfig);

      const testData = [
        { id: 1, name: 'test' },
        { id: 2, name: 'test2' },
      ];
      const encoded = customType.encode(testData);
      const decoded = customType.decode(encoded);

      expect(decoded).toEqual(testData);
    });
  });
});
