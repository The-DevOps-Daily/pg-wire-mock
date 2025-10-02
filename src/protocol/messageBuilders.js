/**
 * PostgreSQL Wire Protocol Message Builders
 * Functions for building and sending protocol messages to clients
 */

const { MESSAGE_TYPES, DATA_TYPES, ERROR_SEVERITY } = require('./constants');

const { createMessage, createPayload, createErrorFields, writeCString } = require('./utils');

/**
 * Authentication and Connection Messages
 */

/**
 * Sends AuthenticationOK message indicating successful authentication
 * @param {Socket} socket - Client socket
 */
function sendAuthenticationOK(socket) {
  const message = createMessage(MESSAGE_TYPES.AUTHENTICATION, createPayload(0));
  socket.write(message);
  console.log('Sent AuthenticationOK');
}

/**
 * Sends ParameterStatus messages for server configuration
 * @param {Socket} socket - Client socket
 * @param {ConnectionState} connState - Connection state object
 */
function sendParameterStatus(socket, connState) {
  // Get server configuration
  const { createServerParameters } = require('../config/serverConfig');
  const { loadConfig } = require('../config/serverConfig');
  const config = loadConfig();

  // Create parameters object with defaults and user overrides
  const parameters = createServerParameters(config);

  // Override with user-specific parameters
  if (connState.parameters.has('application_name')) {
    parameters.application_name = connState.parameters.get('application_name');
  }
  if (connState.parameters.has('user')) {
    parameters.session_authorization = connState.parameters.get('user');
  }

  for (const [name, value] of Object.entries(parameters)) {
    const message = createMessage(MESSAGE_TYPES.PARAMETER_STATUS, createPayload(name, value));
    socket.write(message);
  }
  console.log('Sent ParameterStatus messages');
}

/**
 * Sends BackendKeyData with process ID and secret for cancellation
 * @param {Socket} socket - Client socket
 * @param {ConnectionState} connState - Connection state object
 */
function sendBackendKeyData(socket, connState) {
  const payload = createPayload(connState.backendPid, connState.backendSecret);
  const message = createMessage(MESSAGE_TYPES.BACKEND_KEY_DATA, payload);
  socket.write(message);
  console.log(
    `Sent BackendKeyData (PID: ${connState.backendPid}, Secret: ${connState.backendSecret})`,
  );
}

/**
 * Sends ReadyForQuery indicating server is ready for next command
 * @param {Socket} socket - Client socket
 * @param {ConnectionState} connState - Connection state object
 */
function sendReadyForQuery(socket, connState) {
  const statusBuffer = Buffer.from([connState.transactionStatus.charCodeAt(0)]);
  const message = createMessage(MESSAGE_TYPES.READY_FOR_QUERY, statusBuffer);
  socket.write(message);
  console.log(`Sent ReadyForQuery (status: ${connState.transactionStatus})`);
}

/**
 * Query Result Messages
 */

/**
 * Sends RowDescription message describing result columns
 * @param {Socket} socket - Client socket
 * @param {Array} columns - Array of column descriptors
 */
function sendRowDescription(socket, columns) {
  let payload = Buffer.alloc(2);
  payload.writeInt16BE(columns.length, 0); // Number of fields

  const columnBuffers = [];

  for (const col of columns) {
    const nameBuffer = writeCString(col.name || 'column');

    // Create field metadata buffer (18 bytes after name)
    const metadataBuffer = Buffer.alloc(18);
    let offset = 0;

    metadataBuffer.writeInt32BE(col.tableOID || 0, offset);
    offset += 4; // Table OID
    metadataBuffer.writeInt16BE(col.tableAttributeNumber || 0, offset);
    offset += 2; // Column number
    metadataBuffer.writeInt32BE(col.dataTypeOID || DATA_TYPES.TEXT, offset);
    offset += 4; // Data type OID
    metadataBuffer.writeInt16BE(col.dataTypeSize || -1, offset);
    offset += 2; // Data type size
    metadataBuffer.writeInt32BE(col.typeModifier || -1, offset);
    offset += 4; // Type modifier
    metadataBuffer.writeInt16BE(col.format || 0, offset); // Format (0=text, 1=binary)

    columnBuffers.push(Buffer.concat([nameBuffer, metadataBuffer]));
  }

  payload = Buffer.concat([payload, ...columnBuffers]);
  const message = createMessage(MESSAGE_TYPES.ROW_DESCRIPTION, payload);
  socket.write(message);

  console.log(`Sent RowDescription for ${columns.length} columns`);
}

/**
 * Sends DataRow message with field values
 * @param {Socket} socket - Client socket
 * @param {Array} values - Array of field values
 * @param {Array} columnTypes - Array of column type information (optional)
 */
