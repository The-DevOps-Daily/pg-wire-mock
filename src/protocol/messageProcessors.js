/**
 * PostgreSQL Wire Protocol Message Processors
 * Functions for processing incoming protocol messages and coordinating responses
 */

const {
  PROTOCOL_VERSION_3_0,
  SSL_REQUEST_CODE,
  CANCEL_REQUEST_CODE,
  MESSAGE_TYPES,
  ERROR_CODES,
  ERROR_MESSAGES,
  SASL_MECHANISMS,
  SCRAM_STATES,
} = require('./constants');

const {
  parseParameters,
  getMessageType,
  generateScramNonce,
  generateScramCredentials,
  parseScramClientInitial,
  parseScramClientFinal,
  buildScramServerFirst,
  buildScramServerFinal,
  buildScramAuthMessage,
  verifyScramClientProof,
  generateScramServerSignature,
} = require('./utils');
const { createProtocolLogger, createQueryLogger } = require('../utils/logger');
const fs = require('fs');

// WeakMap to store SSL upgrade state for sockets
const sslUpgradeState = new WeakMap();

/**
 * SSL upgrade state management
 */
const SSLState = {
  /**
   * Mark a socket for SSL upgrade
   * @param {Socket} socket - The socket to mark
   * @param {Object} config - SSL configuration
   */
  markForUpgrade(socket, config) {
    sslUpgradeState.set(socket, {
      needsSSLUpgrade: true,
      sslConfig: config,
      markedAt: Date.now(),
    });
  },

  /**
   * Check if a socket needs SSL upgrade
   * @param {Socket} socket - The socket to check
   * @returns {boolean} True if socket needs SSL upgrade
   */
  needsUpgrade(socket) {
    const state = sslUpgradeState.get(socket);
    return state?.needsSSLUpgrade || false;
  },

  /**
   * Get SSL configuration for a socket
   * @param {Socket} socket - The socket
   * @returns {Object|null} SSL configuration or null
   */
  getConfig(socket) {
    const state = sslUpgradeState.get(socket);
    return state?.sslConfig || null;
  },

  /**
   * Clear SSL state for a socket
   * @param {Socket} socket - The socket to clear
   */
  clear(socket) {
    sslUpgradeState.delete(socket);
  },

  /**
   * Mark SSL upgrade as completed
   * @param {Socket} socket - The socket
   */
  markCompleted(socket) {
    const state = sslUpgradeState.get(socket);
    if (state) {
      state.needsSSLUpgrade = false;
      state.completedAt = Date.now();
    }
  },
};

/**
 * Validates SSL certificate files
 * @param {Object} config - SSL configuration
 * @returns {Object} Validation result with success flag and SSL options
 */
function validateSSLCertificates(config) {
  const result = {
    success: false,
    sslOptions: {},
    error: null,
  };

  try {
    // Check if SSL is enabled
    if (!config?.enableSSL) {
      result.error = 'SSL not enabled';
      return result;
    }

    // Validate certificate file exists and is readable
    if (!config.sslCertPath || !fs.existsSync(config.sslCertPath)) {
      result.error = `SSL certificate file not found: ${config.sslCertPath}`;
      return result;
    }

    // Validate key file exists and is readable
    if (!config.sslKeyPath || !fs.existsSync(config.sslKeyPath)) {
      result.error = `SSL key file not found: ${config.sslKeyPath}`;
      return result;
    }

    // Try to read the certificate files
    try {
      result.sslOptions.cert = fs.readFileSync(config.sslCertPath);
      result.sslOptions.key = fs.readFileSync(config.sslKeyPath);
    } catch (readError) {
      result.error = `Failed to read SSL certificates: ${readError.message}`;
      return result;
    }

    // Add other SSL options
    result.sslOptions.rejectUnauthorized = config.sslRejectUnauthorized || false;

    if (config.sslCaPath && fs.existsSync(config.sslCaPath)) {
      try {
        result.sslOptions.ca = fs.readFileSync(config.sslCaPath);
      } catch (caError) {
        // CA is optional, so just log warning
        console.warn(`Warning: Could not read CA file: ${caError.message}`);
      }
    }

    // Set TLS version constraints
    if (config.sslMinVersion) {
      result.sslOptions.minVersion = config.sslMinVersion;
    }
    if (config.sslMaxVersion) {
      result.sslOptions.maxVersion = config.sslMaxVersion;
    }

    // Set cipher suites if specified
    if (config.sslCipherSuites) {
      result.sslOptions.ciphers = config.sslCipherSuites;
    }

    result.success = true;
    return result;
  } catch (error) {
    result.error = `SSL validation error: ${error.message}`;
    return result;
  }
}

// Create protocol logger instance (will be configured by server)
let protocolLogger = createProtocolLogger();

// Create query logger instance (will be configured by server)
let queryLogger = createQueryLogger();

/**
 * Configures the protocol logger for message processors
 * @param {Object} config - Logger configuration
 */
function configureMessageProcessorLogger(config) {
  protocolLogger = createProtocolLogger(config);
}

const {
  sendAuthenticationOK,
  sendParameterStatus,
  sendBackendKeyData,
  sendReadyForQuery,
  sendErrorResponse,
  sendParseComplete,
  sendBindComplete,
  sendRowDescription,
  sendAuthenticationSASL,
  sendAuthenticationSASLContinue,
  sendAuthenticationSASLFinal,
} = require('./messageBuilders');

