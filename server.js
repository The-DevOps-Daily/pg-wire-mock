// Include Nodejs' net module.
const Net = require("net");
const crypto = require("crypto");

// The port on which the server is listening.
const port = 5432;

// Protocol version constants
const PROTOCOL_VERSION_3_0 = 196608; // 3.0 in protocol format
const SSL_REQUEST_CODE = 80877103;
const CANCEL_REQUEST_CODE = 80877102;

// Create a new TCP server.
const server = new Net.Server();

// Connection state tracking
class ConnectionState {
  constructor() {
    this.authenticated = false;
    this.protocolVersion = null;
    this.parameters = new Map();
    this.transactionStatus = 'I'; // I = idle, T = transaction, E = error
    this.backendPid = process.pid;
    this.backendSecret = crypto.randomInt(0, 2147483647);
  }
}

// The server listens to a socket for a client to make a connection request.
server.listen(port, function () {
  console.log(
    `PostgreSQL Wire Protocol Mock Server listening on localhost:${port}`
  );
});

// When a client requests a connection with the server, the server creates a new socket dedicated to that client.
server.on("connection", function (socket) {
  console.log("New connection established from:", socket.remoteAddress);
  
  const connState = new ConnectionState();
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
  });

  socket.on("error", function (err) {
    console.log(`Socket Error: ${err}`);
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
    connState.protocolVersion = protocolVersion;
    
    // Parse parameters from startup packet
    let offset = 8;
    while (offset < length - 1) {
      const keyStart = offset;
      while (offset < length && buffer[offset] !== 0) offset++;
      const key = buffer.slice(keyStart, offset).toString('utf8');
      offset++; // Skip null terminator
      
      const valueStart = offset;
      while (offset < length && buffer[offset] !== 0) offset++;
      const value = buffer.slice(valueStart, offset).toString('utf8');
      offset++; // Skip null terminator
      
      if (key && value) {
        connState.parameters.set(key, value);
        console.log(`Startup parameter: ${key} = ${value}`);
      }
    }

    // Send authentication sequence
    sendAuthenticationOK(socket);
    sendParameterStatus(socket, connState);
    sendBackendKeyData(socket, connState);
    sendReadyForQuery(socket, connState);
    
    connState.authenticated = true;
    return length;
  }

  throw new Error(`Unsupported protocol version: ${protocolVersion}`);
}

function processRegularMessage(buffer, socket, connState) {
  if (buffer.length < 5) return 0; // Need at least tag + length

  const messageType = String.fromCharCode(buffer[0]);
  const length = buffer.readInt32BE(1);
  
  if (buffer.length < length + 1) return 0; // Need complete message

  console.log(`Received message type '${messageType}', length: ${length}`);

  switch (messageType) {
    case 'Q': // Simple Query
      return processSimpleQuery(buffer, socket, connState);
    case 'X': // Terminate
      console.log("Client requested termination");
      socket.end();
      return length + 1;
    case 'P': // Parse (Extended Query)
      return processParse(buffer, socket, connState);
    case 'B': // Bind (Extended Query)  
      return processBind(buffer, socket, connState);
    case 'D': // Describe
      return processDescribe(buffer, socket, connState);
    case 'E': // Execute
      return processExecute(buffer, socket, connState);
    case 'S': // Sync
      return processSync(buffer, socket, connState);
    default:
      console.log(`Unknown message type: ${messageType}`);
      sendErrorResponse(socket, "08P01", `Unknown message type: ${messageType}`);
      return length + 1;
  }
}

function processSimpleQuery(buffer, socket, connState) {
  const length = buffer.readInt32BE(1);
  
  // Extract query string (remove message type, length, and null terminator)
  const queryBuffer = buffer.slice(5, length);
  const query = queryBuffer.toString('utf8').replace(/\0$/, '').trim().toUpperCase();
  
  console.log(`Executing simple query: ${query}`);

  // Handle multiple queries separated by semicolons
  const queries = query.split(';').map(q => q.trim()).filter(q => q.length > 0);
  
  for (const singleQuery of queries) {
    if (singleQuery === '') {
      // Empty query
      sendEmptyQueryResponse(socket);
    } else {
      executeQuery(singleQuery, socket, connState);
    }
  }

  sendReadyForQuery(socket, connState);
  return length + 1;
}

function executeQuery(query, socket, connState) {
  // Simple query execution logic
  const results = handleQuery(query);
  
  if (results.error) {
    sendErrorResponse(socket, results.error.code, results.error.message);
    connState.transactionStatus = 'E';
    return;
  }

  // Send RowDescription
  if (results.columns) {
    sendRowDescription(socket, results.columns);
    
    // Send DataRows
    for (const row of results.rows) {
      sendDataRow(socket, row);
    }
  }

  // Send CommandComplete
  sendCommandComplete(socket, results.command || "SELECT 1");
}

