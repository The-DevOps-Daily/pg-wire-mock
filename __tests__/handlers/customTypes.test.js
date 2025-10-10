const {
  getTypeOIDFromName,
  handlePgType,
  handleCreateTypeQuery,
} = require('../../src/handlers/queryHandlers');

const { registerCustomType, DEFAULT_CONFIG } = require('../../src/config/serverConfig');

const { DATA_TYPES } = require('../../src/protocol/constants');

describe('Custom Types Query Handlers', () => {
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
        typlen: 256,
        typtype: 'b',
      },
      testConfig
    );

    registerCustomType(
      {
        name: 'phone_number',
        oid: 100002,
        encode: value => value.replace(/\D/g, ''),
        decode: text => text,
        typlen: 15,
        typtype: 'b',
      },
      testConfig
    );
  });

  describe('getTypeOIDFromName', () => {
    test('should return custom type OID for registered type name', () => {
      expect(getTypeOIDFromName('email', testConfig)).toBe(100001);
      expect(getTypeOIDFromName('phone_number', testConfig)).toBe(100002);
    });

    test('should be case insensitive for custom types', () => {
      expect(getTypeOIDFromName('EMAIL', testConfig)).toBe(100001);
      expect(getTypeOIDFromName('Phone_Number', testConfig)).toBe(100002);
    });

    test('should return standard type OID for PostgreSQL types', () => {
      expect(getTypeOIDFromName('text', testConfig)).toBe(DATA_TYPES.TEXT);
      expect(getTypeOIDFromName('int4', testConfig)).toBe(DATA_TYPES.INT4);
      expect(getTypeOIDFromName('bool', testConfig)).toBe(DATA_TYPES.BOOL);
    });

    test('should prioritize custom types over standard types with same name', () => {
      // Register a custom type with same name as standard type
      registerCustomType(
        {
          name: 'text',
          oid: 100050,
          encode: value => `custom:${value}`,
          decode: text => text.replace('custom:', ''),
        },
        testConfig
      );

      expect(getTypeOIDFromName('text', testConfig)).toBe(100050);
    });

    test('should return TEXT OID for unknown types when no config provided', () => {
      expect(getTypeOIDFromName('unknown_type')).toBe(DATA_TYPES.TEXT);
      expect(getTypeOIDFromName('email')).toBe(DATA_TYPES.TEXT);
    });

    test('should return TEXT OID for unknown custom types', () => {
      expect(getTypeOIDFromName('nonexistent', testConfig)).toBe(DATA_TYPES.TEXT);
    });

    test('should handle edge cases', () => {
      expect(getTypeOIDFromName('', testConfig)).toBe(DATA_TYPES.TEXT);
      expect(getTypeOIDFromName(null, testConfig)).toBe(DATA_TYPES.TEXT);
      expect(getTypeOIDFromName(undefined, testConfig)).toBe(DATA_TYPES.TEXT);
    });
  });

  describe('handlePgType', () => {
    test('should return standard PostgreSQL types without config', () => {
      const result = handlePgType('SELECT * FROM pg_type', null);

      expect(result.columns).toHaveLength(5);
      expect(result.columns[0].name).toBe('oid');
      expect(result.columns[1].name).toBe('typname');
      expect(result.rows.length).toBeGreaterThan(0);

      // Check for some standard types
      const typeNames = result.rows.map(row => row[1]);
      expect(typeNames).toContain('bool');
      expect(typeNames).toContain('int4');
      expect(typeNames).toContain('text');
    });

    test('should include custom types when config is provided', () => {
      const result = handlePgType('SELECT * FROM pg_type', null, testConfig);

      expect(result.columns).toHaveLength(5);
      expect(result.rows.length).toBeGreaterThan(8); // Standard + custom types

      // Check that custom types are included
      const rows = result.rows;
      const emailTypeRow = rows.find(row => row[1] === 'email');
      const phoneTypeRow = rows.find(row => row[1] === 'phone_number');

      expect(emailTypeRow).toBeDefined();
      expect(emailTypeRow[0]).toBe('100001'); // OID
      expect(emailTypeRow[2]).toBe('2200'); // namespace
      expect(emailTypeRow[3]).toBe('256'); // typlen
      expect(emailTypeRow[4]).toBe('b'); // typtype

      expect(phoneTypeRow).toBeDefined();
      expect(phoneTypeRow[0]).toBe('100002');
      expect(phoneTypeRow[3]).toBe('15');
    });

    test('should handle config with no custom types', () => {
      const emptyConfig = { customTypes: {} };
      const result = handlePgType('SELECT * FROM pg_type', null, emptyConfig);

      expect(result.rows.length).toBe(8); // Only standard types
      const typeNames = result.rows.map(row => row[1]);
      expect(typeNames).not.toContain('email');
      expect(typeNames).not.toContain('phone_number');
    });

    test('should return proper command metadata', () => {
      const result = handlePgType('SELECT * FROM pg_type', null, testConfig);

      expect(result.command).toBe('SELECT');
      expect(result.rowCount).toBe(result.rows.length);
    });

    test('should have correct column definitions', () => {
      const result = handlePgType('SELECT * FROM pg_type', null, testConfig);

      expect(result.columns[0]).toEqual({
        name: 'oid',
        dataTypeOID: DATA_TYPES.OID,
        dataTypeSize: 4,
      });

      expect(result.columns[1]).toEqual({
        name: 'typname',
        dataTypeOID: DATA_TYPES.NAME,
        dataTypeSize: 64,
      });

      expect(result.columns[4]).toEqual({
        name: 'typtype',
        dataTypeOID: DATA_TYPES.CHAR,
        dataTypeSize: 1,
      });
    });
  });

  describe('handleCreateTypeQuery', () => {
    test('should return success response for CREATE TYPE', () => {
      const result = handleCreateTypeQuery('CREATE TYPE email AS (value text);', null, testConfig);

      expect(result.columns).toEqual([]);
      expect(result.rows).toEqual([]);
      expect(result.command).toBe('CREATE TYPE');
      expect(result.rowCount).toBe(0);
    });

    test('should handle various CREATE TYPE syntaxes', () => {
      const queries = [
        "CREATE TYPE status AS ENUM ('active', 'inactive');",
        'CREATE TYPE point AS (x float8, y float8);',
        'CREATE TYPE complex_type AS (id int4, data jsonb);',
      ];

      for (const query of queries) {
        const result = handleCreateTypeQuery(query, null, testConfig);
        expect(result.command).toBe('CREATE TYPE');
        expect(result.rowCount).toBe(0);
      }
    });
  });

  describe('Integration tests', () => {
    test('should work with multiple custom types', () => {
      // Register additional types
      for (let i = 3; i <= 5; i++) {
        registerCustomType(
          {
            name: `custom_type_${i}`,
            oid: 100000 + i,
            encode: value => `type${i}:${value}`,
            decode: text => text.replace(`type${i}:`, ''),
            typlen: i * 10,
            typtype: 'b',
          },
          testConfig
        );
      }

      const result = handlePgType('SELECT * FROM pg_type', null, testConfig);

      // Should have standard types + 5 custom types
      expect(result.rows.length).toBe(8 + 5);

      // Check all custom types are present
      const typeNames = result.rows.map(row => row[1]);
      expect(typeNames).toContain('email');
      expect(typeNames).toContain('phone_number');
      expect(typeNames).toContain('custom_type_3');
      expect(typeNames).toContain('custom_type_4');
      expect(typeNames).toContain('custom_type_5');
    });

    test('should handle type name lookups correctly', () => {
      const testCases = [
        ['email', 100001],
        ['phone_number', 100002],
        ['text', DATA_TYPES.TEXT],
        ['varchar', DATA_TYPES.VARCHAR],
        ['nonexistent', DATA_TYPES.TEXT],
      ];

      for (const [typeName, expectedOID] of testCases) {
        const actualOID = getTypeOIDFromName(typeName, testConfig);
        expect(actualOID).toBe(expectedOID);
      }
    });

    test('should maintain type information consistency', () => {
      const pgTypeResult = handlePgType('SELECT * FROM pg_type', null, testConfig);

      // Check each custom type row has consistent information
      const emailRow = pgTypeResult.rows.find(row => row[1] === 'email');
      expect(emailRow[0]).toBe('100001'); // OID matches registration
      expect(emailRow[3]).toBe('256'); // typlen matches registration
      expect(emailRow[4]).toBe('b'); // typtype matches registration

      // Verify getTypeOIDFromName returns same OID
      const emailOID = getTypeOIDFromName('email', testConfig);
      expect(emailOID).toBe(100001);
    });

    test('should handle edge cases in pg_type queries', () => {
      // Test with null/undefined connection state
      const result1 = handlePgType('SELECT * FROM pg_type', null, testConfig);
      const result2 = handlePgType('SELECT * FROM pg_type', undefined, testConfig);

      expect(result1.rows.length).toBe(result2.rows.length);
      expect(result1.command).toBe(result2.command);

      // Test with different query strings (should not affect result)
      const result3 = handlePgType('select oid, typname from pg_catalog.pg_type', null, testConfig);
      expect(result3.rows.length).toBe(result1.rows.length);
    });
  });
});