function sendDataRow(socket, values, columnTypes = []) {
  let payload = Buffer.alloc(2);
  payload.writeInt16BE(values.length, 0); // Number of fields

  const valueBuffers = [];
  const { isArrayType, encodeArrayToText } = require('./utils');

  for (let i = 0; i < values.length; i++) {
    const value = values[i];
    const columnType = columnTypes[i];

    if (value === null || value === undefined) {
      // NULL value - send -1 as length
      const nullBuffer = Buffer.alloc(4);
      nullBuffer.writeInt32BE(-1, 0);
      valueBuffers.push(nullBuffer);
    } else {
      // Check if this is an array type
      let valueStr;
      if (Array.isArray(value)) {
        // Handle JavaScript array - encode as PostgreSQL array
        const elementType = getElementTypeFromColumn(columnType);
        valueStr = encodeArrayToText(value, elementType);
      } else if (columnType && isArrayType(columnType.dataTypeOID)) {
        // Handle string representation of array that needs to be validated
        valueStr = String(value);
      } else {
        // Regular value - convert to string
        valueStr = String(value);
      }

      const valueBuffer = Buffer.from(valueStr, 'utf8');
      const lengthBuffer = Buffer.alloc(4);
      lengthBuffer.writeInt32BE(valueBuffer.length, 0);
      valueBuffers.push(Buffer.concat([lengthBuffer, valueBuffer]));
    }
  }

  payload = Buffer.concat([payload, ...valueBuffers]);
  const message = createMessage(MESSAGE_TYPES.DATA_ROW, payload);
  socket.write(message);

  console.log(`Sent DataRow with ${values.length} values`);
}

/**
 * Helper function to get element type from column information
 * @param {Object} columnType - Column type information
 * @returns {string} Element type name
 */
function getElementTypeFromColumn(columnType) {
  if (!columnType || !columnType.dataTypeOID) {
    return 'text';
  }

  const { getBaseTypeOID } = require('./utils');
  const { DATA_TYPES: TYPES } = require('./constants');

  // Get base type OID if this is an array type
  const baseTypeOID = getBaseTypeOID(columnType.dataTypeOID) || columnType.dataTypeOID;

  // Map base type OID to type name
  const typeMapping = {
    [TYPES.BOOL]: 'bool',
    [TYPES.INT2]: 'int2',
    [TYPES.INT4]: 'int4',
    [TYPES.INT8]: 'int8',
    [TYPES.FLOAT4]: 'float4',
    [TYPES.FLOAT8]: 'float8',
    [TYPES.NUMERIC]: 'numeric',
    [TYPES.TEXT]: 'text',
    [TYPES.VARCHAR]: 'varchar',
    [TYPES.BPCHAR]: 'bpchar',
    [TYPES.DATE]: 'date',
    [TYPES.TIME]: 'time',
    [TYPES.TIMESTAMP]: 'timestamp',
    [TYPES.TIMESTAMPTZ]: 'timestamptz',
    [TYPES.INTERVAL]: 'interval',
    [TYPES.UUID]: 'uuid',
    [TYPES.JSON]: 'json',
    [TYPES.JSONB]: 'jsonb',
  };

  return typeMapping[baseTypeOID] || 'text';
}

/**
 * Sends CommandComplete message indicating query completion
 * @param {Socket} socket - Client socket
 * @param {string} tag - Command completion tag
 */
function sendCommandComplete(socket, tag) {
  const message = createMessage(MESSAGE_TYPES.COMMAND_COMPLETE, createPayload(tag));
  socket.write(message);
  console.log(`Sent CommandComplete: ${tag}`);
}

/**
 * Sends EmptyQueryResponse for empty query strings
 * @param {Socket} socket - Client socket
 */
function sendEmptyQueryResponse(socket) {
  const message = createMessage(MESSAGE_TYPES.EMPTY_QUERY_RESPONSE);
  socket.write(message);
  console.log('Sent EmptyQueryResponse');
}

/**
 * Error and Notice Messages
 */

/**
 * Sends ErrorResponse message with structured error information
 * @param {Socket} socket - Client socket
 * @param {string} code - SQLSTATE error code
 * @param {string} message - Error message
 * @param {Object} additionalFields - Additional error fields (optional)
 * @param {Object} options - Additional options for error handling
 * @param {string} options.severity - Error severity (default: ERROR)
 * @param {string} options.detail - Detailed error explanation
 * @param {string} options.hint - Suggestion for fixing the error
 * @param {string} options.position - Position in query string where error occurred
 * @param {string} options.internalPosition - Position in internal query
 * @param {string} options.internalQuery - Text of internal query
 * @param {string} options.context - Context in which error occurred
 * @param {string} options.schema - Schema name
 * @param {string} options.table - Table name
 * @param {string} options.column - Column name
 * @param {string} options.dataType - Data type name
 * @param {string} options.constraint - Constraint name
 * @param {string} options.file - Source file where error was raised
 * @param {string} options.line - Line number in source file
 * @param {string} options.routine - Routine that raised error
 */
