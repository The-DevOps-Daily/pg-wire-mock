/**
 * PostgreSQL Wire Protocol Utility Functions
 * Helper functions for buffer operations, message parsing, and protocol utilities
 */

/**
 * Reads a null-terminated string from a buffer starting at offset
 * @param {Buffer} buffer - The buffer to read from
 * @param {number} offset - Starting position
 * @returns {Object} {value: string, newOffset: number}
 */
function readCString(buffer, offset) {
  const start = offset;
  while (offset < buffer.length && buffer[offset] !== 0) {
    offset++;
  }

  if (offset >= buffer.length) {
    throw new Error('Unterminated C string in buffer');
  }

  const value = buffer.slice(start, offset).toString('utf8');
  return {
    value,
    newOffset: offset + 1, // Skip the null terminator
  };
}

/**
 * Writes a null-terminated string to a buffer
 * @param {string} str - String to write
 * @param {string} encoding - Character encoding (default: 'utf8')
 * @returns {Buffer} Buffer containing the string with null terminator
 */
function writeCString(str, encoding = 'utf8') {
  const strBuffer = Buffer.from(str, encoding);
  const result = Buffer.alloc(strBuffer.length + 1);
  strBuffer.copy(result, 0);
  result[strBuffer.length] = 0; // Null terminator
  return result;
}

/**
 * Parses key-value pairs from a startup packet or similar message
 * @param {Buffer} buffer - Buffer containing the message
 * @param {number} startOffset - Offset to start reading from
 * @param {number} endOffset - Offset to stop reading at
 * @returns {Map<string, string>} Map of parameter names to values
 */
function parseParameters(buffer, startOffset, endOffset) {
  const parameters = new Map();
  let offset = startOffset;

  while (offset < endOffset - 1) {
    // -1 to account for final null terminator
    try {
      const key = readCString(buffer, offset);
      offset = key.newOffset;

      const value = readCString(buffer, offset);
      offset = value.newOffset;

      if (key.value && value.value !== undefined) {
        parameters.set(key.value, value.value);
      }
    } catch (error) {
      console.warn('Error parsing parameter at offset', offset, ':', error.message);
      break;
    }
  }

  return parameters;
}

/**
 * Creates a complete protocol message buffer with header
 * @param {string} messageType - Single character message type
 * @param {Buffer} payload - Message payload (can be empty)
 * @returns {Buffer} Complete message buffer
 */
function createMessage(messageType, payload = Buffer.alloc(0)) {
  const header = Buffer.alloc(5);
  header[0] = messageType.charCodeAt(0);
  header.writeInt32BE(4 + payload.length, 1); // Length includes the length field itself

  return Buffer.concat([header, payload]);
}

/**
 * Creates a message payload buffer from multiple components
 * @param {...(Buffer|string|number)} components - Components to concatenate
 * @returns {Buffer} Combined payload buffer
 */
function createPayload(...components) {
  const buffers = [];

  for (const component of components) {
    if (Buffer.isBuffer(component)) {
      buffers.push(component);
    } else if (typeof component === 'string') {
      buffers.push(writeCString(component));
    } else if (typeof component === 'number') {
      const numBuffer = Buffer.alloc(4);
      numBuffer.writeInt32BE(component, 0);
      buffers.push(numBuffer);
    } else {
      throw new Error(`Unsupported component type: ${typeof component}`);
    }
  }

  return Buffer.concat(buffers);
}

/**
 * Validates that a buffer contains a complete message
 * @param {Buffer} buffer - Buffer to validate
 * @param {boolean} hasHeader - Whether the message has a type header (default: true)
 * @returns {Object} {isComplete: boolean, messageLength: number}
 */
function validateMessage(buffer, hasHeader = true) {
  const headerSize = hasHeader ? 5 : 4; // 1 byte type + 4 bytes length, or just 4 bytes length

  if (buffer.length < headerSize) {
    return { isComplete: false, messageLength: 0 };
  }

  const lengthOffset = hasHeader ? 1 : 0;
  const messageLength = buffer.readInt32BE(lengthOffset);
  const totalLength = hasHeader ? messageLength + 1 : messageLength; // +1 for message type byte

  return {
    isComplete: buffer.length >= totalLength,
    messageLength: totalLength,
  };
}