const { executeQueryString, executeQuery } = require('../handlers/queryHandlers');

/**
 * Main message processing entry point
 * Routes messages based on connection authentication status
 * @param {Buffer} buffer - Message buffer
 * @param {Socket} socket - Client socket
 * @param {ConnectionState} connState - Connection state
 * @param {Object} config - Server configuration (optional)
 * @returns {number} Bytes processed (0 if need more data)
 */
function processMessage(buffer, socket, connState, config = null) {
  // Special handling for SCRAM authentication
  // During SCRAM, we receive password messages ('p') with SASL data even before authentication is complete
  if (!connState.authenticated && connState.scramState && buffer.length >= 5) {
    const messageType = String.fromCharCode(buffer[0]);
    if (messageType === 'p') {
      return processRegularMessage(buffer, socket, connState, config);
    }
  }

  if (!connState.authenticated) {
    return processStartupMessage(buffer, socket, connState, config);
  } else {
    return processRegularMessage(buffer, socket, connState, config);
  }
}

/**
 * Processes startup messages before authentication
 * Handles protocol negotiation, SSL requests, and initial authentication
 * @param {Buffer} buffer - Message buffer
 * @param {Socket} socket - Client socket
 * @param {ConnectionState} connState - Connection state
 * @param {Object} config - Server configuration (optional)
 * @returns {number} Bytes processed (0 if need more data)
 */
function processStartupMessage(buffer, socket, connState, config = null) {
  // Need at least 8 bytes for length + protocol version
  if (buffer.length < 8) {
    return 0;
  }

  const length = buffer.readInt32BE(0);

  // Need complete message
  if (buffer.length < length) {
    return 0;
  }

  const protocolVersion = buffer.readInt32BE(4);

  protocolLogger.received('StartupMessage', `length: ${length}, protocol: ${protocolVersion}`, {
    messageLength: length,
    protocolVersion: protocolVersion,
  });

  try {
    // Handle SSL request
    if (protocolVersion === SSL_REQUEST_CODE) {
      return handleSSLRequest(socket, config);
    }

    // Handle cancel request
    if (protocolVersion === CANCEL_REQUEST_CODE) {
      return handleCancelRequest(buffer, socket, length);
    }

    // Handle regular startup packet
    if (protocolVersion === PROTOCOL_VERSION_3_0) {
      return handleStartupPacket(buffer, socket, connState, length, config);
    }

    throw new Error(`Unsupported protocol version: ${protocolVersion}`);
  } catch (error) {
    console.error('Error processing startup message:', error);
    sendErrorResponse(socket, ERROR_CODES.PROTOCOL_VIOLATION, error.message);
    socket.end();
    return length;
  }
}

/**
 * Processes regular protocol messages after authentication
 * Routes to specific message handlers based on message type
 * @param {Buffer} buffer - Message buffer
 * @param {Socket} socket - Client socket
 * @param {ConnectionState} connState - Connection state
 * @param {Object} config - Server configuration (optional)
 * @returns {number} Bytes processed (0 if need more data)
 */
function processRegularMessage(buffer, socket, connState, _config = null) {
  // Need at least 5 bytes for message type + length
  if (buffer.length < 5) {
    return 0;
  }

  const messageType = getMessageType(buffer);
  const length = buffer.readInt32BE(1);

  // Need complete message
  if (buffer.length < length + 1) {
    return 0;
  }

  protocolLogger.received(messageType, `length: ${length}`, {
    messageType: messageType,
    messageLength: length,
  });

  try {
    switch (messageType) {
      case MESSAGE_TYPES.QUERY: // 'Q' - Simple Query
        return processSimpleQuery(buffer, socket, connState);

      case MESSAGE_TYPES.TERMINATE: // 'X' - Terminate
        return handleTerminate(socket, connState, length);

      case MESSAGE_TYPES.PARSE: // 'P' - Parse (Extended Query)
        return processParse(buffer, socket, connState);

      case MESSAGE_TYPES.BIND: // 'B' - Bind (Extended Query)
        return processBind(buffer, socket, connState);

      case MESSAGE_TYPES.DESCRIBE: // 'D' - Describe
        return processDescribe(buffer, socket, connState);

      case MESSAGE_TYPES.EXECUTE: // 'E' - Execute
        return processExecute(buffer, socket, connState);

      case MESSAGE_TYPES.SYNC: // 'S' - Sync
        return processSync(buffer, socket, connState);

      case MESSAGE_TYPES.PASSWORD_MESSAGE: // 'p' - Password Message
        return processPasswordMessage(buffer, socket, connState, _config);

      case MESSAGE_TYPES.COPY_DATA: // 'd' - Copy Data
        return processCopyData(buffer, socket, connState);

      case MESSAGE_TYPES.COPY_DONE: // 'c' - Copy Done
        return processCopyDone(buffer, socket, connState);

      case MESSAGE_TYPES.COPY_FAIL: // 'f' - Copy Fail
        return processCopyFail(buffer, socket, connState);

      case MESSAGE_TYPES.FUNCTION_CALL: // 'F' - Function Call
        return processFunctionCall(buffer, socket, connState);

      default:
        console.warn(`Unknown message type: ${messageType}`);
        sendErrorResponse(
          socket,
          ERROR_CODES.PROTOCOL_VIOLATION,
          `${ERROR_MESSAGES.UNKNOWN_MESSAGE_TYPE}: ${messageType}`
        );
        return length + 1;
    }
  } catch (error) {
    console.error(`Error processing ${messageType} message:`, error);
    sendErrorResponse(
      socket,
      ERROR_CODES.INTERNAL_ERROR,
      `${ERROR_MESSAGES.MESSAGE_PROCESSING_ERROR}: ${error.message}`
    );
    return length + 1;
  }
}

