/**
 * Tests for array query handling
 */

const { handleArrayQuery, getTypeOIDFromName } = require('../../src/handlers/queryHandlers');
const { DATA_TYPES } = require('../../src/protocol/constants');

describe('Array Query Handlers', () => {
  describe('handleArrayQuery', () => {
    test('should handle ARRAY constructor syntax', () => {
      const query = "SELECT ARRAY['apple', 'banana', 'cherry']";
      const result = handleArrayQuery(query, {});

      expect(result.command).toBe('SELECT');
      expect(result.rowCount).toBe(1);
      expect(result.columns).toHaveLength(1);
      expect(result.columns[0].name).toBe('array');
      expect(result.columns[0].dataTypeOID).toBe(DATA_TYPES.TEXT_ARRAY);
      expect(result.rows).toHaveLength(1);
      expect(result.rows[0][0]).toEqual(['apple', 'banana', 'cherry']);
    });

    test('should handle array literal syntax', () => {
      const query = "SELECT '{apple,banana,cherry}'";
      const result = handleArrayQuery(query, {});

      expect(result.command).toBe('SELECT');
      expect(result.rowCount).toBe(1);
      expect(result.columns).toHaveLength(1);
      expect(result.columns[0].name).toBe('array');
      expect(result.columns[0].dataTypeOID).toBe(DATA_TYPES.TEXT_ARRAY);
      expect(result.rows).toHaveLength(1);
      expect(result.rows[0][0]).toEqual(['apple', 'banana', 'cherry']);
    });

    test('should handle typed array casting', () => {
      const query = "SELECT '{1,2,3,4,5}'::int4[]";
      const result = handleArrayQuery(query, {});

      expect(result.command).toBe('SELECT');
      expect(result.rowCount).toBe(1);
      expect(result.columns).toHaveLength(1);
      expect(result.columns[0].name).toBe('array');
      expect(result.columns[0].dataTypeOID).toBe(DATA_TYPES.INT4_ARRAY);
      expect(result.rows).toHaveLength(1);
      expect(result.rows[0][0]).toEqual([1, 2, 3, 4, 5]);
    });

    test('should handle boolean array casting', () => {
      const query = "SELECT '{t,f,true,false}'::bool[]";
      const result = handleArrayQuery(query, {});

      expect(result.command).toBe('SELECT');
      expect(result.rowCount).toBe(1);
      expect(result.columns).toHaveLength(1);
      expect(result.columns[0].name).toBe('array');
      expect(result.columns[0].dataTypeOID).toBe(DATA_TYPES.BOOL_ARRAY);
      expect(result.rows).toHaveLength(1);
      expect(result.rows[0][0]).toEqual([true, false, true, false]);
    });

    test('should handle multidimensional array queries', () => {
      const query = 'SELECT ARRAY[ARRAY[1,2], ARRAY[3,4]]';
      const result = handleArrayQuery(query, {});

      expect(result.command).toBe('SELECT');
      expect(result.rowCount).toBe(1);
      expect(result.columns).toHaveLength(1);
      expect(result.columns[0].name).toBe('multidimensional_array');
      expect(result.columns[0].dataTypeOID).toBe(DATA_TYPES.TEXT_ARRAY);
      expect(result.rows).toHaveLength(1);
      expect(result.rows[0][0]).toEqual([
        ['a', 'b', 'c'],
        ['d', 'e', 'f'],
      ]);
    });

    test('should handle multidimensional array literal', () => {
      const query = "SELECT '{{a,b},{c,d}}'";
      const result = handleArrayQuery(query, {});

      expect(result.command).toBe('SELECT');
      expect(result.rowCount).toBe(1);
      expect(result.columns).toHaveLength(1);
      expect(result.columns[0].name).toBe('multidimensional_array');
      expect(result.columns[0].dataTypeOID).toBe(DATA_TYPES.TEXT_ARRAY);
      expect(result.rows).toHaveLength(1);
      expect(result.rows[0][0]).toEqual([
        ['a', 'b', 'c'],
        ['d', 'e', 'f'],
      ]);
    });

    test('should handle invalid array syntax', () => {
      const query = "SELECT '{invalid,array'"; // Missing closing brace
      const result = handleArrayQuery(query, {});

      // This should not match any pattern and fall back to the default case
      expect(result.command).toBe('SELECT');
      expect(result.columns[0].name).toBe('array_result');
    });

    test('should handle fallback array queries', () => {
      const query = 'SELECT some_array_column FROM table';
      const result = handleArrayQuery(query, {});

      expect(result.command).toBe('SELECT');
      expect(result.rowCount).toBe(1);
      expect(result.columns).toHaveLength(1);
      expect(result.columns[0].name).toBe('array_result');
      expect(result.columns[0].dataTypeOID).toBe(DATA_TYPES.TEXT_ARRAY);
      expect(result.rows).toHaveLength(1);
      expect(result.rows[0][0]).toEqual([1, 2, 3, 4, 5]);
    });
  });

  describe('getTypeOIDFromName', () => {
    test('should return correct OIDs for basic types', () => {
      expect(getTypeOIDFromName('bool')).toBe(DATA_TYPES.BOOL);
      expect(getTypeOIDFromName('boolean')).toBe(DATA_TYPES.BOOL);
      expect(getTypeOIDFromName('int4')).toBe(DATA_TYPES.INT4);
      expect(getTypeOIDFromName('integer')).toBe(DATA_TYPES.INT4);
      expect(getTypeOIDFromName('int')).toBe(DATA_TYPES.INT4);
      expect(getTypeOIDFromName('text')).toBe(DATA_TYPES.TEXT);
      expect(getTypeOIDFromName('varchar')).toBe(DATA_TYPES.VARCHAR);
    });

    test('should return correct OIDs for numeric types', () => {
      expect(getTypeOIDFromName('int2')).toBe(DATA_TYPES.INT2);
      expect(getTypeOIDFromName('smallint')).toBe(DATA_TYPES.INT2);
      expect(getTypeOIDFromName('int8')).toBe(DATA_TYPES.INT8);
      expect(getTypeOIDFromName('bigint')).toBe(DATA_TYPES.INT8);
      expect(getTypeOIDFromName('float4')).toBe(DATA_TYPES.FLOAT4);
      expect(getTypeOIDFromName('real')).toBe(DATA_TYPES.FLOAT4);
      expect(getTypeOIDFromName('float8')).toBe(DATA_TYPES.FLOAT8);
      expect(getTypeOIDFromName('double precision')).toBe(DATA_TYPES.FLOAT8);
      expect(getTypeOIDFromName('numeric')).toBe(DATA_TYPES.NUMERIC);
    });

    test('should return correct OIDs for date/time types', () => {
      expect(getTypeOIDFromName('date')).toBe(DATA_TYPES.DATE);
      expect(getTypeOIDFromName('time')).toBe(DATA_TYPES.TIME);
      expect(getTypeOIDFromName('timestamp')).toBe(DATA_TYPES.TIMESTAMP);
      expect(getTypeOIDFromName('timestamptz')).toBe(DATA_TYPES.TIMESTAMPTZ);
      expect(getTypeOIDFromName('interval')).toBe(DATA_TYPES.INTERVAL);
    });

    test('should return correct OIDs for other types', () => {
      expect(getTypeOIDFromName('uuid')).toBe(DATA_TYPES.UUID);
      expect(getTypeOIDFromName('json')).toBe(DATA_TYPES.JSON);
      expect(getTypeOIDFromName('jsonb')).toBe(DATA_TYPES.JSONB);
      expect(getTypeOIDFromName('char')).toBe(DATA_TYPES.CHAR);
      expect(getTypeOIDFromName('bpchar')).toBe(DATA_TYPES.BPCHAR);
    });

    test('should be case insensitive', () => {
      expect(getTypeOIDFromName('BOOL')).toBe(DATA_TYPES.BOOL);
      expect(getTypeOIDFromName('Boolean')).toBe(DATA_TYPES.BOOL);
      expect(getTypeOIDFromName('INT4')).toBe(DATA_TYPES.INT4);
      expect(getTypeOIDFromName('Integer')).toBe(DATA_TYPES.INT4);
      expect(getTypeOIDFromName('TEXT')).toBe(DATA_TYPES.TEXT);
    });

    test('should return TEXT for unknown types', () => {
      expect(getTypeOIDFromName('unknown_type')).toBe(DATA_TYPES.TEXT);
      expect(getTypeOIDFromName('custom_type')).toBe(DATA_TYPES.TEXT);
      expect(getTypeOIDFromName('')).toBe(DATA_TYPES.TEXT);
    });
  });
});