function sendErrorResponse(socket, code, message, additionalFields = {}, options = {}) {
  // Start with the required error fields
  const errorFields = {
    S: options.severity || ERROR_SEVERITY.ERROR,
    C: code,
    M: message,
    ...additionalFields,
  };

  // Add optional detailed fields if provided
  const detailedFields = [
    { key: 'D', value: options.detail }, // Detail
    { key: 'H', value: options.hint }, // Hint
    { key: 'P', value: options.position }, // Position
    { key: 'p', value: options.internalPosition }, // Internal position
    { key: 'q', value: options.internalQuery }, // Internal query
    { key: 'W', value: options.context }, // Where (context)
    { key: 's', value: options.schema }, // Schema name
    { key: 't', value: options.table }, // Table name
    { key: 'c', value: options.column }, // Column name
    { key: 'd', value: options.dataType }, // Data type
    { key: 'n', value: options.constraint }, // Constraint
    { key: 'F', value: options.file }, // File
    { key: 'L', value: options.line }, // Line
    { key: 'R', value: options.routine }, // Routine
  ];

  // Add fields that have values
  detailedFields.forEach(field => {
    if (field.value) {
      errorFields[field.key] = field.value;
    }
  });

  const errorFieldsBuffer = createErrorFields(errorFields);
  const errorMessage = createMessage(MESSAGE_TYPES.ERROR_RESPONSE, errorFieldsBuffer);
  socket.write(errorMessage);

  console.log(`Sent ErrorResponse: ${code} - ${message}`);

  // Log additional details for debugging if present
  if (options.detail || options.hint) {
    console.log(`Error detail: ${options.detail || 'N/A'}, hint: ${options.hint || 'N/A'}`);
  }
}

/**
 * Sends NoticeResponse message with structured notice information
 * @param {Socket} socket - Client socket
 * @param {string} message - Notice message
 * @param {Object} additionalFields - Additional notice fields (optional)
 */
function sendNoticeResponse(socket, message, additionalFields = {}) {
  const noticeFields = {
    S: ERROR_SEVERITY.NOTICE,
    M: message,
    ...additionalFields,
  };

  const noticeFieldsBuffer = createErrorFields(noticeFields);
  const noticeMessage = createMessage(MESSAGE_TYPES.NOTICE_RESPONSE, noticeFieldsBuffer);
  socket.write(noticeMessage);

  console.log(`Sent NoticeResponse: ${message}`);
}

/**
 * Extended Query Protocol Messages
 */

/**
 * Sends ParseComplete message after successful parse
 * @param {Socket} socket - Client socket
 */
function sendParseComplete(socket) {
  const message = createMessage(MESSAGE_TYPES.PARSE_COMPLETE);
  socket.write(message);
  console.log('Sent ParseComplete');
}

/**
 * Sends BindComplete message after successful bind
 * @param {Socket} socket - Client socket
 */
function sendBindComplete(socket) {
  const message = createMessage(MESSAGE_TYPES.BIND_COMPLETE);
  socket.write(message);
  console.log('Sent BindComplete');
}

/**
 * Sends ParameterDescription message describing statement parameters
 * @param {Socket} socket - Client socket
 * @param {Array} paramTypes - Array of parameter type OIDs
 */
function sendParameterDescription(socket, paramTypes = []) {
  let payload = Buffer.alloc(2);
  payload.writeInt16BE(paramTypes.length, 0); // Number of parameters

  for (const paramType of paramTypes) {
    const typeBuffer = Buffer.alloc(4);
    typeBuffer.writeInt32BE(paramType, 0);
    payload = Buffer.concat([payload, typeBuffer]);
  }

  const message = createMessage(MESSAGE_TYPES.PARAMETER_DESCRIPTION, payload);
  socket.write(message);
  console.log(`Sent ParameterDescription for ${paramTypes.length} parameters`);
}

/**
 * Sends NoData message when no row description is available
 * @param {Socket} socket - Client socket
 */
function sendNoData(socket) {
  const message = createMessage(MESSAGE_TYPES.NO_DATA);
  socket.write(message);
  console.log('Sent NoData');
}

/**
 * Sends PortalSuspended message when portal execution is suspended
 * @param {Socket} socket - Client socket
 */
function sendPortalSuspended(socket) {
  const message = createMessage(MESSAGE_TYPES.PORTAL_SUSPENDED);
  socket.write(message);
  console.log('Sent PortalSuspended');
}

/**
 * COPY Protocol Messages
 */

