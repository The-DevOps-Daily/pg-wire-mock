# Custom Data Types Support

This document provides comprehensive information about custom data types support in pg-wire-mock.

## Overview

pg-wire-mock supports custom data types, allowing you to define application-specific data types for testing PostgreSQL applications that use custom types, enums, or domain types. This feature enables you to simulate real-world PostgreSQL environments where custom types are commonly used.

## Features

- **Custom Type Registration**: Define custom types with unique OIDs, names, and encoding/decoding functions
- **Type Catalog Integration**: Custom types appear in `pg_catalog.pg_type` queries
- **Query Handler Support**: Automatic type resolution in SQL queries
- **Encoding/Decoding**: Custom serialization and deserialization functions
- **Validation**: Built-in validation for type definitions and data integrity
- **Protocol Integration**: Seamless integration with PostgreSQL wire protocol

## API Reference

### Core Functions

#### `registerCustomType(typeConfig, config)`

Registers a new custom data type.

**Parameters:**

- `typeConfig` (Object): Custom type configuration
  - `name` (string): Type name (must be unique, case-insensitive)
  - `oid` (number): PostgreSQL type OID (must be >= 100000)
  - `encode` (function): Function to encode values to text format
  - `decode` (function): Function to decode values from text format
  - `typlen` (number, optional): Type length (-1 for variable length, default: -1)
  - `typtype` (string, optional): Type category ('b' for base type, default: 'b')
- `config` (Object): Server configuration object

**Example:**

```javascript
const { registerCustomType, loadConfig } = require('./src/config/serverConfig');

const config = loadConfig();

registerCustomType(
  {
    name: 'email',
    oid: 100001,
    encode: value => {
      // Validate and format email
      if (!value.includes('@')) {
        throw new Error('Invalid email format');
      }
      return value.toLowerCase().trim();
    },
    decode: text => {
      return text;
    },
    typlen: 256,
    typtype: 'b',
  },
  config
);
```

#### `getCustomType(oid, config)`

Retrieves a custom type by its OID.

**Parameters:**

- `oid` (number): Type OID
- `config` (Object): Server configuration

**Returns:** Custom type object or `null` if not found

#### `getCustomTypeByName(name, config)`

Retrieves a custom type by its name.

**Parameters:**

- `name` (string): Type name (case-insensitive)
- `config` (Object): Server configuration

**Returns:** Custom type object or `null` if not found

#### `getAllCustomTypes(config)`

Gets all registered custom types.

**Parameters:**

- `config` (Object): Server configuration

**Returns:** Array of custom type objects

### Protocol Utilities

#### `encodeCustomType(value, typeOID, config)`

Encodes a value using the custom type's encoder.

**Parameters:**

- `value` (any): Value to encode
- `typeOID` (number): Custom type OID
- `config` (Object): Server configuration

**Returns:** Encoded string representation

#### `decodeCustomType(text, typeOID, config)`

Decodes a value using the custom type's decoder.

**Parameters:**

- `text` (string): Text representation to decode
- `typeOID` (number): Custom type OID
- `config` (Object): Server configuration

**Returns:** Decoded value

#### `isCustomType(typeOID, config)`

Checks if a type OID represents a custom type.

**Parameters:**

- `typeOID` (number): Type OID to check
- `config` (Object): Server configuration

**Returns:** Boolean indicating if it's a custom type

#### `getTypeName(typeOID, config)`

Gets the type name for a given OID (including custom types).

**Parameters:**

- `typeOID` (number): Type OID
- `config` (Object): Server configuration

**Returns:** Type name or 'unknown'

## Usage Examples

### Basic Custom Type

```javascript
const { registerCustomType, loadConfig } = require('./src/config/serverConfig');

const config = loadConfig();

// Simple string-based custom type
registerCustomType(
  {
    name: 'status',
    oid: 100001,
    encode: value => {
      const validStatuses = ['active', 'inactive', 'pending'];
      if (!validStatuses.includes(value)) {
        throw new Error(`Invalid status: ${value}`);
      }
      return value;
    },
    decode: text => text,
  },
  config
);
```

### Complex Data Type

```javascript
// JSON object type with validation
registerCustomType(
  {
    name: 'user_profile',
    oid: 100002,
    encode: value => {
      if (typeof value !== 'object' || !value.id || !value.name) {
        throw new Error('User profile must have id and name');
      }
      return JSON.stringify(value);
    },
    decode: text => {
      try {
        const profile = JSON.parse(text);
        if (!profile.id || !profile.name) {
          throw new Error('Invalid user profile format');
        }
        return profile;
      } catch (error) {
        throw new Error(`Invalid user profile: ${error.message}`);
      }
    },
    typlen: -1, // Variable length
  },
  config
);
```

### Money Type with Precision

