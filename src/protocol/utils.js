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
 * Validates if a message type is valid for the current protocol state
 * @param {string} messageType - Message type character to validate
 * @param {boolean} isAuthenticated - Whether connection is authenticated
 * @returns {Object} Validation result with isValid and error message
 */
function validateMessageType(messageType, isAuthenticated = false) {
  const { MESSAGE_TYPES } = require('./constants');

  // Valid message types for authenticated connections
  const authenticatedMessages = [
    MESSAGE_TYPES.QUERY, // Q - Simple Query
    MESSAGE_TYPES.PARSE, // P - Parse
    MESSAGE_TYPES.BIND, // B - Bind
    MESSAGE_TYPES.DESCRIBE, // D - Describe
    MESSAGE_TYPES.EXECUTE, // E - Execute
    MESSAGE_TYPES.SYNC, // S - Sync
    MESSAGE_TYPES.TERMINATE, // X - Terminate
    MESSAGE_TYPES.COPY_DATA, // d - Copy Data
    MESSAGE_TYPES.COPY_DONE, // c - Copy Done
    MESSAGE_TYPES.COPY_FAIL, // f - Copy Fail
    MESSAGE_TYPES.FUNCTION_CALL, // F - Function Call
  ];

  // Valid message types for unauthenticated connections
  const unauthenticatedMessages = [
    MESSAGE_TYPES.PASSWORD_MESSAGE, // p - Password Message
    MESSAGE_TYPES.TERMINATE, // X - Terminate (allowed anytime)
  ];

  if (!messageType || typeof messageType !== 'string' || messageType.length !== 1) {
    return {
      isValid: false,
      error: 'Message type must be a single character',
      code: 'INVALID_MESSAGE_TYPE_FORMAT',
    };
  }

  // Check if message type is printable ASCII (PostgreSQL protocol requirement)
  const charCode = messageType.charCodeAt(0);
  if (charCode < 32 || charCode > 126) {
    return {
      isValid: false,
      error: `Invalid message type character: non-printable ASCII (${charCode})`,
      code: 'INVALID_MESSAGE_TYPE_CHARACTER',
    };
  }

  if (isAuthenticated) {
    if (!authenticatedMessages.includes(messageType)) {
      return {
        isValid: false,
        error: `Message type '${messageType}' not allowed for authenticated connections`,
        code: 'INVALID_MESSAGE_TYPE_FOR_STATE',
      };
    }
  } else {
    if (!unauthenticatedMessages.includes(messageType)) {
      return {
        isValid: false,
        error: `Message type '${messageType}' not allowed before authentication`,
        code: 'INVALID_MESSAGE_TYPE_BEFORE_AUTH',
      };
    }
  }

  return { isValid: true };
}

/**
 * Validates message length against protocol constraints
 * @param {number} messageLength - Declared message length from header
 * @param {number} bufferLength - Actual buffer length available
 * @param {string} messageType - Message type for context
 * @returns {Object} Validation result with isValid and error message
 */