/**
 * Startup Message Handlers
 */

/**
 * Handles SSL request messages
 * @param {Socket} socket - Client socket
 * @param {Object} config - Server configuration (optional)
 * @returns {number} Bytes processed
 */
function handleSSLRequest(socket, config = null) {
  // First validate SSL configuration and certificates
  const validation = validateSSLCertificates(config);

  if (validation.success) {
    console.log('SSL request received - accepting');
    socket.write(Buffer.from('S')); // Accept SSL

    // Store validated SSL options with the socket state
    SSLState.markForUpgrade(socket, {
      ...config,
      validatedSSLOptions: validation.sslOptions,
    });

    // Emit event for SSL upgrade request
    socket.emit('sslUpgradeRequested');

    return 8; // SSL request is always 8 bytes
  } else {
    console.log(`SSL request received - rejecting (${validation.error})`);
    socket.write(Buffer.from('N')); // Reject SSL
    return 8; // SSL request is always 8 bytes
  }
}

/**
 * Handles cancel request messages
 * @param {Buffer} buffer - Message buffer
 * @param {Socket} socket - Client socket
 * @param {number} length - Message length
 * @returns {number} Bytes processed
 */
function handleCancelRequest(buffer, socket, length) {
  if (length >= 16) {
    // Should have PID and secret
    const pid = buffer.readInt32BE(8);
    const secret = buffer.readInt32BE(12);
    console.log(`Cancel request received for PID: ${pid}, Secret: ${secret}`);
    // In a real implementation, we'd find and cancel the query    } else {
    console.log(ERROR_MESSAGES.MALFORMED_CANCEL_REQUEST);
  }

  socket.end(); // Cancel requests close the connection
  return length;
}

/**
 * Handles regular startup packet with authentication
 * @param {Buffer} buffer - Message buffer
 * @param {Socket} socket - Client socket
 * @param {ConnectionState} connState - Connection state
 * @param {number} length - Message length
 * @param {Object} config - Server configuration
 * @returns {number} Bytes processed
 */
function handleStartupPacket(buffer, socket, connState, length, config = {}) {
  // Parse parameters from startup packet
  const parameters = parseParameters(buffer, 8, length);

  // Set connection parameters
  for (const [key, value] of parameters) {
    connState.setParameter(key, value);
  }

  // Ensure config is an object (handle null/undefined)
  const serverConfig = config || {};

  // Determine authentication method from config
  const authMethod = serverConfig.authMethod || 'trust';
  const requireAuth = serverConfig.requireAuthentication !== false; // Default to true unless explicitly false

  // Only skip authentication if method is trust AND authentication is not required
  if (authMethod === 'trust' && !requireAuth) {
    connState.authenticate(PROTOCOL_VERSION_3_0);
    sendAuthenticationOK(socket);
    sendParameterStatus(socket, connState);
    sendBackendKeyData(socket, connState);
    sendReadyForQuery(socket, connState);
    return length;
  }

  // Start authentication process - only SCRAM-SHA-256 and trust are supported
  if (authMethod === 'scram-sha-256') {
    startScramAuthentication(socket, connState, config);
  } else {
    // Default to trust authentication for any other method
    connState.authenticate(PROTOCOL_VERSION_3_0);
    sendAuthenticationOK(socket);
    sendParameterStatus(socket, connState);
    sendBackendKeyData(socket, connState);
    sendReadyForQuery(socket, connState);
  }

  return length;
}

/**
 * Regular Message Handlers
 */

/**
 * Processes simple query messages
 * @param {Buffer} buffer - Message buffer
 * @param {Socket} socket - Client socket
 * @param {ConnectionState} connState - Connection state
 * @returns {number} Bytes processed
 */
function processSimpleQuery(buffer, socket, connState) {
  const length = buffer.readInt32BE(1);

  // Extract query string (remove message type, length, and null terminator)
  const queryBuffer = buffer.slice(5, length);
  const query = queryBuffer.toString('utf8').replace(/\0$/, '').trim();

  console.log(`Executing simple query: ${query}`);

  // Increment query counter
  connState.incrementQueryCount();

  // Execute the query string (handles multiple statements)
  executeQueryString(query, socket, connState);

  sendReadyForQuery(socket, connState);
  return length + 1;
}

/**
 * Handles connection termination
 * @param {Socket} socket - Client socket
 * @param {ConnectionState} connState - Connection state
 * @param {number} length - Message length
 * @returns {number} Bytes processed
 */
function handleTerminate(socket, connState, length) {
  console.log(`Client ${connState.getCurrentUser()} requested termination`);
  connState.close();
  socket.end();
  return length + 1;
}

/**
 * Extended Query Protocol Handlers
 */

/**
 * Processes Parse messages for prepared statements
 * @param {Buffer} buffer - Message buffer
 * @param {Socket} socket - Client socket
 * @param {ConnectionState} connState - Connection state
 * @returns {number} Bytes processed
 */
