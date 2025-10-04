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
} = require('./constants');

const { parseParameters, getMessageType } = require('./utils');
const { createProtocolLogger } = require('../utils/logger');

// Create protocol logger instance (will be configured by server)
let protocolLogger = createProtocolLogger();

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
} = require('./messageBuilders');

const { executeQueryString, executeQuery } = require('../handlers/queryHandlers');

/**
 * Main message processing entry point
 * Routes messages based on connection authentication status
 * @param {Buffer} buffer - Message buffer
 * @param {Socket} socket - Client socket
 * @param {ConnectionState} connState - Connection state
 * @param {StatsCollector} statsCollector - Optional stats collector for monitoring
 * @returns {number} Bytes processed (0 if need more data)
 */
function processMessage(buffer, socket, connState, statsCollector = null) {
  if (!connState.authenticated) {
    return processStartupMessage(buffer, socket, connState, statsCollector);
  } else {
    return processRegularMessage(buffer, socket, connState, statsCollector);
  }
}

/**
 * Processes startup messages before authentication
 * Handles protocol negotiation, SSL requests, and initial authentication
 * @param {Buffer} buffer - Message buffer
 * @param {Socket} socket - Client socket
 * @param {ConnectionState} connState - Connection state
 * @returns {number} Bytes processed (0 if need more data)
 */
function processStartupMessage(buffer, socket, connState, statsCollector = null) {
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
      return handleSSLRequest(socket);
    }

    // Handle cancel request
    if (protocolVersion === CANCEL_REQUEST_CODE) {
      return handleCancelRequest(buffer, socket, length);
    }

    // Handle regular startup packet
    if (protocolVersion === PROTOCOL_VERSION_3_0) {
      return handleStartupPacket(buffer, socket, connState, length);
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
 * @returns {number} Bytes processed (0 if need more data)
 */
function processRegularMessage(buffer, socket, connState, statsCollector = null) {
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
        return processSimpleQuery(buffer, socket, connState, statsCollector);

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
        return processPasswordMessage(buffer, socket, connState);

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
 * @returns {number} Bytes processed
 */
function handleSSLRequest(socket) {
  console.log('SSL request received - rejecting');
  socket.write(Buffer.from('N')); // Reject SSL
  return 8; // SSL request is always 8 bytes
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
 * @returns {number} Bytes processed
 */
function handleStartupPacket(buffer, socket, connState, length) {
  // Parse parameters from startup packet
  const parameters = parseParameters(buffer, 8, length);

  // Set connection parameters
  for (const [key, value] of parameters) {
    connState.setParameter(key, value);
  }

  // Authenticate the connection
  connState.authenticate(PROTOCOL_VERSION_3_0);

  // Send authentication sequence
  sendAuthenticationOK(socket);
  sendParameterStatus(socket, connState);
  sendBackendKeyData(socket, connState);
  sendReadyForQuery(socket, connState);

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
 * @param {StatsCollector} statsCollector - Optional stats collector for monitoring
 * @returns {number} Bytes processed
 */
function processSimpleQuery(buffer, socket, connState, statsCollector = null) {
  const length = buffer.readInt32BE(1);

  // Extract query string (remove message type, length, and null terminator)
  const queryBuffer = buffer.slice(5, length);
  const query = queryBuffer.toString('utf8').replace(/\0$/, '').trim();

  console.log(`Executing simple query: ${query}`);

  // Record protocol message for monitoring
  if (statsCollector) {
    statsCollector.recordProtocolMessage('QUERY', false);
  }

  // Increment query counter
  connState.incrementQueryCount();

  // Execute the query string (handles multiple statements)
  executeQueryString(query, socket, connState, statsCollector);

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
    // Basic Bind implementation
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

    console.log(
      `Bind: portal="${portalName || '(unnamed)'}", statement="${statementName || '(unnamed)'}"`
    );

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

    // Store the portal (simplified - not parsing parameters and formats)
    connState.addPortal(portalName, {
      statement: statementName,
      query: statement.query,
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
    const rowLimit = buffer.readInt32BE(offset);

    console.log(`Execute: portal="${portalName || '(unnamed)'}", limit=${rowLimit}`);

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
 * @returns {number} Bytes processed
 */
function processPasswordMessage(buffer, socket, connState) {
  const length = buffer.readInt32BE(1);

  // Extract password (null-terminated) - not used in this mock implementation
  // const password = buffer.slice(5, length).toString('utf8').replace(/\0$/, '');

  console.log(`Password message received for user: ${connState.getCurrentUser()}`);

  // In a real implementation, we'd validate the password
  // For now, just accept any password
  sendAuthenticationOK(socket);
  sendParameterStatus(socket, connState);
  sendBackendKeyData(socket, connState);
  sendReadyForQuery(socket, connState);

  return length + 1;
}

/**
 * Processes COPY Data messages
 * @param {Buffer} buffer - Message buffer
 * @param {Socket} socket - Client socket
 * @param {ConnectionState} connState - Connection state
 * @returns {number} Bytes processed
 */
function processCopyData(buffer, _socket, _connState) {
  const length = buffer.readInt32BE(1);

  // Extract copy data
  const data = buffer.slice(5, length + 1);

  console.log(`Copy data received: ${data.length} bytes`);

  // In a real implementation, we'd process the copy data
  // For now, just acknowledge receipt

  return length + 1;
}

/**
 * Processes COPY Done messages
 * @param {Buffer} buffer - Message buffer
 * @param {Socket} socket - Client socket
 * @param {ConnectionState} connState - Connection state
 * @returns {number} Bytes processed
 */
function processCopyDone(buffer, socket, _connState) {
  const length = buffer.readInt32BE(1);

  console.log('Copy done received');

  // In a real implementation, we'd finalize the copy operation
  // For now, just send command complete
  const { sendCommandComplete } = require('./messageBuilders');
  sendCommandComplete(socket, 'COPY 0');

  return length + 1;
}

/**
 * Processes COPY Fail messages
 * @param {Buffer} buffer - Message buffer
 * @param {Socket} socket - Client socket
 * @param {ConnectionState} connState - Connection state
 * @returns {number} Bytes processed
 */
function processCopyFail(buffer, socket, _connState) {
  const length = buffer.readInt32BE(1);

  // Extract error message
  const errorMessage = buffer.slice(5, length).toString('utf8').replace(/\0$/, '');

  console.log(`Copy failed: ${errorMessage}`);

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
};