function handleQuery(query) {
  console.log(`Processing query: ${query}`);
  
  // Basic query handling
  switch (query) {
    case "SELECT 1":
    case "SELECT 1;":
      return {
        columns: [{ name: "?column?", dataTypeOID: 23, dataTypeSize: 4 }],
        rows: [["1"]],
        command: "SELECT 1"
      };
    
    case "SHOW DOCS":
    case "SHOW DOCS;":
      return {
        columns: [{ name: "docs", dataTypeOID: 25, dataTypeSize: -1 }],
        rows: [["https://www.postgresql.org/docs/"]],
        command: "SHOW 1"
      };

    case "SELECT VERSION()":
    case "SELECT VERSION();":
      return {
        columns: [{ name: "version", dataTypeOID: 25, dataTypeSize: -1 }],
        rows: [["PostgreSQL Wire Protocol Mock Server 1.0"]],
        command: "SELECT 1"
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
        columns: [{ name: "message", dataTypeOID: 25, dataTypeSize: -1 }],
        rows: [["Hello from PostgreSQL Wire Protocol Mock Server!"]],
        command: "SELECT 1"
      };
  }
}

// Protocol message senders
function sendAuthenticationOK(socket) {
  const buf = Buffer.alloc(9);
  buf[0] = 'R'.charCodeAt(0); // Message type
  buf.writeInt32BE(8, 1);      // Message length
  buf.writeInt32BE(0, 5);      // Auth method: 0 = success
  socket.write(buf);
  console.log("Sent AuthenticationOK");
}

function sendParameterStatus(socket, connState) {
  const parameters = [
    ['server_version', '13.0 (Mock)'],
    ['server_encoding', 'UTF8'],
    ['client_encoding', 'UTF8'],
    ['application_name', connState.parameters.get('application_name') || ''],
    ['is_superuser', 'off'],
    ['session_authorization', connState.parameters.get('user') || 'postgres'],
    ['DateStyle', 'ISO, MDY'],
    ['IntervalStyle', 'postgres'],
    ['TimeZone', 'UTC'],
    ['integer_datetimes', 'on'],
    ['standard_conforming_strings', 'on']
  ];

  for (const [name, value] of parameters) {
    const nameBuffer = Buffer.from(name + '\0', 'utf8');
    const valueBuffer = Buffer.from(value + '\0', 'utf8');
    const totalLength = 4 + nameBuffer.length + valueBuffer.length;
    
    const buf = Buffer.alloc(1 + 4 + nameBuffer.length + valueBuffer.length);
    buf[0] = 'S'.charCodeAt(0);
    buf.writeInt32BE(totalLength, 1);
    nameBuffer.copy(buf, 5);
    valueBuffer.copy(buf, 5 + nameBuffer.length);
    
    socket.write(buf);
  }
  console.log("Sent ParameterStatus messages");
}

function sendBackendKeyData(socket, connState) {
  const buf = Buffer.alloc(13);
  buf[0] = 'K'.charCodeAt(0);  // Message type
  buf.writeInt32BE(12, 1);     // Message length
  buf.writeInt32BE(connState.backendPid, 5);     // Process ID
  buf.writeInt32BE(connState.backendSecret, 9);  // Secret key
  socket.write(buf);
  console.log(`Sent BackendKeyData (PID: ${connState.backendPid}, Secret: ${connState.backendSecret})`);
}

function sendReadyForQuery(socket, connState) {
  const buf = Buffer.alloc(6);
  buf[0] = 'Z'.charCodeAt(0);  // Message type
  buf.writeInt32BE(5, 1);      // Message length
  buf[5] = connState.transactionStatus.charCodeAt(0); // Transaction status
  socket.write(buf);
  console.log(`Sent ReadyForQuery (status: ${connState.transactionStatus})`);
}

function sendRowDescription(socket, columns) {
  let totalLength = 4 + 2; // length + field count
  const columnBuffers = [];
  
  for (const col of columns) {
    const nameBuffer = Buffer.from((col.name || 'column') + '\0', 'utf8');
    const fieldBuffer = Buffer.alloc(nameBuffer.length + 18); // name + 18 bytes of metadata
    nameBuffer.copy(fieldBuffer, 0);
    
    let offset = nameBuffer.length;
    fieldBuffer.writeInt32BE(col.tableOID || 0, offset); offset += 4;        // table OID
    fieldBuffer.writeInt16BE(col.tableAttributeNumber || 0, offset); offset += 2; // column number
    fieldBuffer.writeInt32BE(col.dataTypeOID || 25, offset); offset += 4;    // data type OID
    fieldBuffer.writeInt16BE(col.dataTypeSize || -1, offset); offset += 2;   // data type size
    fieldBuffer.writeInt32BE(col.typeModifier || -1, offset); offset += 4;   // type modifier
    fieldBuffer.writeInt16BE(col.format || 0, offset);       // format (0=text, 1=binary)
    
    columnBuffers.push(fieldBuffer);
    totalLength += fieldBuffer.length;
  }

  const buf = Buffer.alloc(1 + 4 + 2);
  buf[0] = 'T'.charCodeAt(0);        // Message type
  buf.writeInt32BE(totalLength, 1);  // Message length
  buf.writeInt16BE(columns.length, 5); // Number of fields

  socket.write(buf);
  for (const colBuf of columnBuffers) {
    socket.write(colBuf);
  }
  console.log(`Sent RowDescription for ${columns.length} columns`);
}