/**
 * Extracts the message type from a buffer
 * @param {Buffer} buffer - Buffer containing the message
 * @returns {string} Message type character
 */
function getMessageType(buffer) {
  if (buffer.length < 1) {
    throw new Error('Buffer too small to contain message type');
  }
  return String.fromCharCode(buffer[0]);
}

/**
 * Calculates MD5 hash for PostgreSQL authentication
 * @param {string} password - User password
 * @param {string} username - Username
 * @param {Buffer} salt - 4-byte salt from server
 * @returns {string} MD5 hash string in PostgreSQL format
 */
function calculateMD5Hash(password, username, salt) {
  const crypto = require('crypto');

  // First hash: md5(password + username)
  const firstHash = crypto.createHash('md5');
  firstHash.update(password + username);
  const pwdHash = firstHash.digest('hex');

  // Second hash: md5(firstHash + salt)
  const secondHash = crypto.createHash('md5');
  secondHash.update(pwdHash);
  secondHash.update(salt);

  return 'md5' + secondHash.digest('hex');
}

/**
 * Generates a random 32-bit integer for backend secrets
 * @returns {number} Random 32-bit integer
 */
function generateBackendSecret() {
  const crypto = require('crypto');
  return crypto.randomInt(0, 2147483647);
}

/**
 * Formats a query tag for CommandComplete message
 * @param {string} command - SQL command (SELECT, INSERT, etc.)
 * @param {number} rowCount - Number of rows affected (optional)
 * @returns {string} Formatted command tag
 */
function formatCommandTag(command, rowCount = null) {
  const upperCommand = command.toUpperCase();

  if (rowCount !== null && rowCount !== undefined) {
    // Commands that include row count
    if (['INSERT', 'UPDATE', 'DELETE', 'SELECT', 'MOVE', 'FETCH', 'COPY'].includes(upperCommand)) {
      if (upperCommand === 'INSERT') {
        return `INSERT 0 ${rowCount}`; // INSERT oid count
      }
      return `${upperCommand} ${rowCount}`;
    }
  }

  // Commands without row count
  return upperCommand;
}

/**
 * Validates a protocol version number
 * @param {number} version - Protocol version to validate
 * @returns {boolean} True if version is supported
 */
function isValidProtocolVersion(version) {
  const { PROTOCOL_VERSION_3_0, SSL_REQUEST_CODE, CANCEL_REQUEST_CODE } = require('./constants');
  return (
    version === PROTOCOL_VERSION_3_0 ||
    version === SSL_REQUEST_CODE ||
    version === CANCEL_REQUEST_CODE
  );
}

/**
 * Parses a query string into individual statements
 * @param {string} query - Raw query string
 * @returns {string[]} Array of individual query statements
 */
function parseQueryStatements(query) {
  return query
    .split(';')
    .map(stmt => stmt.trim())
    .filter(stmt => stmt.length > 0);
}

/**
 * Creates error field buffers for ErrorResponse/NoticeResponse messages
 * @param {Object} fields - Object with error field codes as keys
 * @returns {Buffer} Combined buffer with all error fields
 */
function createErrorFields(fields) {
  const buffers = [];

  for (const [fieldCode, fieldValue] of Object.entries(fields)) {
    if (fieldValue) {
      const fieldBuffer = Buffer.alloc(1 + Buffer.byteLength(fieldValue) + 1);
      fieldBuffer[0] = fieldCode.charCodeAt(0);
      fieldBuffer.write(fieldValue, 1, 'utf8');
      fieldBuffer[fieldBuffer.length - 1] = 0; // Null terminator
      buffers.push(fieldBuffer);
    }
  }

  // Add final null terminator for the entire message
  buffers.push(Buffer.from([0]));

  return Buffer.concat(buffers);
}

/**
 * Array Type Utilities
 */

/**
 * Encodes a PostgreSQL array value to text format
 * @param {Array} array - JavaScript array to encode
 * @param {string} elementType - PostgreSQL element type name
 * @returns {string} PostgreSQL array text representation
 */