function validateMessageLength(messageLength, bufferLength, messageType) {
  const MAX_MESSAGE_LENGTH = 1073741824; // 1GB - PostgreSQL's max message size
  const MIN_MESSAGE_LENGTH = 4; // Minimum length (just the length field)

  if (messageLength < MIN_MESSAGE_LENGTH) {
    return {
      isValid: false,
      error: `Message length ${messageLength} is too small (minimum ${MIN_MESSAGE_LENGTH})`,
      code: 'MESSAGE_TOO_SHORT',
    };
  }

  if (messageLength > MAX_MESSAGE_LENGTH) {
    return {
      isValid: false,
      error: `Message length ${messageLength} exceeds maximum allowed size (${MAX_MESSAGE_LENGTH})`,
      code: 'MESSAGE_TOO_LONG',
    };
  }

  // Check if we have enough data for the declared message length
  const requiredLength = messageLength + 1; // +1 for message type byte
  if (bufferLength < requiredLength) {
    return {
      isValid: false,
      error: `Incomplete message: need ${requiredLength} bytes, have ${bufferLength}`,
      code: 'INCOMPLETE_MESSAGE',
      incomplete: true, // Flag to indicate this is not an error, just need more data
    };
  }

  // Type-specific length validations
  switch (messageType) {
    case 'Q': // Query - must have at least null terminator
      if (messageLength < 5) {
        // 4 bytes length + 1 byte null terminator minimum
        return {
          isValid: false,
          error: 'Query message too short to contain valid query string',
          code: 'INVALID_QUERY_LENGTH',
        };
      }
      break;

    case 'X': // Terminate - should be exactly 4 bytes (just length)
      if (messageLength !== 4) {
        return {
          isValid: false,
          error: 'Terminate message should have exactly 4 bytes length',
          code: 'INVALID_TERMINATE_LENGTH',
        };
      }
      break;

    case 'S': // Sync - should be exactly 4 bytes (just length)
      if (messageLength !== 4) {
        return {
          isValid: false,
          error: 'Sync message should have exactly 4 bytes length',
          code: 'INVALID_SYNC_LENGTH',
        };
      }
      break;

    case 'P': // Parse - needs at least statement name, query, and param count
      if (messageLength < 7) {
        // 4 + 1 (null) + 1 (null) + 2 (param count) minimum
        return {
          isValid: false,
          error: 'Parse message too short for minimum required fields',
          code: 'INVALID_PARSE_LENGTH',
        };
      }
      break;
  }

  return { isValid: true };
}

/**
 * Enhanced message type extraction with validation
 * @param {Buffer} buffer - Buffer containing the message
 * @param {boolean} isAuthenticated - Whether connection is authenticated
 * @returns {Object} Result with messageType, isValid, and optional error
 */
