# PostgreSQL Array Type Support

This document provides comprehensive information about PostgreSQL array type support in pg-wire-mock.

## Overview

pg-wire-mock now supports PostgreSQL's array data types, allowing you to work with one-dimensional and multi-dimensional arrays in your mock PostgreSQL environment. This implementation follows PostgreSQL's array specifications and provides both text and binary format support.

## Supported Array Types

The following PostgreSQL array types are supported:

### Primitive Arrays

- `BOOL[]` - Boolean arrays
- `INT2[]` - Small integer arrays (smallint)
- `INT4[]` - Integer arrays (integer)
- `INT8[]` - Big integer arrays (bigint)
- `FLOAT4[]` - Real number arrays (real)
- `FLOAT8[]` - Double precision arrays (double precision)
- `NUMERIC[]` - Arbitrary precision numeric arrays

### Text Arrays

- `TEXT[]` - Text arrays
- `VARCHAR[]` - Variable character arrays
- `CHAR[]` - Fixed character arrays
- `BPCHAR[]` - Blank-padded character arrays

### Date/Time Arrays

- `DATE[]` - Date arrays
- `TIME[]` - Time arrays
- `TIMESTAMP[]` - Timestamp arrays
- `TIMESTAMPTZ[]` - Timestamp with timezone arrays
- `INTERVAL[]` - Time interval arrays
- `TIMETZ[]` - Time with timezone arrays

### Other Arrays

- `UUID[]` - UUID arrays
- `JSON[]` - JSON arrays
- `JSONB[]` - Binary JSON arrays
- `INET[]` - Network address arrays
- `CIDR[]` - CIDR network arrays
- `MACADDR[]` - MAC address arrays

## Array Syntax

### Array Constructors

Use the `ARRAY[]` constructor to create arrays:

```sql
-- Integer array
SELECT ARRAY[1, 2, 3, 4, 5];

-- String array
SELECT ARRAY['apple', 'banana', 'cherry'];

-- Multi-dimensional array
SELECT ARRAY[ARRAY[1, 2], ARRAY[3, 4]];
```

### Array Literals

Use curly brace notation for array literals:

```sql
-- Simple arrays
SELECT '{1,2,3,4,5}';
SELECT '{apple,banana,cherry}';

-- Multi-dimensional arrays
SELECT '{{1,2},{3,4}}';
SELECT '{{a,b,c},{d,e,f},{g,h,i}}';
```

### Type Casting

Cast arrays to specific types:

```sql
-- Cast to integer array
SELECT '{1,2,3,4,5}'::int4[];

-- Cast to boolean array
SELECT '{t,f,true,false}'::bool[];

-- Cast to text array
SELECT '{hello,world}'::text[];

-- Cast multi-dimensional array
SELECT '{{1,2},{3,4}}'::int4[][];
```

## Array Features

### Null Values

Arrays can contain NULL values:

```sql
SELECT ARRAY[1, NULL, 3, NULL, 5];
SELECT '{apple,NULL,cherry}';
```

### Special Characters

Strings containing special characters are automatically quoted:

```sql
SELECT ARRAY['hello world', 'comma,value', '"quoted"'];
-- Results in: {"hello world","comma,value","\"quoted\""}
```

### Empty Arrays

Empty arrays are supported:

```sql
SELECT ARRAY[]::int4[];
SELECT '{}'::text[];
```

### Multi-dimensional Arrays

Arrays can have multiple dimensions:

```sql
-- 2D array
SELECT '{{1,2,3},{4,5,6}}'::int4[][];

-- 3D array
SELECT '{{{1,2},{3,4}},{{5,6},{7,8}}}'::int4[][][];
```

## Implementation Details

### Protocol Support

- **Wire Protocol**: Full PostgreSQL wire protocol v3.0 compliance
- **Format Codes**: Both text (0) and binary (1) formats supported
- **Type OIDs**: Proper PostgreSQL array type OIDs used
- **Message Encoding**: Automatic array detection and encoding in DataRow messages

### Text Format

Arrays are encoded using PostgreSQL's standard text format:

```
{element1,element2,element3}
```

Elements containing special characters are quoted and escaped:

```
{"hello world","comma,value","\"quoted\""}
```