function processParse(buffer, socket, connState) {
  const length = buffer.readInt32BE(1);

  try {
    // Basic Parse implementation - extract statement name and query
    let offset = 5; // Skip message type and length

    // Read statement name (null-terminated)
    const stmtNameStart = offset;
    while (offset < buffer.length && buffer[offset] !== 0) offset++;
    const statementName = buffer.slice(stmtNameStart, offset).toString('utf8');
    offset++; // Skip null terminator

    // Read query string (null-terminated)
    const queryStart = offset;
    while (offset < buffer.length && buffer[offset] !== 0) offset++;
    const query = buffer.slice(queryStart, offset).toString('utf8');
    offset++; // Skip null terminator

    // Read parameter count
    const paramCount = buffer.readInt16BE(offset);
    offset += 2;

    // Read parameter types (if any)
    const paramTypes = [];
    for (let i = 0; i < paramCount; i++) {
      paramTypes.push(buffer.readInt32BE(offset));
      offset += 4;
    }

    console.log(
      `Parse: statement="${statementName || '(unnamed)'}", query="${query}", params=${paramCount}`
    );

    // Store the prepared statement
    connState.addPreparedStatement(statementName, {
      query,
      paramTypes,
      paramCount,
    });

    sendParseComplete(socket);
    return length + 1;
  } catch (error) {
    console.error('Error parsing Parse message:', error);
    sendErrorResponse(socket, ERROR_CODES.PROTOCOL_VIOLATION, ERROR_MESSAGES.INVALID_PARSE_MESSAGE);
    return length + 1;
  }
}

/**
 * Processes Bind messages for portals
 * @param {Buffer} buffer - Message buffer
 * @param {Socket} socket - Client socket
 * @param {ConnectionState} connState - Connection state
 * @returns {number} Bytes processed
 */
function processBind(buffer, socket, connState) {
  const length = buffer.readInt32BE(1);

  try {
    // Enhanced Bind implementation with parameter parsing
    let offset = 5; // Skip message type and length

    // Read portal name
    const portalStart = offset;
    while (offset < buffer.length && buffer[offset] !== 0) offset++;
    const portalName = buffer.slice(portalStart, offset).toString('utf8');
    offset++; // Skip null terminator

    // Read statement name
    const stmtStart = offset;
    while (offset < buffer.length && buffer[offset] !== 0) offset++;
    const statementName = buffer.slice(stmtStart, offset).toString('utf8');
    offset++; // Skip null terminator

    // Get the prepared statement
    const statement = connState.getPreparedStatement(statementName);
    if (!statement) {
      sendErrorResponse(
        socket,
        ERROR_CODES.UNDEFINED_FUNCTION,
        `Prepared statement "${statementName}" does not exist`
      );
      return length + 1;
    }

    let parameters = [];
    let parameterFormats = [];

    try {
      // Read parameter format codes count
      if (offset + 2 <= buffer.length) {
        const formatCount = buffer.readInt16BE(offset);
        offset += 2;

        // Read format codes (0 = text, 1 = binary)
        for (let i = 0; i < formatCount && offset + 2 <= buffer.length; i++) {
          parameterFormats.push(buffer.readInt16BE(offset));
          offset += 2;
        }
      }

      // Read parameter count
      if (offset + 2 <= buffer.length) {
        const paramCount = buffer.readInt16BE(offset);
        offset += 2;

        // Read parameters
        for (let i = 0; i < paramCount && offset + 4 <= buffer.length; i++) {
          const paramLength = buffer.readInt32BE(offset);
          offset += 4;

          if (paramLength === -1) {
            // NULL parameter
            parameters.push(null);
          } else if (paramLength >= 0 && offset + paramLength <= buffer.length) {
            // Read parameter value
            const format = parameterFormats[i] || parameterFormats[0] || 0; // Default to text
            let paramValue;

            if (format === 0) {
              // Text format
              paramValue = buffer.slice(offset, offset + paramLength).toString('utf8');
            } else {
              // Binary format - store as hex string for logging
              paramValue = buffer.slice(offset, offset + paramLength).toString('hex');
            }

            parameters.push(paramValue);
            offset += paramLength;
          } else {
            // Invalid parameter length
            parameters.push('<invalid>');
            break;
          }
        }
      }
    } catch (paramError) {
      // If parameter parsing fails, continue with empty parameters
      console.warn('Parameter parsing failed:', paramError.message);
      parameters = [];
    }

    console.log(
      `Bind: portal="${portalName || '(unnamed)'}", ` +
        `statement="${statementName || '(unnamed)'}", parameters=${parameters.length}`
    );

    // Log query with parameters using the enhanced query logger
    if (parameters.length > 0) {
      queryLogger.queryWithParameters(statement.query, parameters, {
        connectionId: connState.connectionId,
        user: connState.getCurrentUser(),
        database: connState.getCurrentDatabase(),
        statementName: statementName || '(unnamed)',
        portalName: portalName || '(unnamed)',
      });
    }

    // Store the portal with parameters
    connState.addPortal(portalName, {
      statement: statementName,
      query: statement.query,
      parameters,
      parameterFormats,
      boundAt: new Date(),
    });

    sendBindComplete(socket);
    return length + 1;
  } catch (error) {
    console.error('Error parsing Bind message:', error);
    sendErrorResponse(socket, ERROR_CODES.PROTOCOL_VIOLATION, ERROR_MESSAGES.INVALID_BIND_MESSAGE);
    return length + 1;
  }
}

/**
 * Processes Describe messages
 * @param {Buffer} buffer - Message buffer
 * @param {Socket} socket - Client socket
 * @param {ConnectionState} connState - Connection state
 * @returns {number} Bytes processed
 */