function encodeArrayToText(array, elementType = 'text') {
  if (!Array.isArray(array)) {
    throw new Error('Input must be an array');
  }

  // Handle empty arrays
  if (array.length === 0) {
    return '{}';
  }

  // Handle multi-dimensional arrays
  if (Array.isArray(array[0])) {
    return encodeMultiDimensionalArray(array, elementType);
  }

  // Handle one-dimensional arrays
  const encodedElements = array.map(element => encodeArrayElement(element, elementType));
  return `{${encodedElements.join(',')}}`;
}

/**
 * Encodes a multi-dimensional PostgreSQL array
 * @param {Array} array - Multi-dimensional JavaScript array
 * @param {string} elementType - PostgreSQL element type name
 * @returns {string} PostgreSQL array text representation
 */
function encodeMultiDimensionalArray(array, elementType) {
  const encodedSubArrays = array.map(subArray => {
    if (Array.isArray(subArray)) {
      return encodeArrayToText(subArray, elementType);
    }
    return encodeArrayElement(subArray, elementType);
  });
  return `{${encodedSubArrays.join(',')}}`;
}

/**
 * Encodes a single array element
 * @param {*} element - Element to encode
 * @param {string} _elementType - PostgreSQL element type name (reserved for future use)
 * @returns {string} Encoded element
 */
function encodeArrayElement(element, _elementType) {
  if (element === null || element === undefined) {
    return 'NULL';
  }

  const value = String(element);

  // Check if the value needs quoting (contains special characters)
  if (needsQuoting(value)) {
    // Escape backslashes first, then quotes
    const escaped = value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    return `"${escaped}"`;
  }

  return value;
}

/**
 * Determines if a value needs quoting in PostgreSQL array format
 * @param {string} value - Value to check
 * @returns {boolean} True if value needs quoting
 */
function needsQuoting(value) {
  // Quote if contains special characters or is empty
  return (
    value === '' ||
    value.includes(',') ||
    value.includes('{') ||
    value.includes('}') ||
    value.includes('"') ||
    value.includes('\\') ||
    value.includes(' ') ||
    value.includes('\t') ||
    value.includes('\n') ||
    value.includes('\r') ||
    value.toUpperCase() === 'NULL'
  );
}

/**
 * Parses a PostgreSQL array text representation to JavaScript array
 * @param {string} arrayText - PostgreSQL array text representation
 * @param {string} elementType - PostgreSQL element type name
 * @returns {Array} JavaScript array
 */
function parseArrayFromText(arrayText, elementType = 'text') {
  if (!arrayText || arrayText.trim() === '' || arrayText.trim() === '{}') {
    return [];
  }

  // Remove outer braces
  const trimmed = arrayText.trim();
  if (!trimmed.startsWith('{') || !trimmed.endsWith('}')) {
    throw new Error('Invalid array format: missing outer braces');
  }

  const content = trimmed.slice(1, -1);
  if (content === '') {
    return [];
  }

  return parseArrayElements(content, elementType);
}

/**
 * Parses array elements from string content
 * @param {string} content - Content between braces
 * @param {string} elementType - PostgreSQL element type name
 * @returns {Array} Array of parsed elements
 */