```javascript
// Money type storing cents as integers
registerCustomType(
  {
    name: 'money',
    oid: 100003,
    encode: value => {
      let amount = typeof value === 'string' ? parseFloat(value.replace(/[$,\s]/g, '')) : value;

      if (isNaN(amount)) {
        throw new Error('Invalid money amount');
      }

      // Store as cents
      return Math.round(amount * 100).toString();
    },
    decode: text => {
      const cents = parseInt(text, 10);
      return `$${(cents / 100).toFixed(2)}`;
    },
    typlen: 8,
  },
  config
);
```

### Using Custom Types in Queries

Once registered, custom types can be used in SQL queries:

```sql
-- Create table with custom types
CREATE TABLE users (
  id int4,
  email email,
  status status,
  profile user_profile,
  balance money
);

-- Insert data
INSERT INTO users VALUES (
  1,
  'user@example.com'::email,
  'active'::status,
  '{"id": 1, "name": "John Doe", "age": 30}'::user_profile,
  '$1,234.56'::money
);

-- Query with custom types
SELECT * FROM users WHERE status = 'active'::status;
```

## Type Catalog Integration

Custom types automatically appear in PostgreSQL system catalogs:

```sql
-- View all types including custom ones
SELECT oid, typname, typlen, typtype
FROM pg_catalog.pg_type
WHERE oid >= 100000;

-- Query specific custom type
SELECT * FROM pg_catalog.pg_type
WHERE typname = 'email';
```

## Advanced Features

### Type Validation

Custom types support comprehensive validation:

```javascript
registerCustomType(
  {
    name: 'email',
    oid: 100001,
    encode: value => {
      // Comprehensive email validation
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

      if (typeof value !== 'string') {
        throw new Error('Email must be a string');
      }

      const trimmed = value.trim().toLowerCase();

      if (!emailRegex.test(trimmed)) {
        throw new Error('Invalid email format');
      }

      if (trimmed.length > 254) {
        throw new Error('Email too long (max 254 characters)');
      }

      return trimmed;
    },
    decode: text => text,
    typlen: 254,
  },
  config
);
```

### Data Transformation

Custom types can transform data during encoding/decoding:

```javascript
registerCustomType(
  {
    name: 'phone_number',
    oid: 100002,
    encode: value => {
      // Store only digits
      const digits = String(value).replace(/\D/g, '');
      if (digits.length !== 10 && digits.length !== 11) {
        throw new Error('Invalid phone number length');
      }
      return digits;
    },
    decode: text => {
      // Format for display
      if (text.length === 10) {
        return `(${text.slice(0, 3)}) ${text.slice(3, 6)}-${text.slice(6)}`;
      }
      return `+${text.slice(0, 1)} (${text.slice(1, 4)}) ${text.slice(4, 7)}-${text.slice(7)}`;
    },
    typlen: 15,
  },
  config
);
```

### Array Types

Custom types work with PostgreSQL arrays:

```javascript
// The base custom type
registerCustomType(
  {
    name: 'rgb_color',
    oid: 100003,
    encode: value => {
      const [r, g, b] = value;
      if (!Array.isArray(value) || value.length !== 3) {
        throw new Error('RGB color must be [r, g, b] array');
      }
      if (value.some(v => v < 0 || v > 255)) {
        throw new Error('RGB values must be 0-255');
      }
      return `${r},${g},${b}`;
    },
    decode: text => {
      const parts = text.split(',').map(Number);
      return parts;
    },
    typlen: 12,
  },
  config
);

// Use in arrays
const colors = [
  [255, 0, 0], // Red
  [0, 255, 0], // Green
  [0, 0, 255], // Blue
];
```

## Testing

### Unit Tests

Write tests for your custom type encoders/decoders:

```javascript
describe('Email Custom Type', () => {
  test('should encode valid emails', () => {
    const result = encodeCustomType('USER@EXAMPLE.COM', 100001, config);
    expect(result).toBe('user@example.com');
  });

  test('should reject invalid emails', () => {
    expect(() => {
      encodeCustomType('invalid-email', 100001, config);
    }).toThrow('Invalid email format');
  });

  test('should round-trip correctly', () => {
    const original = 'test@example.com';
    const encoded = encodeCustomType(original, 100001, config);
    const decoded = decodeCustomType(encoded, 100001, config);
    expect(decoded).toBe(original);
  });
});
```

### Integration Tests

Test custom types with query handlers:

```javascript
describe('Custom Type Integration', () => {
  test('should appear in pg_type catalog', () => {
    const result = handlePgType('SELECT * FROM pg_type', null, config);
    const customTypes = result.rows.filter(row => parseInt(row[0]) >= 100000);
    expect(customTypes).toHaveLength(1);
    expect(customTypes[0][1]).toBe('email'); // typname
  });

  test('should resolve type names correctly', () => {
    expect(getTypeOIDFromName('email', config)).toBe(100001);
    expect(getTypeName(100001, config)).toBe('email');
  });
});
```

## Performance Considerations

### Memory Usage

- Custom types are stored in memory
- Encoder/decoder functions are kept in memory for the server lifetime
- Large numbers of custom types may impact memory usage

### Encoding Performance