function processDescribe(buffer, socket, connState) {
  const length = buffer.readInt32BE(1);

  try {
    const describeType = String.fromCharCode(buffer[5]); // 'S' or 'P'
    let offset = 6;

    // Read name
    const nameStart = offset;
    while (offset < buffer.length && buffer[offset] !== 0) offset++;
    const name = buffer.slice(nameStart, offset).toString('utf8');

    console.log(`Describe: type=${describeType}, name="${name || '(unnamed)'}"`);

    if (describeType === 'S') {
      // Describe statement - send parameter description and row description
      const statement = connState.getPreparedStatement(name);
      if (statement) {
        // For simplicity, just send a basic row description
        sendRowDescription(socket, [
          {
            name: 'result',
            dataTypeOID: 25,
            dataTypeSize: -1,
          },
        ]);
      } else {
        sendErrorResponse(
          socket,
          ERROR_CODES.UNDEFINED_FUNCTION,
          `Prepared statement "${name}" does not exist`
        );
      }
    } else if (describeType === 'P') {
      // Describe portal - send row description
      const portal = connState.getPortal(name);
      if (portal) {
        sendRowDescription(socket, [
          {
            name: 'result',
            dataTypeOID: 25,
            dataTypeSize: -1,
          },
        ]);
      } else {
        sendErrorResponse(
          socket,
          ERROR_CODES.UNDEFINED_FUNCTION,
          `Portal "${name}" does not exist`
        );
      }
    }

    return length + 1;
  } catch (error) {
    console.error('Error parsing Describe message:', error);
    sendErrorResponse(
      socket,
      ERROR_CODES.PROTOCOL_VIOLATION,
      ERROR_MESSAGES.INVALID_DESCRIBE_MESSAGE
    );
    return length + 1;
  }
}

/**
 * Processes Execute messages
 * @param {Buffer} buffer - Message buffer
 * @param {Socket} socket - Client socket
 * @param {ConnectionState} connState - Connection state
 * @returns {number} Bytes processed
 */
function processExecute(buffer, socket, connState) {
  const length = buffer.readInt32BE(1);

  try {
    let offset = 5; // Skip message type and length

    // Read portal name
    const portalStart = offset;
    while (offset < buffer.length && buffer[offset] !== 0) offset++;
    const portalName = buffer.slice(portalStart, offset).toString('utf8');
    offset++; // Skip null terminator

    // Read row limit
    // const rowLimit = buffer.readInt32BE(offset);

    // Get the portal
    const portal = connState.getPortal(portalName);
    if (!portal) {
      sendErrorResponse(
        socket,
        ERROR_CODES.UNDEFINED_FUNCTION,
        `${ERROR_MESSAGES.PORTAL_DOES_NOT_EXIST}: "${portalName}"`
      );
      return length + 1;
    }

    // Execute the query from the portal
    connState.incrementQueryCount();

    // Log parameters if available
    if (portal.parameters && portal.parameters.length > 0) {
      queryLogger.queryWithParameters(portal.query, portal.parameters, {
        connectionId: connState.connectionId,
        user: connState.getCurrentUser(),
        database: connState.getCurrentDatabase(),
        portalName: portalName || '(unnamed)',
      });
    }

    executeQuery(portal.query || "SELECT 'Extended query result'", socket, connState);

    return length + 1;
  } catch (error) {
    console.error('Error parsing Execute message:', error);
    sendErrorResponse(
      socket,
      ERROR_CODES.PROTOCOL_VIOLATION,
      ERROR_MESSAGES.INVALID_EXECUTE_MESSAGE
    );
    return length + 1;
  }
}

/**
 * Processes Sync messages
 * @param {Buffer} buffer - Message buffer
 * @param {Socket} socket - Client socket
 * @param {ConnectionState} connState - Connection state
 * @returns {number} Bytes processed
 */
function processSync(buffer, socket, connState) {
  const length = buffer.readInt32BE(1);

  console.log('Sync: Transaction sync point');

  // Clear unnamed prepared statements and portals
  connState.clearUnnamed();

  sendReadyForQuery(socket, connState);
  return length + 1;
}

/**
 * Additional Protocol Handlers
 */

/**
 * Processes Password messages (for authentication)
 * @param {Buffer} buffer - Message buffer
 * @param {Socket} socket - Client socket
 * @param {ConnectionState} connState - Connection state
 * @param {Object} config - Server configuration (optional)
 * @returns {number} Bytes processed
 */
function processPasswordMessage(buffer, socket, connState, config = {}) {
  const length = buffer.readInt32BE(1);

  // Check if this is a SASL message during SCRAM authentication
  if (connState.scramState === SCRAM_STATES.INITIAL) {
    // This is SASL initial response
    return processSASLInitialResponse(buffer, socket, connState, config);
  } else if (connState.scramState === SCRAM_STATES.FIRST_SENT) {
    // This is SASL response
    return processSASLResponse(buffer, socket, connState);
  }

  // Only SCRAM authentication is supported for password messages
  // If we reach here, it means we received a password message outside of SCRAM flow
  sendErrorResponse(
    socket,
    ERROR_CODES.PROTOCOL_VIOLATION,
    'password authentication not supported, use SCRAM-SHA-256'
  );
  return length + 1;
}

/**
 * Processes COPY Data messages
 * @param {Buffer} buffer - Message buffer
 * @param {Socket} socket - Client socket
 * @param {ConnectionState} connState - Connection state
 * @returns {number} Bytes processed
 */