function getValidatedMessageType(buffer, isAuthenticated = false) {
  try {
    if (!buffer || buffer.length < 5) {
      return {
        isValid: false,
        error: 'Buffer too small for complete message header',
        code: 'INSUFFICIENT_DATA',
      };
    }

    const messageType = getMessageType(buffer);
    const messageLength = buffer.readInt32BE(1);

    // Validate message type
    const typeValidation = validateMessageType(messageType, isAuthenticated);
    if (!typeValidation.isValid) {
      return {
        messageType,
        isValid: false,
        error: typeValidation.error,
        code: typeValidation.code,
      };
    }

    // Validate message length
    const lengthValidation = validateMessageLength(messageLength, buffer.length, messageType);
    if (!lengthValidation.isValid) {
      return {
        messageType,
        messageLength,
        isValid: false,
        error: lengthValidation.error,
        code: lengthValidation.code,
        incomplete: lengthValidation.incomplete,
      };
    }

    return {
      messageType,
      messageLength,
      isValid: true,
    };
  } catch (error) {
    return {
      isValid: false,
      error: error.message,
      code: 'MESSAGE_VALIDATION_ERROR',
    };
  }
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
 * SCRAM-SHA-256 Authentication Utilities
 */

/**
 * Generates a cryptographically secure random nonce for SCRAM
 * @param {number} length - Length of the nonce in bytes (default: 18)
 * @returns {string} Base64-encoded nonce
 */
function generateScramNonce(length = 18) {
  const crypto = require('crypto');
  return crypto.randomBytes(length).toString('base64');
}

/**
 * Performs PBKDF2 key derivation for SCRAM-SHA-256
 * @param {string} password - Password to derive key from
 * @param {Buffer} salt - Salt for key derivation
 * @param {number} iterations - Number of iterations
 * @param {number} keyLength - Desired key length in bytes (default: 32 for SHA-256)
 * @returns {Buffer} Derived key
 */
function pbkdf2ScramSha256(password, salt, iterations, keyLength = 32) {
  const crypto = require('crypto');
  return crypto.pbkdf2Sync(password, salt, iterations, keyLength, 'sha256');
}

/**
 * Computes HMAC-SHA-256
 * @param {Buffer|string} key - HMAC key
 * @param {Buffer|string} data - Data to authenticate
 * @returns {Buffer} HMAC digest
 */
function hmacSha256(key, data) {
  const crypto = require('crypto');
  const hmac = crypto.createHmac('sha256', key);
  hmac.update(data);
  return hmac.digest();
}

/**
 * Computes SHA-256 hash
 * @param {Buffer|string} data - Data to hash
 * @returns {Buffer} Hash digest
 */
function sha256(data) {
  const crypto = require('crypto');
  const hash = crypto.createHash('sha256');
  hash.update(data);
  return hash.digest();
}

/**
 * Normalizes username for SCRAM (applies SASLprep if needed)
 * @param {string} username - Username to normalize
 * @returns {string} Normalized username
 */
function normalizeScramUsername(username) {
  // For now, just return the username as-is
  // In a full implementation, you'd apply SASLprep normalization
  // which handles Unicode normalization and prohibited characters
  return username;
}

/**
 * Normalizes password for SCRAM (applies SASLprep if needed)
 * @param {string} password - Password to normalize
 * @returns {string} Normalized password
 */
function normalizeScramPassword(password) {
  // For now, just return the password as-is
  // In a full implementation, you'd apply SASLprep normalization
  return password;
}

/**
 * Generates SCRAM server credentials for a user
 * @param {string} password - User's password
 * @param {number} iterations - Iteration count (default: 4096)
 * @returns {Object} Server credentials with salt, iterations, serverKey, storedKey
 */
function generateScramCredentials(password, iterations = 4096) {
  const crypto = require('crypto');
  const salt = crypto.randomBytes(16); // 16-byte salt
  const normalizedPassword = normalizeScramPassword(password);

  // Compute SaltedPassword = PBKDF2(Normalize(password), salt, iterations)
  const saltedPassword = pbkdf2ScramSha256(normalizedPassword, salt, iterations);

  // Compute ClientKey = HMAC(SaltedPassword, "Client Key")
  const clientKey = hmacSha256(saltedPassword, 'Client Key');

  // Compute StoredKey = SHA-256(ClientKey)
  const storedKey = sha256(clientKey);

  // Compute ServerKey = HMAC(SaltedPassword, "Server Key")
  const serverKey = hmacSha256(saltedPassword, 'Server Key');

  return {
    salt: salt.toString('base64'),
    iterations,
    storedKey: storedKey.toString('base64'),
    serverKey: serverKey.toString('base64'),
  };
}

/**
 * Verifies SCRAM client proof
 * @param {string} clientProof - Client proof from authentication exchange
 * @param {string} storedKey - Stored key from server credentials
 * @param {string} authMessage - Authentication message
 * @returns {boolean} True if proof is valid
 */
function verifyScramClientProof(clientProof, storedKey, authMessage) {
  try {
    console.log('=== DETAILED PROOF VERIFICATION ===');
    console.log('Client proof (base64):', clientProof);
    console.log('Stored key (base64):', storedKey);
    console.log('Auth message:', authMessage);

    const clientProofBuffer = Buffer.from(clientProof, 'base64');
    const storedKeyBuffer = Buffer.from(storedKey, 'base64');
    const authMessageBuffer = Buffer.from(authMessage, 'utf8');

    console.log('Client proof buffer:', clientProofBuffer.toString('hex'));
    console.log('Stored key buffer:', storedKeyBuffer.toString('hex'));
    console.log('Auth message buffer:', authMessageBuffer.toString('hex'));

    // Compute ClientSignature = HMAC(StoredKey, AuthMessage)
    const clientSignature = hmacSha256(storedKeyBuffer, authMessageBuffer);
    console.log('Computed client signature:', clientSignature.toString('hex'));

    // Compute ClientKey = ClientProof XOR ClientSignature
    const clientKey = Buffer.alloc(clientSignature.length);
    for (let i = 0; i < clientSignature.length; i++) {
      clientKey[i] = clientProofBuffer[i] ^ clientSignature[i];
    }
    console.log('Computed client key:', clientKey.toString('hex'));

    // Verify StoredKey = SHA-256(ClientKey)
    const computedStoredKey = sha256(clientKey);
    console.log('Computed stored key:', computedStoredKey.toString('hex'));
    console.log('Expected stored key:', storedKeyBuffer.toString('hex'));

    const isValid = computedStoredKey.equals(storedKeyBuffer);
    console.log('Keys match:', isValid);
    console.log('=== END PROOF VERIFICATION ===');

    return isValid;
  } catch (error) {
    console.log('Error in proof verification:', error);
    return false;
  }
}

/**
 * Generates SCRAM server signature
 * @param {string} serverKey - Server key from credentials
 * @param {string} authMessage - Authentication message
 * @returns {string} Base64-encoded server signature
 */
function generateScramServerSignature(serverKey, authMessage) {
  const serverKeyBuffer = Buffer.from(serverKey, 'base64');
  const authMessageBuffer = Buffer.from(authMessage, 'utf8');

  // Compute ServerSignature = HMAC(ServerKey, AuthMessage)
  const serverSignature = hmacSha256(serverKeyBuffer, authMessageBuffer);

  return serverSignature.toString('base64');
}

/**
 * Parses SCRAM client initial message
 * @param {string} message - Client initial message
 * @returns {Object} Parsed message with username, nonce, and extensions
 */
function parseScramClientInitial(message) {
  const parts = message.split(',');
  const result = {
    username: null,
    nonce: null,
    channelBinding: 'n', // Default to no channel binding
    extensions: {},
  };

  for (const part of parts) {
    if (part.startsWith('n=')) {
      result.username = part.substring(2);
    } else if (part.startsWith('r=')) {
      result.nonce = part.substring(2);
    } else if (part.startsWith('c=')) {
      result.channelBinding = part.substring(2);
    } else if (part.includes('=')) {
      const [key, value] = part.split('=', 2);
      result.extensions[key] = value;
    }
  }

  return result;
}

/**
 * Parses SCRAM client final message
 * @param {string} message - Client final message
 * @returns {Object} Parsed message with channelBinding, nonce, and proof
 */
function parseScramClientFinal(message) {
  const parts = message.split(',');
  const result = {
    channelBinding: null,
    nonce: null,
    proof: null,
    extensions: {},
  };

  for (const part of parts) {
    if (part.startsWith('c=')) {
      result.channelBinding = part.substring(2);
    } else if (part.startsWith('r=')) {
      result.nonce = part.substring(2);
    } else if (part.startsWith('p=')) {
      result.proof = part.substring(2);
    } else if (part.includes('=')) {
      const [key, value] = part.split('=', 2);
      result.extensions[key] = value;
    }
  }

  return result;
}

/**
 * Builds SCRAM server first message
 * @param {string} clientNonce - Client nonce from initial message
 * @param {string} serverNonce - Server-generated nonce
 * @param {string} salt - Base64-encoded salt
 * @param {number} iterations - Iteration count
 * @returns {string} Server first message
 */
function buildScramServerFirst(clientNonce, serverNonce, salt, iterations) {
  const combinedNonce = clientNonce + serverNonce;
  return `r=${combinedNonce},s=${salt},i=${iterations}`;
}

/**
 * Builds SCRAM server final message
 * @param {string} serverSignature - Base64-encoded server signature
 * @returns {string} Server final message
 */
function buildScramServerFinal(serverSignature) {
  return `v=${serverSignature}`;
}

/**
 * Builds SCRAM authentication message for signature computation
 * @param {string} clientInitialBare - Client initial message without GS2 header
 * @param {string} serverFirst - Server first message
 * @param {string} clientFinalWithoutProof - Client final message without proof
 * @returns {string} Authentication message
 */
function buildScramAuthMessage(clientInitialBare, serverFirst, clientFinalWithoutProof) {
  return `${clientInitialBare},${serverFirst},${clientFinalWithoutProof}`;
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
    const { ERROR_MESSAGES } = require('./constants');
    throw new Error(ERROR_MESSAGES.MISSING_OUTER_BRACES);
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
  generateBackendSecret,
  formatCommandTag,
  isValidProtocolVersion,
  parseQueryStatements,
  createErrorFields,
  // Message validation utilities
  validateMessageType,
  validateMessageLength,
  getValidatedMessageType,
  // Array utilities
  encodeArrayToText,
  parseArrayFromText,
  getArrayTypeOID,
  getBaseTypeOID,
  isArrayType,
  // SCRAM-SHA-256 utilities
  generateScramNonce,
  pbkdf2ScramSha256,
  hmacSha256,
  sha256,
  normalizeScramUsername,
  normalizeScramPassword,
  generateScramCredentials,
  verifyScramClientProof,
  generateScramServerSignature,
  parseScramClientInitial,
  parseScramClientFinal,
  buildScramServerFirst,
  buildScramServerFinal,
  buildScramAuthMessage,
};