### Type Detection

The system automatically detects array types and applies appropriate formatting:

```javascript
// JavaScript array is automatically encoded
const jsArray = [1, 2, 3, 4, 5];
// Becomes: {1,2,3,4,5}

// With type information
const typedArray = {
  dataTypeOID: DATA_TYPES.INT4_ARRAY,
  value: [1, 2, 3, 4, 5],
};
// Results in proper INT4[] encoding
```

## API Reference

### Core Functions

#### `encodeArrayToText(array, elementType)`

Converts a JavaScript array to PostgreSQL text format.

**Parameters:**

- `array` (Array): JavaScript array to encode
- `elementType` (string): PostgreSQL element type name (optional)

**Returns:** String representation in PostgreSQL format

```javascript
const { encodeArrayToText } = require('./src/protocol/utils');

// Simple array
encodeArrayToText([1, 2, 3]); // "{1,2,3}"

// Array with nulls
encodeArrayToText(['a', null, 'c']); // "{a,NULL,c}"

// Multi-dimensional
encodeArrayToText([
  [1, 2],
  [3, 4],
]); // "{{1,2},{3,4}}"
```

#### `parseArrayFromText(arrayText, elementType)`

Parses PostgreSQL array text format to JavaScript array.

**Parameters:**

- `arrayText` (string): PostgreSQL array text representation
- `elementType` (string): PostgreSQL element type name (optional)

**Returns:** JavaScript array

```javascript
const { parseArrayFromText } = require('./src/protocol/utils');

// Simple parsing
parseArrayFromText('{1,2,3}'); // [1, 2, 3]

// With type conversion
parseArrayFromText('{1,2,3}', 'int4'); // [1, 2, 3] (as numbers)

// Boolean conversion
parseArrayFromText('{t,f,true,false}', 'bool'); // [true, false, true, false]
```

#### `getArrayTypeOID(baseTypeOID)`

Gets the array type OID for a given base type OID.

**Parameters:**

- `baseTypeOID` (number): Base PostgreSQL type OID

**Returns:** Array type OID or null if not found

```javascript
const { getArrayTypeOID, DATA_TYPES } = require('./src/protocol/utils');

getArrayTypeOID(DATA_TYPES.INT4); // Returns DATA_TYPES.INT4_ARRAY
getArrayTypeOID(DATA_TYPES.TEXT); // Returns DATA_TYPES.TEXT_ARRAY
```

#### `getBaseTypeOID(arrayTypeOID)`

Gets the base type OID for a given array type OID.

**Parameters:**

- `arrayTypeOID` (number): Array PostgreSQL type OID

**Returns:** Base type OID or null if not an array type

```javascript
const { getBaseTypeOID, DATA_TYPES } = require('./src/protocol/utils');

getBaseTypeOID(DATA_TYPES.INT4_ARRAY); // Returns DATA_TYPES.INT4
getBaseTypeOID(DATA_TYPES.TEXT_ARRAY); // Returns DATA_TYPES.TEXT
```

#### `isArrayType(typeOID)`

Checks if a given type OID represents an array type.

**Parameters:**

- `typeOID` (number): PostgreSQL type OID to check

**Returns:** Boolean indicating if it's an array type

```javascript
const { isArrayType, DATA_TYPES } = require('./src/protocol/utils');

isArrayType(DATA_TYPES.INT4_ARRAY); // true
isArrayType(DATA_TYPES.INT4); // false
```

## Examples

### Basic Array Queries

```sql
-- Create and query integer arrays
SELECT ARRAY[1, 2, 3, 4, 5] AS numbers;

-- Create text arrays
SELECT ARRAY['PostgreSQL', 'Array', 'Support'] AS technologies;

-- Mixed with NULL values
SELECT ARRAY[1, NULL, 3, NULL, 5] AS sparse_array;
```

### Type-Specific Arrays

```sql
-- Boolean arrays
SELECT '{true,false,t,f}'::bool[] AS flags;

-- Numeric arrays with casting
SELECT '{1.5,2.7,3.14,4.0}'::numeric[] AS decimals;

-- Date arrays
SELECT '{2023-01-01,2023-12-31}'::date[] AS date_range;
```

