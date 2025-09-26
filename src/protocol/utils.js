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
};