function sendDataRow(socket, values) {
  let totalLength = 4 + 2; // length + field count
  const valueBuffers = [];

  for (const value of values) {
    if (value === null) {
      valueBuffers.push(null);
      totalLength += 4; // -1 length indicator for null
    } else {
      const valueBuffer = Buffer.from(String(value), 'utf8');
      valueBuffers.push(valueBuffer);
      totalLength += 4 + valueBuffer.length; // length + data
    }
  }

  const headerBuf = Buffer.alloc(1 + 4 + 2);
  headerBuf[0] = 'D'.charCodeAt(0);     // Message type
  headerBuf.writeInt32BE(totalLength, 1); // Message length
  headerBuf.writeInt16BE(values.length, 5); // Number of fields
  socket.write(headerBuf);

  for (const valueBuf of valueBuffers) {
    if (valueBuf === null) {
      const nullBuf = Buffer.alloc(4);
      nullBuf.writeInt32BE(-1, 0); // -1 indicates NULL
      socket.write(nullBuf);
    } else {
      const lengthBuf = Buffer.alloc(4);
      lengthBuf.writeInt32BE(valueBuf.length, 0);
      socket.write(lengthBuf);
      socket.write(valueBuf);
    }
  }
  console.log(`Sent DataRow with ${values.length} values`);
}

function sendCommandComplete(socket, tag) {
  const tagBuffer = Buffer.from(tag + '\0', 'utf8');
  const totalLength = 4 + tagBuffer.length;
  
  const buf = Buffer.alloc(1 + 4);
  buf[0] = 'C'.charCodeAt(0);         // Message type
  buf.writeInt32BE(totalLength, 1);   // Message length
  socket.write(buf);
  socket.write(tagBuffer);
  console.log(`Sent CommandComplete: ${tag}`);
}

function sendEmptyQueryResponse(socket) {
  const buf = Buffer.alloc(5);
  buf[0] = 'I'.charCodeAt(0);  // Message type
  buf.writeInt32BE(4, 1);      // Message length
  socket.write(buf);
  console.log("Sent EmptyQueryResponse");
}

function sendErrorResponse(socket, code, message) {
  const fields = [
    ['S', 'ERROR'],
    ['C', code],
    ['M', message]
  ];

  let totalLength = 4 + 1; // length + final null terminator
  const fieldBuffers = [];

  for (const [fieldType, fieldValue] of fields) {
    const fieldBuffer = Buffer.from(fieldType + fieldValue + '\0', 'utf8');
    fieldBuffers.push(fieldBuffer);
    totalLength += fieldBuffer.length;
  }

  const headerBuf = Buffer.alloc(1 + 4);
  headerBuf[0] = 'E'.charCodeAt(0);     // Message type
  headerBuf.writeInt32BE(totalLength, 1); // Message length
  socket.write(headerBuf);

  for (const fieldBuf of fieldBuffers) {
    socket.write(fieldBuf);
  }

  const finalNull = Buffer.alloc(1);
  socket.write(finalNull);
  
  console.log(`Sent ErrorResponse: ${code} - ${message}`);
}

// Extended Query Protocol handlers (basic implementations)
function processParse(buffer, socket, connState) {
  const length = buffer.readInt32BE(1);
  // Basic Parse acknowledgment
  sendParseComplete(socket);
  return length + 1;
}

function processBind(buffer, socket, connState) {
  const length = buffer.readInt32BE(1);
  // Basic Bind acknowledgment
  sendBindComplete(socket);
  return length + 1;
}

function processDescribe(buffer, socket, connState) {
  const length = buffer.readInt32BE(1);
  // For simplicity, send a basic row description
  sendRowDescription(socket, [{ name: "result", dataTypeOID: 25, dataTypeSize: -1 }]);
  return length + 1;
}

function processExecute(buffer, socket, connState) {
  const length = buffer.readInt32BE(1);
  // Basic execution - send some data
  sendDataRow(socket, ["Extended query result"]);
  sendCommandComplete(socket, "SELECT 1");
  return length + 1;
}

function processSync(buffer, socket, connState) {
  const length = buffer.readInt32BE(1);
  sendReadyForQuery(socket, connState);
  return length + 1;
}

function sendParseComplete(socket) {
  const buf = Buffer.alloc(5);
  buf[0] = '1'.charCodeAt(0);  // Message type
  buf.writeInt32BE(4, 1);      // Message length
  socket.write(buf);
  console.log("Sent ParseComplete");
}

function sendBindComplete(socket) {
  const buf = Buffer.alloc(5);
  buf[0] = '2'.charCodeAt(0);  // Message type
  buf.writeInt32BE(4, 1);      // Message length
  socket.write(buf);
  console.log("Sent BindComplete");
}
