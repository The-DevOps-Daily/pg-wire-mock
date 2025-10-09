#!/usr/bin/env node

/**
 * Custom Data Types Demo
 *
 * This example demonstrates how to define and use custom data types
 * with pg-wire-mock for testing application-specific data handling.
 */

const { registerCustomType, loadConfig } = require('../src/config/serverConfig');

// Load the default server configuration
const config = loadConfig();

// Example 1: Email type with validation and formatting
console.log('Registering Email custom type...');
registerCustomType(
  {
    name: 'email',
    oid: 100001,
    encode: value => {
      // Validate email format
      if (typeof value !== 'string' || !value.includes('@')) {
        throw new Error('Invalid email format');
      }
      return value.toLowerCase().trim();
    },
    decode: text => {
      // Return email as-is from database
      return text;
    },
    typlen: 256, // Maximum length for email
    typtype: 'b', // Base type
  },
  config
);

// Example 2: Phone number type with formatting
console.log('Registering PhoneNumber custom type...');
registerCustomType(
  {
    name: 'phone_number',
    oid: 100002,
    encode: value => {
      // Remove all non-digits and format
      const digits = String(value).replace(/\D/g, '');
      if (digits.length !== 10 && digits.length !== 11) {
        throw new Error('Phone number must be 10 or 11 digits');
      }
      return digits;
    },
    decode: text => {
      // Format as (xxx) xxx-xxxx
      if (text.length === 10) {
        return `(${text.slice(0, 3)}) ${text.slice(3, 6)}-${text.slice(6)}`;
      } else if (text.length === 11) {
        return `+${text.slice(0, 1)} (${text.slice(1, 4)}) ${text.slice(4, 7)}-${text.slice(7)}`;
      }
      return text;
    },
    typlen: 15,
    typtype: 'b',
  },
  config
);

// Example 3: JSON Array type for storing structured data
console.log('Registering JSONArray custom type...');
registerCustomType(
  {
    name: 'json_array',
    oid: 100003,
    encode: value => {
      if (!Array.isArray(value)) {
        throw new Error('Value must be an array');
      }
      return JSON.stringify(value);
    },
    decode: text => {
      try {
        const parsed = JSON.parse(text);
        if (!Array.isArray(parsed)) {
          throw new Error('Stored value is not an array');
        }
        return parsed;
      } catch (error) {
        throw new Error(`Invalid JSON array: ${error.message}`);
      }
    },
    typlen: -1, // Variable length
    typtype: 'b',
  },
  config
);

// Example 4: Money type with currency formatting
console.log('Registering Money custom type...');
registerCustomType(
  {
    name: 'money',
    oid: 100004,
    encode: value => {
      // Convert to cents (integer) for storage
      let amount;
      if (typeof value === 'string') {
        // Remove currency symbols and parse
        amount = parseFloat(value.replace(/[$,\s]/g, ''));
      } else if (typeof value === 'number') {
        amount = value;
      } else {
        throw new Error('Money value must be a string or number');
      }

      if (isNaN(amount)) {
        throw new Error('Invalid money amount');
      }

      // Store as cents (multiply by 100 and round)
      return Math.round(amount * 100).toString();
    },
    decode: text => {
      // Convert from cents back to dollars
      const cents = parseInt(text, 10);
      if (isNaN(cents)) {
        throw new Error('Invalid stored money value');
      }

      const dollars = cents / 100;
      return `$${dollars.toFixed(2)}`;
    },
    typlen: 8, // 64-bit integer storage
    typtype: 'b',
  },
  config
);

// Example 5: UUID type with validation and formatting
console.log('Registering CustomUUID custom type...');
registerCustomType(
  {
    name: 'custom_uuid',
    oid: 100005,
    encode: value => {
      // Validate UUID format
      const uuidRegex =
        /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
      const cleanValue = String(value).toLowerCase().trim();

      if (!uuidRegex.test(cleanValue)) {
        throw new Error('Invalid UUID format');
      }

      return cleanValue;
    },
    decode: text => {
      // Return UUID in uppercase format
      return text.toUpperCase();
    },
    typlen: 36, // Fixed length for UUID string
    typtype: 'b',
  },
  config
);

// Demo usage examples
console.log('\n=== Custom Types Demo ===\n');