/**
 * Sends CopyInResponse message to start COPY FROM STDIN
 * @param {Socket} socket - Client socket
 * @param {number} format - Overall format (0=text, 1=binary)
 * @param {Array} columnFormats - Array of column formats
 */
function sendCopyInResponse(socket, format = 0, columnFormats = []) {
  let payload = Buffer.alloc(3);
  payload.writeInt8(format, 0); // Overall format
  payload.writeInt16BE(columnFormats.length, 1); // Number of columns

  for (const colFormat of columnFormats) {
    const formatBuffer = Buffer.alloc(2);
    formatBuffer.writeInt16BE(colFormat, 0);
    payload = Buffer.concat([payload, formatBuffer]);
  }

  const message = createMessage(MESSAGE_TYPES.COPY_IN_RESPONSE, payload);
  socket.write(message);
  console.log(`Sent CopyInResponse (format: ${format}, ${columnFormats.length} columns)`);
}

/**
 * Sends CopyOutResponse message to start COPY TO STDOUT
 * @param {Socket} socket - Client socket
 * @param {number} format - Overall format (0=text, 1=binary)
 * @param {Array} columnFormats - Array of column formats
 */
function sendCopyOutResponse(socket, format = 0, columnFormats = []) {
  let payload = Buffer.alloc(3);
  payload.writeInt8(format, 0); // Overall format
  payload.writeInt16BE(columnFormats.length, 1); // Number of columns

  for (const colFormat of columnFormats) {
    const formatBuffer = Buffer.alloc(2);
    formatBuffer.writeInt16BE(colFormat, 0);
    payload = Buffer.concat([payload, formatBuffer]);
  }

  const message = createMessage(MESSAGE_TYPES.COPY_OUT_RESPONSE, payload);
  socket.write(message);
  console.log(`Sent CopyOutResponse (format: ${format}, ${columnFormats.length} columns)`);
}

/**
 * Sends CopyData message with copy data
 * @param {Socket} socket - Client socket
 * @param {Buffer} data - Copy data
 */
function sendCopyData(socket, data) {
  const message = createMessage(MESSAGE_TYPES.COPY_DATA, data);
  socket.write(message);
  console.log(`Sent CopyData (${data.length} bytes)`);
}

/**
 * Authentication Messages (Extended)
 */

/**
 * Sends AuthenticationMD5Password request
 * @param {Socket} socket - Client socket
 * @param {Buffer} salt - 4-byte random salt
 */
function sendAuthenticationMD5Password(socket, salt) {
  const payload = Buffer.alloc(8);
  payload.writeInt32BE(5, 0); // MD5 authentication method
  salt.copy(payload, 4); // 4-byte salt

  const message = createMessage(MESSAGE_TYPES.AUTHENTICATION, payload);
  socket.write(message);
  console.log('Sent AuthenticationMD5Password');
}

/**
 * Sends AuthenticationCleartextPassword request
 * @param {Socket} socket - Client socket
 */
function sendAuthenticationCleartextPassword(socket) {
  const payload = createPayload(3); // Cleartext password method
  const message = createMessage(MESSAGE_TYPES.AUTHENTICATION, payload);
  socket.write(message);
  console.log('Sent AuthenticationCleartextPassword');
}

/**
 * Notification Messages
 */

/**
 * Sends NotificationResponse for NOTIFY messages
 * @param {Socket} socket - Client socket
 * @param {number} pid - Process ID of notifying backend
 * @param {string} channel - Notification channel name
 * @param {string} payload - Notification payload
 */
function sendNotificationResponse(socket, pid, channel, payload = '') {
  const pidBuffer = Buffer.alloc(4);
  pidBuffer.writeInt32BE(pid, 0);

  const messagePayload = Buffer.concat([pidBuffer, writeCString(channel), writeCString(payload)]);

  const message = createMessage(MESSAGE_TYPES.NOTIFICATION_RESPONSE, messagePayload);
  socket.write(message);
  console.log(`Sent NotificationResponse: ${channel} (PID: ${pid})`);
}

module.exports = {
  // Authentication and Connection
  sendAuthenticationOK,
  sendParameterStatus,
  sendBackendKeyData,
  sendReadyForQuery,

  // Query Results
  sendRowDescription,
  sendDataRow,
  sendCommandComplete,
  sendEmptyQueryResponse,

  // Errors and Notices
  sendErrorResponse,
  sendNoticeResponse,

  // Extended Query Protocol
  sendParseComplete,
  sendBindComplete,
  sendParameterDescription,
  sendNoData,
  sendPortalSuspended,

  // COPY Protocol
  sendCopyInResponse,
  sendCopyOutResponse,
  sendCopyData,

  // Authentication (Extended)
  sendAuthenticationMD5Password,
  sendAuthenticationCleartextPassword,

  // Notifications
  sendNotificationResponse,
};
