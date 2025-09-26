// Include Nodejs' net module.
const Net = require("net");
const crypto = require("crypto");

// Import protocol constants and utilities
const {
  PROTOCOL_VERSION_3_0,
  SSL_REQUEST_CODE,
  CANCEL_REQUEST_CODE,
  MESSAGE_TYPES,
  TRANSACTION_STATUS,
  DATA_TYPES,
  DEFAULT_SERVER_PARAMETERS,
  ERROR_CODES
} = require("./src/protocol/constants");

const {
  parseParameters,
  createMessage,
  createPayload,
  validateMessage,
  getMessageType,
  generateBackendSecret,
  formatCommandTag,
  isValidProtocolVersion,
  parseQueryStatements,
  createErrorFields
} = require("./src/protocol/utils");

// Import message builders
const {
  sendAuthenticationOK,
  sendParameterStatus,
  sendBackendKeyData,
  sendReadyForQuery,
  sendRowDescription,
  sendDataRow,
  sendCommandComplete,
  sendEmptyQueryResponse,
  sendErrorResponse,
  sendParseComplete,
  sendBindComplete
} = require("./src/protocol/messageBuilders");

// Import query handlers
const {
  executeQueryString,
  executeQuery
} = require("./src/handlers/queryHandlers");

// Import connection state management
const {
  ConnectionState
} = require("./src/connection/connectionState");

// The port on which the server is listening.
const port = 5432;

// Create a new TCP server.
const server = new Net.Server();


// The server listens to a socket for a client to make a connection request.
server.listen(port, function () {
  console.log(
    `PostgreSQL Wire Protocol Mock Server listening on localhost:${port}`
  );
});

// When a client requests a connection with the server, the server creates a new socket dedicated to that client.
server.on("connection", function (socket) {
  const connState = new ConnectionState();
  console.log(`New connection established from: ${socket.remoteAddress}`);
  
  let buffer = Buffer.alloc(0);

  // Handle incoming data
  socket.on("data", function (chunk) {
    buffer = Buffer.concat([buffer, chunk]);
    
    try {
      while (buffer.length > 0) {
        const processed = processMessage(buffer, socket, connState);
        if (processed === 0) break; // Need more data
        buffer = buffer.slice(processed);
      }
    } catch (error) {
      console.error("Error processing message:", error);
      sendErrorResponse(socket, "08P01", `Protocol error: ${error.message}`);
      socket.end();
    }
  });

  socket.on("end", function () {
    console.log("Client disconnected");
    connState.close();
  });

  socket.on("error", function (err) {
    console.log(`Socket Error: ${err}`);
    connState.close();
  });
});

function processMessage(buffer, socket, connState) {
  if (!connState.authenticated) {
    return processStartupMessage(buffer, socket, connState);
  } else {
    return processRegularMessage(buffer, socket, connState);
  }
}

function processStartupMessage(buffer, socket, connState) {
  if (buffer.length < 8) return 0; // Need at least length + protocol version

  const length = buffer.readInt32BE(0);
  if (buffer.length < length) return 0; // Need complete message

  const protocolVersion = buffer.readInt32BE(4);
  
  console.log(`Startup message - Length: ${length}, Protocol: ${protocolVersion}`);

  // Handle SSL request
  if (protocolVersion === SSL_REQUEST_CODE) {
    console.log("SSL request received - rejecting");
    socket.write(Buffer.from('N')); // Reject SSL
    return length;
  }

  // Handle cancel request  
  if (protocolVersion === CANCEL_REQUEST_CODE) {
    console.log("Cancel request received");
    // In a real implementation, we'd handle cancellation here
    socket.end();
    return length;
  }

  // Handle regular startup packet
  if (protocolVersion === PROTOCOL_VERSION_3_0) {
    // Parse parameters from startup packet using utility function
    const parameters = parseParameters(buffer, 8, length);
    
    // Set connection parameters
    for (const [key, value] of parameters) {
      connState.setParameter(key, value);
    }

    // Authenticate the connection
    connState.authenticate(protocolVersion);

    // Send authentication sequence
    sendAuthenticationOK(socket);
    sendParameterStatus(socket, connState);
    sendBackendKeyData(socket, connState);
    sendReadyForQuery(socket, connState);
    
    return length;
  }

  throw new Error(`Unsupported protocol version: ${protocolVersion}`);
}