function parseArrayElements(content, elementType) {
  const elements = [];
  let i = 0;

  while (i < content.length) {
    // Skip whitespace
    while (i < content.length && content[i] === ' ') {
      i++;
    }

    if (i >= content.length) break;

    let element = '';

    if (content[i] === '"') {
      // Parse quoted element
      i++; // Skip opening quote

      while (i < content.length) {
        const char = content[i];
        const nextChar = i + 1 < content.length ? content[i + 1] : null;

        if (char === '\\' && nextChar === '"') {
          // Escaped quote - add literal quote character
          element += '"';
          i += 2; // Skip both characters
        } else if (char === '\\' && nextChar === '\\') {
          // Escaped backslash - add literal backslash
          element += '\\';
          i += 2; // Skip both characters
        } else if (char === '"') {
          // End of quoted element
          break;
        } else {
          element += char;
          i++;
        }
      }

      if (i < content.length && content[i] === '"') {
        i++; // Skip closing quote
      }

      elements.push(parseArrayElement(element, elementType, true)); // true = was quoted

      // Skip comma if present
      while (i < content.length && (content[i] === ' ' || content[i] === ',')) {
        i++;
      }
      continue;
    } else if (content[i] === '{') {
      // Parse nested array
      let depth = 1;
      element += content[i];
      i++;

      while (i < content.length && depth > 0) {
        if (content[i] === '{') {
          depth++;
        } else if (content[i] === '}') {
          depth--;
        }
        element += content[i];
        i++;
      }

      elements.push(parseArrayFromText(element, elementType));

      // Skip comma if present
      while (i < content.length && (content[i] === ' ' || content[i] === ',')) {
        i++;
      }
      continue;
    } else {
      // Parse unquoted element
      while (i < content.length && content[i] !== ',' && content[i] !== '}') {
        element += content[i];
        i++;
      }
      element = element.trim();
    }

    elements.push(parseArrayElement(element, elementType, false)); // false = not quoted

    // Skip comma if present
    while (i < content.length && (content[i] === ' ' || content[i] === ',')) {
      i++;
    }
  }

  return elements;
}

/**
 * Parses a single array element
 * @param {string} element - Element string to parse
 * @param {string} elementType - PostgreSQL element type name
 * @param {boolean} wasQuoted - Whether the element was originally quoted (default: true for backwards compatibility)
 * @returns {*} Parsed element value
 */