// Test the custom types
const examples = [
  {
    type: 'email',
    oid: 100001,
    testValues: [
      'USER@EXAMPLE.COM',
      '  test@domain.org  ',
      'valid.email+tag@subdomain.example.com',
    ],
    invalidValues: ['invalid-email', '@domain.com', 'user@'],
  },
  {
    type: 'phone_number',
    oid: 100002,
    testValues: ['(555) 123-4567', '555-123-4567', '15551234567', '5551234567'],
    invalidValues: ['123', '12345678901234', 'abc-def-ghij'],
  },
  {
    type: 'json_array',
    oid: 100003,
    testValues: [
      [1, 2, 3],
      ['a', 'b', 'c'],
      [
        { id: 1, name: 'test' },
        { id: 2, name: 'test2' },
      ],
      [],
    ],
    invalidValues: ['not an array', { key: 'value' }, 123],
  },
  {
    type: 'money',
    oid: 100004,
    testValues: ['$1,234.56', '99.99', 123.45, '0.01'],
    invalidValues: ['not a number', '$abc.def', {}],
  },
  {
    type: 'custom_uuid',
    oid: 100005,
    testValues: [
      '550e8400-e29b-41d4-a716-446655440000',
      '6ba7b810-9dad-11d1-80b4-00c04fd430c8',
      'f47ac10b-58cc-4372-a567-0e02b2c3d479',
    ],
    invalidValues: [
      'invalid-uuid',
      '550e8400-e29b-41d4-a716',
      '550e8400-e29b-41d4-a716-446655440000-extra',
    ],
  },
];

// Import the utility functions for testing
const { encodeCustomType, decodeCustomType, getTypeName } = require('../src/protocol/utils');

examples.forEach(({ type, oid, testValues, invalidValues }) => {
  console.log(`--- Testing ${type} type (OID: ${oid}) ---`);

  // Test valid values
  console.log('✅ Valid values:');
  testValues.forEach(value => {
    try {
      const encoded = encodeCustomType(value, oid, config);
      const decoded = decodeCustomType(encoded, oid, config);
      console.log(`  Input: ${JSON.stringify(value)}`);
      console.log(`  Encoded: ${encoded}`);
      console.log(`  Decoded: ${JSON.stringify(decoded)}`);
      console.log();
    } catch (error) {
      console.log(`  ❌ Error with ${JSON.stringify(value)}: ${error.message}`);
    }
  });

  // Test invalid values
  console.log('❌ Invalid values:');
  invalidValues.forEach(value => {
    try {
      const encoded = encodeCustomType(value, oid, config);
      console.log(`  ⚠️  Expected error for ${JSON.stringify(value)}, but got: ${encoded}`);
    } catch (error) {
      console.log(`  ✅ Correctly rejected ${JSON.stringify(value)}: ${error.message}`);
    }
  });

  // Test type name resolution
  console.log(`Type name for OID ${oid}: ${getTypeName(oid, config)}`);
  console.log();
});

// Demonstrate integration with query handlers
console.log('=== Query Handler Integration ===\n');

const { getTypeOIDFromName, handlePgType } = require('../src/handlers/queryHandlers');

// Test type name to OID resolution
const typeNames = [
  'email',
  'phone_number',
  'json_array',
  'money',
  'custom_uuid',
  'text',
  'nonexistent',
];
typeNames.forEach(name => {
  const oid = getTypeOIDFromName(name, config);
  console.log(`Type "${name}" -> OID: ${oid}`);
});

console.log();

// Test pg_type query handler
console.log('pg_catalog.pg_type query result:');
const pgTypeResult = handlePgType('SELECT * FROM pg_type', null, config);

console.log(`Found ${pgTypeResult.rowCount} types:`);
pgTypeResult.rows.forEach(row => {
  const [oid, typname, , typlen, typtype] = row;
  if (parseInt(oid) >= 100000) {
    // Custom types
    console.log(`  🔧 ${typname} (OID: ${oid}, len: ${typlen}, type: ${typtype})`);
  }
});

console.log('\n=== Demo Complete ===');
console.log('Custom types are now registered and ready for use!');
console.log(
  'You can use these types in your PostgreSQL queries when connecting to the mock server.'
);