function processCopyData(buffer, socket, connState) {
  const length = buffer.readInt32BE(1);

  // Extract copy data
  const data = buffer.slice(5, length + 1);

  console.log(`Copy data received: ${data.length} bytes`);

  // Get copy state
  const copyState = connState.getCopyState();
  if (!copyState) {
    console.error('Received COPY data but no COPY operation in progress');
    return length + 1;
  }

  try {
    // Process the copy data based on format
    if (copyState.binary) {
      processCopyDataBinary(data, copyState, connState);
    } else {
      processCopyDataText(data, copyState, connState);
    }

    // Update statistics
    connState.updateCopyStats(data.length, 0); // Rows will be counted during parsing

  } catch (error) {
    console.error('Error processing COPY data:', error.message);
    
    const { sendErrorResponse } = require('./messageBuilders');
    sendErrorResponse(
      socket,
      ERROR_CODES.DATA_EXCEPTION,
      `COPY data processing failed: ${error.message}`
    );
  }

  return length + 1;
}

/**
 * Processes binary COPY data
 * @param {Buffer} data - Binary data buffer
 * @param {Object} copyState - COPY operation state
 * @param {ConnectionState} connState - Connection state
 */
function processCopyDataBinary(data, copyState, connState) {
  // Binary format processing
  let offset = 0;
  let rowCount = 0;

  // Skip binary header if this is the first chunk
  if (!copyState.headerProcessed) {
    // Check for PGCOPY signature
    const signature = data.slice(0, 11).toString('binary');
    if (signature === 'PGCOPY\n\xff\r\n\0') {
      offset = 15; // Skip signature + flags + extension length
      copyState.headerProcessed = true;
    }
  }

  // Process data rows
  while (offset < data.length - 2) { // -2 for potential end marker
    // Check for end marker
    const fieldCount = data.readInt16BE(offset);
    if (fieldCount === -1) {
      // End of data marker
      break;
    }

    offset += 2;
    const row = {};
    
    // Read field data
    for (let i = 0; i < fieldCount; i++) {
      const fieldLength = data.readInt32BE(offset);
      offset += 4;
      
      if (fieldLength === -1) {
        // NULL value
        row[`col_${i}`] = null;
      } else {
        const fieldData = data.slice(offset, offset + fieldLength);
        row[`col_${i}`] = fieldData.toString('utf8');
        offset += fieldLength;
      }
    }
    
    rowCount++;
    
    // Store row data (in a real implementation, this would go to a database)
    if (!copyState.receivedRows) {
      copyState.receivedRows = [];
    }
    copyState.receivedRows.push(row);
  }

  connState.updateCopyStats(0, rowCount);
  console.log(`Processed ${rowCount} rows from binary COPY data`);
}

/**
 * Processes text COPY data
 * @param {Buffer} data - Text data buffer
 * @param {Object} copyState - COPY operation state
 * @param {ConnectionState} connState - Connection state
 */
function processCopyDataText(data, copyState, connState) {
  // Convert buffer to string
  const text = data.toString('utf8');
  const delimiter = copyState.delimiter || '\t';
  const nullString = copyState.nullString || '\\N';
  
  // Split into lines
  const lines = text.split('\n').filter(line => line.length > 0);
  let rowCount = 0;

  for (const line of lines) {
    if (line.trim() === '') continue;
    
    // Parse line into fields
    const fields = parseCopyTextLine(line, delimiter, copyState.quote);
    const row = {};
    
    fields.forEach((field, index) => {
      // Handle NULL values
      if (field === nullString) {
        row[`col_${index}`] = null;
      } else {
        row[`col_${index}`] = field;
      }
    });
    
    rowCount++;
    
    // Store row data (in a real implementation, this would go to a database)
    if (!copyState.receivedRows) {
      copyState.receivedRows = [];
    }
    copyState.receivedRows.push(row);
  }

  connState.updateCopyStats(0, rowCount);
  console.log(`Processed ${rowCount} rows from text COPY data`);
}

/**
 * Parses a COPY text line with proper field separation
 * @param {string} line - Text line to parse
 * @param {string} delimiter - Field delimiter
 * @param {string} quote - Quote character
 * @returns {Array} Array of field values
 */
function parseCopyTextLine(line, delimiter, quote = '"') {
  const fields = [];
  let current = '';
  let inQuotes = false;
  let i = 0;

  while (i < line.length) {
    const char = line[i];

    if (char === quote && !inQuotes) {
      inQuotes = true;
    } else if (char === quote && inQuotes) {
      // Check for escaped quote
      if (i + 1 < line.length && line[i + 1] === quote) {
        current += quote;
        i++; // Skip next quote
      } else {
        inQuotes = false;
      }
    } else if (char === delimiter && !inQuotes) {
      fields.push(current);
      current = '';
    } else {
      current += char;
    }

    i++;
  }

  // Add the last field
  fields.push(current);

  return fields;
}

/**
 * Processes COPY Done messages
 * @param {Buffer} buffer - Message buffer
 * @param {Socket} socket - Client socket
 * @param {ConnectionState} connState - Connection state
 * @returns {number} Bytes processed
 */
