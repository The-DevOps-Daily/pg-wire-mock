// Include Nodejs' net module.
const Net = require("net");
const { type } = require("os");

// The port on which the server is listening.
const port = 5432;

// Create a new TCP server.
const server = new Net.Server();

// The server listens to a socket for a client to make a connection request.
server.listen(port, function () {
  console.log(
    `Server listening for connection requests on socket localhost:${port}`
  );
});

// When a client requests a connection with the server, the server creates a new socket dedicated to that client.
server.on("connection", function (socket) {
  console.log("A new connection has been established.");
  // Send an authentication OK message to the client
  buf = authOk();
  socket.write(buf);

  // Basic query flow
  socket.on("data", function (chunk) {
    // If starts with 'Q', it's a query:
    if (chunk[0] === "Q".charCodeAt(0)) {
      // Values for the RowDescription message:
      const fields = [
        {
          name: "Output",
          tableOID: 0,
          tableAttributeNumber: 0,
          dataTypeOID: 25,
          dataTypeSize: -1,
          typeModifier: -1,
          format: 0,
        },
      ];

      // Prepare the RowDescription message:
      let buf = RowDescription(fields);

      // Parse the query to string:
      let query = QueryParser(chunk);

      // Case statement to check the query and return the correct response:
      let values = HandleQuery(query)

      // Prepare the DataRow message concatenated with the RowDescription message:
      buf = Buffer.concat([buf, DataRow(values)]);

      // Prepare the CommandComplete message:
      buf = Buffer.concat([buf, CommandComplete(buf)]);

      // readyForQuery concatenated with the message:
      buf = Buffer.concat([buf, readyForQuery(buf)]);

      socket.write(buf);
    } else {
      // Ready for Query:
      buf = readyForQuery(buf);
    }
  });

  socket.on("end", function () {
    console.log("Closing connection with the client");
  });

  socket.on("error", function (err) {
    console.log(`Error: ${err}`);
  });
});

function authOk() {
  let buf = Buffer.from("R");
  buf = Buffer.concat([buf, Buffer.from([0, 0, 0, 8])]);
  buf = Buffer.concat([buf, Buffer.from([0, 0, 0, 0])]);
  buf = readyForQuery(buf);
  return buf;
}

// - Ready for Query: 'Z', 0, 0, 0, 5, 'I'
function readyForQuery(ready) {
  ready = Buffer.concat([ready, Buffer.from("Z")]);
  ready = Buffer.concat([ready, Buffer.from([0, 0, 0, 5])]);
  ready = Buffer.concat([ready, Buffer.from("I")]);
  return ready;
}

// - CommandComplete: 'C' | int32 len | str tag
function CommandComplete(buf) {
  buf = Buffer.concat([buf, Buffer.from("C")]);
  buf = Buffer.concat([buf, Buffer.from([0, 0, 0, 13])]);
  buf = Buffer.concat([buf, Buffer.from("SELECT 1")]);
  buf = Buffer.concat([buf, Buffer.from([0])]);
  return buf;
}

// - DataRow: 'D' | int32 len | int16 numfields | int32 fieldlen | char[fieldlen] data ...
function DataRow(values) {
  let DataRowType = Buffer.from("D");
  let buf = Buffer.from([0, values.length]);

  for (let i = 0; i < values.length; i++) {
    let response = Buffer.from(values[i]);
    buf = Buffer.concat([buf, Buffer.from([0, 0, 0, response.length])]);
    buf = Buffer.concat([buf, response]);
  }

  len = buf.length + DataRowType.length + 3;
  final = Buffer.concat([DataRowType, Buffer.from([0, 0, 0, len])]);
  final = Buffer.concat([final, buf]);

  return final;
}

// - RowDescription: 'T' | int32 len | int16 numfields | str col | int32 tableoid | int16 colno | int32 typeoid | int16 typelen | int32 typmod | int16 format
function RowDescription(fields) {
  rowDescriptionType = Buffer.from("T");
  emptyLenght = Buffer.from([-1, -1, -1, -1]); // -1 means that the length of the message is not known yet.

  buf = Buffer.from([0, fields.length]);
  for (let i = 0; i < fields.length; i++) {
    buf = Buffer.concat([buf, Buffer.from(fields[i].name)]);
    buf = Buffer.concat([buf, Buffer.from([0])]);
    buf = Buffer.concat([buf, Buffer.from([0, 0, 0, fields[i].tableOID])]);
    buf = Buffer.concat([
      buf,
      Buffer.from([0, fields[i].tableAttributeNumber]),
    ]);
    buf = Buffer.concat([buf, Buffer.from([0, 0, 0, fields[i].dataTypeOID])]);
    buf = Buffer.concat([
      buf,
      Buffer.from([fields[i].dataTypeSize, fields[i].dataTypeSize]),
    ]);
    buf = Buffer.concat([
      buf,
      Buffer.from([-1, -1, -1, fields[i].typeModifier]),
    ]);
    buf = Buffer.concat([buf, Buffer.from([0, fields[i].format])]);
  }
  final = Buffer.concat([
    rowDescriptionType,
    Buffer.from([0, 0, 0, buf.length + rowDescriptionType.length + 3]),
  ]);
  final = Buffer.concat([final, buf]);

  return final;
}

function QueryParser(query) {
  // Remove the bynary prefix 'Q' and the lenght from the query:
  query = query.toString("utf8").substring(5);
  // Remove the last byte from the query:
  query = query.substring(0, query.length - 1);
  return query.trim().toUpperCase();
}

function HandleQuery(query) {
  switch (query) {
    case "SELECT 1;":
      values = ["1"];
      return values;
    case "SHOW DOCS;":
      values = ["https://www.postgresql.org/docs/"];
      return values;
    default:
      values = ["Hello, world!"];
      return values;
  }
}