function processRegularMessage(buffer, socket, connState) {
  if (buffer.length < 5) return 0; // Need at least tag + length

  const messageType = getMessageType(buffer);
  const length = buffer.readInt32BE(1);
  
  if (buffer.length < length + 1) return 0; // Need complete message

  console.log(`Received message type '${messageType}', length: ${length}`);

  switch (messageType) {
    case MESSAGE_TYPES.QUERY: // Simple Query
      return processSimpleQuery(buffer, socket, connState);
    case MESSAGE_TYPES.TERMINATE: // Terminate
      console.log("Client requested termination");
      socket.end();
      return length + 1;
    case MESSAGE_TYPES.PARSE: // Parse (Extended Query)
      return processParse(buffer, socket, connState);
    case MESSAGE_TYPES.BIND: // Bind (Extended Query)  
      return processBind(buffer, socket, connState);
    case MESSAGE_TYPES.DESCRIBE: // Describe
      return processDescribe(buffer, socket, connState);
    case MESSAGE_TYPES.EXECUTE: // Execute
      return processExecute(buffer, socket, connState);
    case MESSAGE_TYPES.SYNC: // Sync
      return processSync(buffer, socket, connState);
    default:
      console.log(`Unknown message type: ${messageType}`);
      sendErrorResponse(socket, ERROR_CODES.PROTOCOL_VIOLATION, `Unknown message type: ${messageType}`);
      return length + 1;
  }
}

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
function handleQuery(query) {
  console.log(`Processing query: ${query}`);
  
  // Basic query handling
  switch (query) {
    case "SELECT 1":
    case "SELECT 1;":
      return {
        columns: [{ name: "?column?", dataTypeOID: DATA_TYPES.INT4, dataTypeSize: 4 }],
        rows: [["1"]],
        command: "SELECT",
        rowCount: 1
      };
    
    case "SHOW DOCS":
    case "SHOW DOCS;":
      return {
        columns: [{ name: "docs", dataTypeOID: DATA_TYPES.TEXT, dataTypeSize: -1 }],
        rows: [["https://www.postgresql.org/docs/"]],
        command: "SHOW",
        rowCount: 1
      };

    case "SELECT VERSION()":
    case "SELECT VERSION();":
      return {
        columns: [{ name: "version", dataTypeOID: DATA_TYPES.TEXT, dataTypeSize: -1 }],
        rows: [["PostgreSQL Wire Protocol Mock Server 1.0"]],
        command: "SELECT",
        rowCount: 1
      };

    case "BEGIN":
    case "BEGIN;":
      return { command: "BEGIN" };

    case "COMMIT":
    case "COMMIT;":
      return { command: "COMMIT" };

    case "ROLLBACK":
    case "ROLLBACK;":
      return { command: "ROLLBACK" };

    default:
      // Default response for unknown queries
      return {
        columns: [{ name: "message", dataTypeOID: DATA_TYPES.TEXT, dataTypeSize: -1 }],
        rows: [["Hello from PostgreSQL Wire Protocol Mock Server!"]],
        command: "SELECT",
        rowCount: 1
      };
  }
}

function processDescribe(buffer, socket, connState) {
  const length = buffer.readInt32BE(1);
  // For simplicity, send a basic row description
  sendRowDescription(socket, [{ name: "result", dataTypeOID: DATA_TYPES.TEXT, dataTypeSize: -1 }]);
  return length + 1;
}

function processExecute(buffer, socket, connState) {
  const length = buffer.readInt32BE(1);
  // Basic execution - send some data using query handler
  connState.incrementQueryCount();
  executeQuery("SELECT 'Extended query result'", socket, connState);
  return length + 1;
}

function processSync(buffer, socket, connState) {
  const length = buffer.readInt32BE(1);
  sendReadyForQuery(socket, connState);
  return length + 1;
}