function processCopyDone(buffer, socket, connState) {
  const length = buffer.readInt32BE(1);

  console.log('Copy done received');

  // Get copy state
  const copyState = connState.getCopyState();
  if (!copyState) {
    console.error('Received COPY done but no COPY operation in progress');
    return length + 1;
  }

  try {
    // Finalize the copy operation
    const rowCount = copyState.rowsTransferred || 0;
    const bytesCount = copyState.bytesTransferred || 0;
    
    console.log(`COPY operation completed: ${rowCount} rows, ${bytesCount} bytes transferred`);

    // Clear copy state
    connState.clearCopyState();

    // Send command complete
    const { sendCommandComplete } = require('./messageBuilders');
    sendCommandComplete(socket, `COPY ${rowCount}`);

  } catch (error) {
    console.error('Error finalizing COPY operation:', error.message);
    
    const { sendErrorResponse } = require('./messageBuilders');
    sendErrorResponse(
      socket,
      ERROR_CODES.DATA_EXCEPTION,
      `COPY finalization failed: ${error.message}`
    );
  }

  return length + 1;
}

/**
 * Processes COPY Fail messages
 * @param {Buffer} buffer - Message buffer
 * @param {Socket} socket - Client socket
 * @param {ConnectionState} connState - Connection state
 * @returns {number} Bytes processed
 */
function processCopyFail(buffer, socket, connState) {
  const length = buffer.readInt32BE(1);

  // Extract error message
  const errorMessage = buffer.slice(5, length).toString('utf8').replace(/\0$/, '');

  console.log(`Copy failed: ${errorMessage}`);

  // Get copy state
  const copyState = connState.getCopyState();
  if (copyState) {
    console.log(`COPY operation failed after ${copyState.rowsTransferred} rows, ` +
      `${copyState.bytesTransferred} bytes transferred`);
    
    // Clear copy state
    connState.clearCopyState();
  }

  // Send error response
  sendErrorResponse(
    socket,
    ERROR_CODES.DATA_EXCEPTION,
    `${ERROR_MESSAGES.COPY_FAILED}: ${errorMessage}`
  );

  return length + 1;
}

/**
 * Processes Function Call messages
 * @param {Buffer} buffer - Message buffer
 * @param {Socket} socket - Client socket
 * @param {ConnectionState} connState - Connection state
 * @returns {number} Bytes processed
 */
function processFunctionCall(buffer, socket, _connState) {
  const length = buffer.readInt32BE(1);

  console.log('Function call received (not implemented)');

  // Send error - function call not supported
  sendErrorResponse(
    socket,
    ERROR_CODES.FEATURE_NOT_SUPPORTED,
    ERROR_MESSAGES.FUNCTION_CALL_NOT_SUPPORTED
  );

  return length + 1;
}

/**
 * Authentication Handlers
 */

/**
 * Starts SCRAM-SHA-256 authentication
 * @param {Socket} socket - Client socket
 * @param {ConnectionState} connState - Connection state
 * @param {Object} config - Server configuration
 */
function startScramAuthentication(socket, connState, _config) {
  const mechanisms = [SASL_MECHANISMS.SCRAM_SHA_256];
  connState.scramState = SCRAM_STATES.INITIAL;
  connState.scramMechanism = SASL_MECHANISMS.SCRAM_SHA_256;

  sendAuthenticationSASL(socket, mechanisms);
  protocolLogger.sent('SCRAM Authentication Started', `mechanisms: ${mechanisms.join(', ')}`);
}

/**
 * Processes SASL initial response for SCRAM
 * @param {Buffer} buffer - Message buffer
 * @param {Socket} socket - Client socket
 * @param {ConnectionState} connState - Connection state
 * @param {Object} config - Server configuration
 * @returns {number} Bytes processed
 */
function processSASLInitialResponse(buffer, socket, connState, config) {
  const length = buffer.readInt32BE(1);

  try {
    // Read mechanism name (null-terminated)
    let offset = 5;
    const mechanismStart = offset;
    while (offset < buffer.length && buffer[offset] !== 0) offset++;
    const mechanism = buffer.slice(mechanismStart, offset).toString('utf8');
    offset++; // Skip null terminator

    // Read initial response length
    const responseLength = buffer.readInt32BE(offset);
    offset += 4;

    // Read initial response data
    const initialResponse = buffer.slice(offset, offset + responseLength).toString('utf8');

    if (mechanism !== SASL_MECHANISMS.SCRAM_SHA_256) {
      connState.scramState = SCRAM_STATES.ERROR;
      sendErrorResponse(
        socket,
        ERROR_CODES.FEATURE_NOT_SUPPORTED,
        ERROR_MESSAGES.SCRAM_MECHANISM_NOT_SUPPORTED
      );
      return length + 1;
    }

    // Parse client initial message
    const clientInitial = parseScramClientInitial(initialResponse);
    console.log('Parsed client initial:', clientInitial);

    // For SCRAM, if username is empty or "*" in the SASL message, use the one from connection parameters
    // Some clients send "*" instead of the actual username for privacy
    let username;
    if (clientInitial.username && clientInitial.username !== '*') {
      username = clientInitial.username;
    } else {
      username = connState.getCurrentUser();
    }
    console.log('Using username:', username);

    if (!username || !clientInitial.nonce) {
      connState.scramState = SCRAM_STATES.ERROR;
      sendErrorResponse(
        socket,
        ERROR_CODES.SCRAM_INVALID_AUTHORIZATION_MESSAGE,
        ERROR_MESSAGES.SCRAM_INVALID_AUTHORIZATION_MESSAGE
      );
      return length + 1;
    }

    // Validate username against configured username
    const expectedUsername = config.username || 'postgres';
    if (username !== expectedUsername) {
      connState.scramState = SCRAM_STATES.ERROR;
      sendErrorResponse(
        socket,
        ERROR_CODES.INVALID_AUTHORIZATION_SPECIFICATION,
        `role "${username}" does not exist`
      );
      return length + 1;
    }

    // Store SCRAM state
    connState.scramMechanism = mechanism;
    connState.scramClientNonce = clientInitial.nonce;
    connState.scramServerNonce = generateScramNonce();
    // Use the actual client-first-message-bare that was sent by the client
    // The format is "n,,<client-first-message-bare>" so we skip the first 3 characters
    connState.scramClientInitialBare = initialResponse.substring(3);

    // Generate mock credentials (in real implementation, fetch from user store)
    const iterations = config.scramIterations || 4096;
    const mockPassword = config.password || 'password'; // Use configured password
    connState.scramCredentials = generateScramCredentials(mockPassword, iterations);

    // Build server first message
    const serverFirst = buildScramServerFirst(
      connState.scramClientNonce,
      connState.scramServerNonce,
      connState.scramCredentials.salt,
      connState.scramCredentials.iterations
    );

    connState.scramServerFirst = serverFirst;
    connState.scramState = SCRAM_STATES.FIRST_SENT;

    sendAuthenticationSASLContinue(socket, serverFirst);

    return length + 1;
  } catch (error) {
    console.error('Error processing SASL initial response:', error);
    connState.scramState = SCRAM_STATES.ERROR;
    sendErrorResponse(
      socket,
      ERROR_CODES.SCRAM_INVALID_AUTHORIZATION_MESSAGE,
      ERROR_MESSAGES.SCRAM_INVALID_AUTHORIZATION_MESSAGE
    );
    return length + 1;
  }
}