function parseArrayElement(element, elementType, wasQuoted = true) {
  const trimmed = element.trim();

  if (trimmed.toUpperCase() === 'NULL') {
    return null;
  }

  // If it was quoted, we've already processed the escapes
  // If it wasn't quoted and looks like a quoted string, process it
  let value = trimmed;
  if (!wasQuoted && trimmed.startsWith('"') && trimmed.endsWith('"')) {
    const unquoted = trimmed.slice(1, -1);
    // Properly unescape PostgreSQL array format: quotes first, then backslashes
    value = unquoted.replace(/\\"/g, '"').replace(/\\\\/g, '\\');
  } else if (wasQuoted) {
    // For already processed quoted elements, the value is already unescaped
    value = trimmed;
  }

  // Type conversion based on element type
  switch (elementType.toLowerCase()) {
    case 'int4':
    case 'integer':
    case 'int':
      return parseInt(value, 10);
    case 'int8':
    case 'bigint':
      // For bigint, return as string to avoid precision loss in JavaScript
      return value;
    case 'int2':
    case 'smallint':
      return parseInt(value, 10);
    case 'float4':
    case 'real':
    case 'float8':
    case 'double precision':
    case 'numeric':
      return parseFloat(value);
    case 'bool':
    case 'boolean':
      return value.toLowerCase() === 't' || value.toLowerCase() === 'true';
    default:
      return value;
  }
}

/**
 * Gets the array type OID for a given base type OID
 * @param {number} baseTypeOID - Base type OID
 * @returns {number} Array type OID
 */
function getArrayTypeOID(baseTypeOID) {
  const { DATA_TYPES } = require('./constants');

  // Mapping of base types to their array types
  const typeMapping = {
    [DATA_TYPES.BOOL]: DATA_TYPES.BOOL_ARRAY,
    [DATA_TYPES.BYTEA]: DATA_TYPES.BYTEA_ARRAY,
    [DATA_TYPES.CHAR]: DATA_TYPES.CHAR_ARRAY,
    [DATA_TYPES.NAME]: DATA_TYPES.NAME_ARRAY,
    [DATA_TYPES.INT8]: DATA_TYPES.INT8_ARRAY,
    [DATA_TYPES.INT2]: DATA_TYPES.INT2_ARRAY,
    [DATA_TYPES.INT2VECTOR]: DATA_TYPES.INT2VECTOR_ARRAY,
    [DATA_TYPES.INT4]: DATA_TYPES.INT4_ARRAY,
    [DATA_TYPES.REGPROC]: DATA_TYPES.REGPROC_ARRAY,
    [DATA_TYPES.TEXT]: DATA_TYPES.TEXT_ARRAY,
    [DATA_TYPES.OID]: DATA_TYPES.OID_ARRAY,
    [DATA_TYPES.TID]: DATA_TYPES.TID_ARRAY,
    [DATA_TYPES.XID]: DATA_TYPES.XID_ARRAY,
    [DATA_TYPES.CID]: DATA_TYPES.CID_ARRAY,
    [DATA_TYPES.OIDVECTOR]: DATA_TYPES.OIDVECTOR_ARRAY,
    [DATA_TYPES.JSON]: DATA_TYPES.JSON_ARRAY,
    [DATA_TYPES.POINT]: DATA_TYPES.POINT_ARRAY,
    [DATA_TYPES.LSEG]: DATA_TYPES.LSEG_ARRAY,
    [DATA_TYPES.PATH]: DATA_TYPES.PATH_ARRAY,
    [DATA_TYPES.BOX]: DATA_TYPES.BOX_ARRAY,
    [DATA_TYPES.POLYGON]: DATA_TYPES.POLYGON_ARRAY,
    [DATA_TYPES.FLOAT4]: DATA_TYPES.FLOAT4_ARRAY,
    [DATA_TYPES.FLOAT8]: DATA_TYPES.FLOAT8_ARRAY,
    [DATA_TYPES.ABSTIME]: DATA_TYPES.ABSTIME_ARRAY,
    [DATA_TYPES.RELTIME]: DATA_TYPES.RELTIME_ARRAY,
    [DATA_TYPES.TINTERVAL]: DATA_TYPES.TINTERVAL_ARRAY,
    [DATA_TYPES.BPCHAR]: DATA_TYPES.BPCHAR_ARRAY,
    [DATA_TYPES.VARCHAR]: DATA_TYPES.VARCHAR_ARRAY,
    [DATA_TYPES.DATE]: DATA_TYPES.DATE_ARRAY,
    [DATA_TYPES.TIME]: DATA_TYPES.TIME_ARRAY,
    [DATA_TYPES.TIMESTAMP]: DATA_TYPES.TIMESTAMP_ARRAY,
    [DATA_TYPES.TIMESTAMPTZ]: DATA_TYPES.TIMESTAMPTZ_ARRAY,
    [DATA_TYPES.INTERVAL]: DATA_TYPES.INTERVAL_ARRAY,
    [DATA_TYPES.TIMETZ]: DATA_TYPES.TIMETZ_ARRAY,
    [DATA_TYPES.BIT]: DATA_TYPES.BIT_ARRAY,
    [DATA_TYPES.VARBIT]: DATA_TYPES.VARBIT_ARRAY,
    [DATA_TYPES.NUMERIC]: DATA_TYPES.NUMERIC_ARRAY,
    [DATA_TYPES.UUID]: DATA_TYPES.UUID_ARRAY,
    [DATA_TYPES.JSONB]: DATA_TYPES.JSONB_ARRAY,
    [DATA_TYPES.INET]: DATA_TYPES.INET_ARRAY,
    [DATA_TYPES.CIDR]: DATA_TYPES.CIDR_ARRAY,
    [DATA_TYPES.MACADDR]: DATA_TYPES.MACADDR_ARRAY,
  };

  return typeMapping[baseTypeOID] || null;
}

/**
 * Gets the base type OID for a given array type OID
 * @param {number} arrayTypeOID - Array type OID
 * @returns {number} Base type OID
 */
function getBaseTypeOID(arrayTypeOID) {
  const { DATA_TYPES } = require('./constants');

  // Reverse mapping of array types to their base types
  const typeMapping = {
    [DATA_TYPES.BOOL_ARRAY]: DATA_TYPES.BOOL,
    [DATA_TYPES.BYTEA_ARRAY]: DATA_TYPES.BYTEA,
    [DATA_TYPES.CHAR_ARRAY]: DATA_TYPES.CHAR,
    [DATA_TYPES.NAME_ARRAY]: DATA_TYPES.NAME,
    [DATA_TYPES.INT8_ARRAY]: DATA_TYPES.INT8,
    [DATA_TYPES.INT2_ARRAY]: DATA_TYPES.INT2,
    [DATA_TYPES.INT2VECTOR_ARRAY]: DATA_TYPES.INT2VECTOR,
    [DATA_TYPES.INT4_ARRAY]: DATA_TYPES.INT4,
    [DATA_TYPES.REGPROC_ARRAY]: DATA_TYPES.REGPROC,
    [DATA_TYPES.TEXT_ARRAY]: DATA_TYPES.TEXT,
    [DATA_TYPES.OID_ARRAY]: DATA_TYPES.OID,
    [DATA_TYPES.TID_ARRAY]: DATA_TYPES.TID,
    [DATA_TYPES.XID_ARRAY]: DATA_TYPES.XID,
    [DATA_TYPES.CID_ARRAY]: DATA_TYPES.CID,
    [DATA_TYPES.OIDVECTOR_ARRAY]: DATA_TYPES.OIDVECTOR,
    [DATA_TYPES.JSON_ARRAY]: DATA_TYPES.JSON,
    [DATA_TYPES.POINT_ARRAY]: DATA_TYPES.POINT,
    [DATA_TYPES.LSEG_ARRAY]: DATA_TYPES.LSEG,
    [DATA_TYPES.PATH_ARRAY]: DATA_TYPES.PATH,
    [DATA_TYPES.BOX_ARRAY]: DATA_TYPES.BOX,
    [DATA_TYPES.POLYGON_ARRAY]: DATA_TYPES.POLYGON,
    [DATA_TYPES.FLOAT4_ARRAY]: DATA_TYPES.FLOAT4,
    [DATA_TYPES.FLOAT8_ARRAY]: DATA_TYPES.FLOAT8,
    [DATA_TYPES.ABSTIME_ARRAY]: DATA_TYPES.ABSTIME,
    [DATA_TYPES.RELTIME_ARRAY]: DATA_TYPES.RELTIME,
    [DATA_TYPES.TINTERVAL_ARRAY]: DATA_TYPES.TINTERVAL,
    [DATA_TYPES.BPCHAR_ARRAY]: DATA_TYPES.BPCHAR,
    [DATA_TYPES.VARCHAR_ARRAY]: DATA_TYPES.VARCHAR,
    [DATA_TYPES.DATE_ARRAY]: DATA_TYPES.DATE,
    [DATA_TYPES.TIME_ARRAY]: DATA_TYPES.TIME,
    [DATA_TYPES.TIMESTAMP_ARRAY]: DATA_TYPES.TIMESTAMP,
    [DATA_TYPES.TIMESTAMPTZ_ARRAY]: DATA_TYPES.TIMESTAMPTZ,
    [DATA_TYPES.INTERVAL_ARRAY]: DATA_TYPES.INTERVAL,
    [DATA_TYPES.TIMETZ_ARRAY]: DATA_TYPES.TIMETZ,
    [DATA_TYPES.BIT_ARRAY]: DATA_TYPES.BIT,
    [DATA_TYPES.VARBIT_ARRAY]: DATA_TYPES.VARBIT,
    [DATA_TYPES.NUMERIC_ARRAY]: DATA_TYPES.NUMERIC,
    [DATA_TYPES.UUID_ARRAY]: DATA_TYPES.UUID,
    [DATA_TYPES.JSONB_ARRAY]: DATA_TYPES.JSONB,
    [DATA_TYPES.INET_ARRAY]: DATA_TYPES.INET,
    [DATA_TYPES.CIDR_ARRAY]: DATA_TYPES.CIDR,
    [DATA_TYPES.MACADDR_ARRAY]: DATA_TYPES.MACADDR,
  };

  return typeMapping[arrayTypeOID] || null;
}

/**
 * Checks if a given type OID represents an array type
 * @param {number} typeOID - Type OID to check
 * @returns {boolean} True if the type is an array type
 */
function isArrayType(typeOID) {
  return getBaseTypeOID(typeOID) !== null;
}

module.exports = {
  readCString,
  writeCString,
  parseParameters,
  createMessage,
  createPayload,
  validateMessage,
  getMessageType,
  calculateMD5Hash,
  generateBackendSecret,
  formatCommandTag,
  isValidProtocolVersion,
  parseQueryStatements,
  createErrorFields,
  // Array utilities
  encodeArrayToText,
  parseArrayFromText,
  getArrayTypeOID,
  getBaseTypeOID,
  isArrayType,
};