- Keep encoder/decoder functions lightweight
- Avoid complex validations in high-throughput scenarios
- Consider caching for expensive computations

### Type Resolution

- Type name to OID resolution is O(n) for custom types
- OID to type resolution is O(1)
- Cache frequently-used type lookups if needed

## Error Handling

### Validation Errors

```javascript
registerCustomType(
  {
    name: 'safe_string',
    oid: 100001,
    encode: value => {
      if (typeof value !== 'string') {
        throw new Error('Value must be a string');
      }

      if (value.length > 1000) {
        throw new Error('String too long (max 1000 characters)');
      }

      // Remove potentially dangerous characters
      return value.replace(/[<>'"&]/g, '');
    },
    decode: text => text,
  },
  config
);
```

### Graceful Degradation

```javascript
registerCustomType(
  {
    name: 'fallback_type',
    oid: 100001,
    encode: value => {
      try {
        return JSON.stringify(value);
      } catch (error) {
        // Fallback to string representation
        return String(value);
      }
    },
    decode: text => {
      try {
        return JSON.parse(text);
      } catch (error) {
        // Return as string if JSON parsing fails
        return text;
      }
    },
  },
  config
);
```

## Best Practices

### Type Design

1. **Keep it Simple**: Start with simple encode/decode functions
2. **Validate Early**: Validate inputs in the encode function
3. **Handle Edge Cases**: Consider null, undefined, empty values
4. **Document Behavior**: Document expected input/output formats

### OID Management

1. **Use High OIDs**: Start custom OIDs at 100000+ to avoid conflicts
2. **Be Consistent**: Use a consistent OID range for your application
3. **Document OIDs**: Keep track of assigned OIDs to avoid duplicates

### Error Messages

1. **Be Specific**: Provide clear, actionable error messages
2. **Include Context**: Mention the type name in error messages
3. **Validate Input**: Check types and ranges before processing

### Testing

1. **Test Round-trips**: Ensure encode/decode cycles preserve data
2. **Test Edge Cases**: Test with null, empty, and boundary values
3. **Test Errors**: Verify that invalid inputs are rejected properly
4. **Integration Tests**: Test with actual query scenarios

## Migration Guide

### From Standard Types

If migrating from standard PostgreSQL types to custom types:

```sql
-- Before: Using standard text
CREATE TABLE users (id int4, status text);
INSERT INTO users VALUES (1, 'active');

-- After: Using custom status type
CREATE TABLE users (id int4, status status_type);
INSERT INTO users VALUES (1, 'active'::status_type);
```

### Adding Validation

```javascript
// Start simple
registerCustomType(
  {
    name: 'status',
    oid: 100001,
    encode: value => value,
    decode: text => text,
  },
  config
);

// Add validation later
registerCustomType(
  {
    name: 'status',
    oid: 100001,
    encode: value => {
      const valid = ['active', 'inactive', 'pending'];
      if (!valid.includes(value)) {
        throw new Error(`Invalid status: ${value}`);
      }
      return value;
    },
    decode: text => text,
  },
  config
);
```

## Troubleshooting

### Common Issues

**Issue: "Unknown custom type OID"**

```
Error: Unknown custom type OID: 100001
```

**Solution**: Ensure the custom type is registered before use.

**Issue: "Custom type name already registered"**

```
Error: Custom type name 'email' is already registered
```

**Solution**: Use a different name or check for existing registrations.

**Issue: "OID must be >= 100000"**

```
Error: Custom type must have a unique OID >= 100000
```

**Solution**: Use OIDs 100000 or higher to avoid conflicts with PostgreSQL built-in types.

### Debug Mode

Enable debug logging to see custom type operations:

```bash
PG_MOCK_LOG_LEVEL=debug npm start
```

This will show:

- Type registration details
- Encode/decode operations
- Type resolution steps
- Query handler integration

## Examples

See `examples/custom-types-demo.js` for comprehensive examples including:

- Email validation and formatting
- Phone number normalization
- JSON object validation
- Money type with currency handling
- UUID validation and formatting

## Contributing

To contribute to custom types support:

1. **New Features**: Add new functionality to `src/config/serverConfig.js`
2. **Protocol Support**: Extend `src/protocol/utils.js`
3. **Query Integration**: Update `src/handlers/queryHandlers.js`
4. **Test Coverage**: Add tests to `__tests__/*/customTypes.test.js`

See [CONTRIBUTING.md](../CONTRIBUTING.md) for general contribution guidelines.

## Standards Compliance

This implementation follows:

- **PostgreSQL Type System**: Compatible with PostgreSQL type concepts
- **Wire Protocol v3.0**: Full protocol compliance for custom types
- **Type Catalog Standards**: Proper pg_catalog.pg_type integration
- **SQL Standards**: Compatible with CREATE TYPE concepts

---

For more information, see:

- [PostgreSQL Type System Documentation](https://www.postgresql.org/docs/current/extend-type-system.html)
- [CREATE TYPE Documentation](https://www.postgresql.org/docs/current/sql-createtype.html)
- [Project README](../README.md)