/**
 * Processes SASL response for SCRAM
 * @param {Buffer} buffer - Message buffer
 * @param {Socket} socket - Client socket
 * @param {ConnectionState} connState - Connection state
 * @returns {number} Bytes processed
 */
function processSASLResponse(buffer, socket, connState) {
  const length = buffer.readInt32BE(1);

  // Read response data
  const responseData = buffer.slice(5, length + 1).toString('utf8');

  if (connState.scramState !== SCRAM_STATES.FIRST_SENT) {
    console.log('ERROR: Invalid SCRAM state:', connState.scramState);
    sendErrorResponse(socket, ERROR_CODES.PROTOCOL_VIOLATION, ERROR_MESSAGES.PROTOCOL_ERROR);
    return length + 1;
  }

  // Parse client final message
  const clientFinal = parseScramClientFinal(responseData);

  if (!clientFinal.nonce || !clientFinal.proof) {
    console.log('ERROR: Missing nonce or proof in client final');
    connState.scramState = SCRAM_STATES.ERROR;
    sendErrorResponse(
      socket,
      ERROR_CODES.SCRAM_INVALID_AUTHORIZATION_MESSAGE,
      ERROR_MESSAGES.SCRAM_INVALID_AUTHORIZATION_MESSAGE
    );
    return length + 1;
  }

  // Verify nonce
  const expectedNonce = connState.scramClientNonce + connState.scramServerNonce;

  if (clientFinal.nonce !== expectedNonce) {
    console.log('ERROR: Nonce mismatch');
    sendErrorResponse(socket, ERROR_CODES.SCRAM_INVALID_NONCE, ERROR_MESSAGES.SCRAM_INVALID_NONCE);
    return length + 1;
  }

  // Build auth message
  const clientFinalWithoutProof = responseData.substring(0, responseData.lastIndexOf(',p='));

  const authMessage = buildScramAuthMessage(
    connState.scramClientInitialBare,
    connState.scramServerFirst,
    clientFinalWithoutProof
  );

  const isValidProof = verifyScramClientProof(
    clientFinal.proof,
    connState.scramCredentials.storedKey,
    authMessage
  );

  if (!isValidProof) {
    console.log('ERROR: Invalid client proof - authentication failed');
    connState.scramState = SCRAM_STATES.ERROR;
    sendErrorResponse(socket, ERROR_CODES.SCRAM_INVALID_PROOF, ERROR_MESSAGES.SCRAM_INVALID_PROOF);
    return length + 1;
  }

  // Generate server signature
  const serverSignature = generateScramServerSignature(
    connState.scramCredentials.serverKey,
    authMessage
  );

  const serverFinal = buildScramServerFinal(serverSignature);

  connState.scramState = SCRAM_STATES.ENDED;

  // Send SASL final with server verification
  sendAuthenticationSASLFinal(socket, serverFinal);

  // Complete authentication
  connState.authenticate(PROTOCOL_VERSION_3_0);
  sendAuthenticationOK(socket);
  sendParameterStatus(socket, connState);
  sendBackendKeyData(socket, connState);
  sendReadyForQuery(socket, connState);

  return length + 1;
}

module.exports = {
  processMessage,
  processStartupMessage,
  processRegularMessage,
  processSimpleQuery,
  processParse,
  processBind,
  processDescribe,
  processExecute,
  processSync,
  processPasswordMessage,
  processCopyData,
  processCopyDone,
  processCopyFail,
  processFunctionCall,
  handleSSLRequest,
  handleCancelRequest,
  handleStartupPacket,
  handleTerminate,
  configureMessageProcessorLogger,
  SSLState,
  validateSSLCertificates,
  // Authentication functions
  startScramAuthentication,
  processSASLInitialResponse,
  processSASLResponse,
};