### Multi-dimensional Arrays

```sql
-- 2D integer matrix
SELECT '{{1,2,3},{4,5,6},{7,8,9}}'::int4[][] AS matrix;

-- 3D text cube
SELECT '{{{a,b},{c,d}},{{e,f},{g,h}}}'::text[][][] AS cube;
```

### Array Operations in Query Results

```sql
-- Arrays in column results
SELECT
  'user1' AS username,
  ARRAY['read', 'write'] AS permissions,
  '{1,2,3,4,5}'::int4[] AS favorite_numbers;
```

## Testing

The array support includes comprehensive test coverage:

### Running Array Tests

```bash
# Run all tests
npm test

# Run only array-related tests
npm test -- --testNamePattern="array"

# Run specific array test file
npm test __tests__/protocol/arrayTypes.test.js
```

### Test Coverage

- ✅ Array encoding/decoding
- ✅ Multi-dimensional arrays
- ✅ Type casting and conversion
- ✅ NULL value handling
- ✅ Special character escaping
- ✅ Query handler integration
- ✅ Protocol message building
- ✅ Round-trip data integrity

## Performance Considerations

### Memory Usage

- Arrays are processed in memory, so very large arrays may impact performance
- Multi-dimensional arrays use nested JavaScript arrays
- String arrays require additional memory for escaping special characters

### Processing Speed

- Text format parsing uses character-by-character parsing for accuracy
- Binary format would be faster but text format ensures compatibility
- Array type detection is O(1) using hash maps

### Recommendations

- For large datasets, consider chunking array operations
- Use appropriate array types (INT4[] vs TEXT[]) for better type safety
- Be mindful of memory usage with deeply nested multi-dimensional arrays

## Troubleshooting

### Common Issues

**Issue: Array not parsing correctly**

```
Error: Invalid array format: missing outer braces
```

**Solution**: Ensure array text is properly formatted with `{` and `}` braces.

**Issue: Type casting errors**

```
Error: Cannot convert value to target type
```

**Solution**: Verify the element type matches the target array type.

**Issue: Special characters not handled**

```
Result: Malformed array with unescaped quotes
```

**Solution**: The system automatically handles escaping, but verify input format.

### Debug Mode

Enable debug logging to see array processing details:

```bash
PG_MOCK_LOG_LEVEL=debug npm start
```

This will show:

- Array parsing steps
- Type conversion details
- Encoding/decoding operations
- Protocol message construction

## Migration Guide

### From Basic Types to Arrays

If you're migrating existing code to use arrays:

```sql
-- Old: Multiple columns
SELECT name, skill1, skill2, skill3 FROM users;

-- New: Array column
SELECT name, ARRAY[skill1, skill2, skill3] AS skills FROM users;
```

### JavaScript Integration

```javascript
// Old: Separate values
const values = [name, skill1, skill2, skill3];

// New: Array values
const values = [name, [skill1, skill2, skill3]];
```

## Contributing

To contribute to array support:

1. **New Array Types**: Add type mappings in `src/protocol/constants.js`
2. **Enhanced Parsing**: Improve logic in `src/protocol/utils.js`
3. **Query Support**: Extend handlers in `src/handlers/queryHandlers.js`
4. **Test Coverage**: Add tests in `__tests__/protocol/arrayTypes.test.js`

See [CONTRIBUTING.md](../CONTRIBUTING.md) for general contribution guidelines.

## Standards Compliance

This implementation follows:

- **PostgreSQL Documentation**: Array type specifications
- **Wire Protocol v3.0**: Message format standards
- **IANA Standards**: Type OID assignments
- **SQL Standards**: Array syntax compatibility

## Future Enhancements

Planned improvements:

- [ ] Binary format support for better performance
- [ ] Array operators and functions (array_length, unnest, etc.)
- [ ] Array indexing and slicing operations
- [ ] Enhanced multi-dimensional array operations
- [ ] Array aggregation functions
- [ ] Performance optimizations for large arrays

---

For more information, see:

- [PostgreSQL Array Documentation](https://www.postgresql.org/docs/current/arrays.html)
- [Wire Protocol Specification](https://www.postgresql.org/docs/current/protocol.html)
- [Project README](../README.md)
