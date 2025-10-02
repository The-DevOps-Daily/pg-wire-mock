/**
 * Tests for PostgreSQL array type handling
 */

const {
  encodeArrayToText,
  parseArrayFromText,
  getArrayTypeOID,
  getBaseTypeOID,
  isArrayType,
} = require('../../src/protocol/utils');

const { DATA_TYPES } = require('../../src/protocol/constants');

describe('Array Type Utilities', () => {
  describe('encodeArrayToText', () => {
    test('should encode simple string array', () => {
      const array = ['apple', 'banana', 'cherry'];
      const result = encodeArrayToText(array);
      expect(result).toBe('{apple,banana,cherry}');
    });

    test('should encode array with null values', () => {
      const array = ['apple', null, 'cherry'];
      const result = encodeArrayToText(array);
      expect(result).toBe('{apple,NULL,cherry}');
    });

    test('should encode array with values needing quotes', () => {
      const array = ['hello world', 'comma,value', '"quoted"'];
      const result = encodeArrayToText(array);
      expect(result).toBe('{"hello world","comma,value","\\"quoted\\""}');
    });

    test('should encode empty array', () => {
      const array = [];
      const result = encodeArrayToText(array);
      expect(result).toBe('{}');
    });

    test('should encode numeric array', () => {
      const array = [1, 2, 3, 4, 5];
      const result = encodeArrayToText(array, 'int4');
      expect(result).toBe('{1,2,3,4,5}');
    });

    test('should encode boolean array', () => {
      const array = [true, false, true];
      const result = encodeArrayToText(array, 'bool');
      expect(result).toBe('{true,false,true}');
    });

    test('should encode multidimensional array', () => {
      const array = [
        ['a', 'b'],
        ['c', 'd'],
      ];
      const result = encodeArrayToText(array);
      expect(result).toBe('{{a,b},{c,d}}');
    });

    test('should encode three-dimensional array', () => {
      const array = [
        [
          [1, 2],
          [3, 4],
        ],
        [
          [5, 6],
          [7, 8],
        ],
      ];
      const result = encodeArrayToText(array, 'int4');
      expect(result).toBe('{{{1,2},{3,4}},{{5,6},{7,8}}}');
    });

    test('should handle array with special characters', () => {
      const array = ['test{value}', 'test,value', 'test"value'];
      const result = encodeArrayToText(array);
      expect(result).toBe('{"test{value}","test,value","test\\"value"}');
    });

    test('should handle array with backslashes', () => {
      const array = ['test\\value', 'test\\\\value'];
      const result = encodeArrayToText(array);
      expect(result).toBe('{"test\\\\value","test\\\\\\\\value"}');
    });

    test('should throw error for non-array input', () => {
      expect(() => encodeArrayToText('not an array')).toThrow('Input must be an array');
    });
  });

  describe('parseArrayFromText', () => {
    test('should parse simple string array', () => {
      const arrayText = '{apple,banana,cherry}';
      const result = parseArrayFromText(arrayText);
      expect(result).toEqual(['apple', 'banana', 'cherry']);
    });

    test('should parse array with null values', () => {
      const arrayText = '{apple,NULL,cherry}';
      const result = parseArrayFromText(arrayText);
      expect(result).toEqual(['apple', null, 'cherry']);
    });

    test('should parse array with quoted values', () => {
      const arrayText = '{"hello world","comma,value","\\"quoted\\""}';
      const result = parseArrayFromText(arrayText);
      expect(result).toEqual(['hello world', 'comma,value', '"quoted"']);
    });

    test('should parse empty array', () => {
      const arrayText = '{}';
      const result = parseArrayFromText(arrayText);
      expect(result).toEqual([]);
    });

    test('should parse numeric array', () => {
      const arrayText = '{1,2,3,4,5}';
      const result = parseArrayFromText(arrayText, 'int4');
      expect(result).toEqual([1, 2, 3, 4, 5]);
    });

    test('should parse boolean array', () => {
      const arrayText = '{t,f,true,false}';
      const result = parseArrayFromText(arrayText, 'bool');
      expect(result).toEqual([true, false, true, false]);
    });

    test('should parse float array', () => {
      const arrayText = '{1.5,2.7,3.14}';
      const result = parseArrayFromText(arrayText, 'float8');
      expect(result).toEqual([1.5, 2.7, 3.14]);
    });

    test('should parse multidimensional array', () => {
      const arrayText = '{{a,b},{c,d}}';
      const result = parseArrayFromText(arrayText);
      expect(result).toEqual([
        ['a', 'b'],
        ['c', 'd'],
      ]);
    });

    test('should parse three-dimensional array', () => {
      const arrayText = '{{{1,2},{3,4}},{{5,6},{7,8}}}';
      const result = parseArrayFromText(arrayText, 'int4');
      expect(result).toEqual([
        [
          [1, 2],
          [3, 4],
        ],
        [
          [5, 6],
          [7, 8],
        ],
      ]);
    });

    test('should handle array with escaped quotes', () => {
      const arrayText = '{"test\\"value","another\\"test"}';
      const result = parseArrayFromText(arrayText);
      expect(result).toEqual(['test"value', 'another"test']);
    });

    test('should handle array with escaped backslashes', () => {
      const arrayText = '{"test\\\\value","test\\\\\\\\value"}';
      const result = parseArrayFromText(arrayText);
      expect(result).toEqual(['test\\value', 'test\\\\value']);
    });

    test('should handle bigint values as strings', () => {
      const arrayText = '{9223372036854775807,9223372036854775808}';
      const result = parseArrayFromText(arrayText, 'int8');
      expect(result).toEqual(['9223372036854775807', '9223372036854775808']);
    });

    test('should handle empty string input', () => {
      const result = parseArrayFromText('');
      expect(result).toEqual([]);
    });

    test('should handle whitespace-only input', () => {
      const result = parseArrayFromText('   ');
      expect(result).toEqual([]);
    });

    test('should throw error for invalid array format', () => {
      expect(() => parseArrayFromText('invalid')).toThrow(
        'Invalid array format: missing outer braces',
      );
    });

    test('should throw error for mismatched braces', () => {
      expect(() => parseArrayFromText('{incomplete')).toThrow(
        'Invalid array format: missing outer braces',
      );
    });
  });

  describe('getArrayTypeOID', () => {
    test('should return correct array type OID for base types', () => {
      expect(getArrayTypeOID(DATA_TYPES.INT4)).toBe(DATA_TYPES.INT4_ARRAY);
      expect(getArrayTypeOID(DATA_TYPES.TEXT)).toBe(DATA_TYPES.TEXT_ARRAY);
      expect(getArrayTypeOID(DATA_TYPES.BOOL)).toBe(DATA_TYPES.BOOL_ARRAY);
      expect(getArrayTypeOID(DATA_TYPES.FLOAT8)).toBe(DATA_TYPES.FLOAT8_ARRAY);
      expect(getArrayTypeOID(DATA_TYPES.UUID)).toBe(DATA_TYPES.UUID_ARRAY);
    });

    test('should return null for unknown types', () => {
      expect(getArrayTypeOID(99999)).toBeNull();
    });
  });

  describe('getBaseTypeOID', () => {
    test('should return correct base type OID for array types', () => {
      expect(getBaseTypeOID(DATA_TYPES.INT4_ARRAY)).toBe(DATA_TYPES.INT4);
      expect(getBaseTypeOID(DATA_TYPES.TEXT_ARRAY)).toBe(DATA_TYPES.TEXT);
      expect(getBaseTypeOID(DATA_TYPES.BOOL_ARRAY)).toBe(DATA_TYPES.BOOL);
      expect(getBaseTypeOID(DATA_TYPES.FLOAT8_ARRAY)).toBe(DATA_TYPES.FLOAT8);
      expect(getBaseTypeOID(DATA_TYPES.UUID_ARRAY)).toBe(DATA_TYPES.UUID);
    });

    test('should return null for non-array types', () => {
      expect(getBaseTypeOID(DATA_TYPES.INT4)).toBeNull();
      expect(getBaseTypeOID(DATA_TYPES.TEXT)).toBeNull();
      expect(getBaseTypeOID(99999)).toBeNull();
    });
  });

  describe('isArrayType', () => {
    test('should return true for array types', () => {
      expect(isArrayType(DATA_TYPES.INT4_ARRAY)).toBe(true);
      expect(isArrayType(DATA_TYPES.TEXT_ARRAY)).toBe(true);
      expect(isArrayType(DATA_TYPES.BOOL_ARRAY)).toBe(true);
      expect(isArrayType(DATA_TYPES.FLOAT8_ARRAY)).toBe(true);
      expect(isArrayType(DATA_TYPES.UUID_ARRAY)).toBe(true);
    });

    test('should return false for non-array types', () => {
      expect(isArrayType(DATA_TYPES.INT4)).toBe(false);
      expect(isArrayType(DATA_TYPES.TEXT)).toBe(false);
      expect(isArrayType(DATA_TYPES.BOOL)).toBe(false);
      expect(isArrayType(DATA_TYPES.FLOAT8)).toBe(false);
      expect(isArrayType(DATA_TYPES.UUID)).toBe(false);
      expect(isArrayType(99999)).toBe(false);
    });
  });

  describe('round-trip encoding/parsing', () => {
    test('should maintain data integrity for simple arrays', () => {
      const original = ['apple', 'banana', 'cherry'];
      const encoded = encodeArrayToText(original);
      const parsed = parseArrayFromText(encoded);
      expect(parsed).toEqual(original);
    });

    test('should maintain data integrity for numeric arrays', () => {
      const original = [1, 2, 3, 4, 5];
      const encoded = encodeArrayToText(original, 'int4');
      const parsed = parseArrayFromText(encoded, 'int4');
      expect(parsed).toEqual(original);
    });

    test('should maintain data integrity for boolean arrays', () => {
      const original = [true, false, true];
      const encoded = encodeArrayToText(original, 'bool');
      const parsed = parseArrayFromText(encoded, 'bool');
      expect(parsed).toEqual(original);
    });

    test('should maintain data integrity for arrays with null values', () => {
      const original = ['apple', null, 'cherry', null];
      const encoded = encodeArrayToText(original);
      const parsed = parseArrayFromText(encoded);
      expect(parsed).toEqual(original);
    });

    test('should maintain data integrity for multidimensional arrays', () => {
      const original = [
        ['a', 'b'],
        ['c', 'd'],
        ['e', 'f'],
      ];
      const encoded = encodeArrayToText(original);
      const parsed = parseArrayFromText(encoded);
      expect(parsed).toEqual(original);
    });

    test('should maintain data integrity for arrays with special characters', () => {
      const original = ['hello world', 'comma,value', '"quoted"', 'back\\slash'];
      const encoded = encodeArrayToText(original);
      const parsed = parseArrayFromText(encoded);
      expect(parsed).toEqual(original);
    });

    test('should maintain data integrity for empty arrays', () => {
      const original = [];
      const encoded = encodeArrayToText(original);
      const parsed = parseArrayFromText(encoded);
      expect(parsed).toEqual(original);
    });
  });
});
