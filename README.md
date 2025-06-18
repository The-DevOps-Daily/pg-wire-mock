# pg-wire-mock

A mock PostgreSQL server that speaks just enough of the wire protocol to connect with `psql`. Built for learning and experimenting with the PostgreSQL wire protocol.

## Quick Introduction to the PostgreSQL Wire Protocol

PostgreSQL uses a custom message-based protocol for communication between clients and the server. This protocol is supported over TCP/IP and also over Unix-domain sockets. The current version of the protocol is 3.0.

This project implements a minimal subset of the protocol, allowing you to experiment with it and learn how it works by building a mock server that can communicate with standard PostgreSQL clients like `psql`.

## Introduction

PostgreSQL is a powerful, open-source relational database management system (RDBMS) that is widely used for handling large amounts of data efficiently. The PostgreSQL wire protocol is the communication language between PostgreSQL clients and servers.

In this repository, we'll explore the wire protocol in detail by building a mock implementation. We'll be using the `psql` command-line utility to interact with our mock server, observing how queries are transmitted over the network and how results are returned.

## Frontend/Backend Protocol

The protocol that clients and servers use to communicate is called the "Frontend/Backend Protocol."

A typical message in the PostgreSQL message-based protocol follows this structure:

```
char tag | int32 len | payload
```

- The first byte is the message type (a single character)
- Followed by a 4-byte message length
- Followed by the payload data

### Common Message Types

Here are some of the most common message types:

- 'R': Authentication
- 'Q': Query
- 'X': Terminate
- 'Z': Ready for Query
- 'P': Parse
- 'B': Bind
- 'E': Error
- 'C': Command Complete
- 'D': Data Row
- 'T': Row Description
- 'N': Notice Response

For a detailed description of all message types, see the [PostgreSQL wire protocol documentation](https://www.postgresql.org/docs/current/protocol-flow.html).

## Authentication Flow

The authentication flow between the client and server is as follows:

![Postgres protocol - auth flow](https://user-images.githubusercontent.com/21223421/178289606-4a0d4601-b14d-410c-887c-efa235755d55.png)

If authentication is required, the server sends an `AuthenticationRequest`. There are several authentication types that can be requested, including plain-text passwords and MD5-encrypted passwords.

Once authentication is complete (or if no auth is necessary), the server sends an `AuthenticationOK` message.

### Authentication Request Packet

The authentication request packet consists of the following fields:

| | | | |
|-|-|-|-|
| 'R' | int32 len | int32 method | optional other |

Using Wireshark to inspect an `AuthenticationRequest` packet:

![Authentication request inspected with WireShark](https://user-images.githubusercontent.com/21223421/178292228-ff6ab5cd-db4b-42c7-b4cb-055d70e463af.png)

### Implementation in JavaScript

To mimic the authentication flow in Node.js:

```javascript
function authOk() {
  let buf = Buffer.from("R");
  buf = Buffer.concat([buf, Buffer.from([0, 0, 0, 8])]);
  buf = Buffer.concat([buf, Buffer.from([0, 0, 0, 0])]);
  buf = readyForQuery(buf);
  return buf;
}
```

## Simple Query Flow

A standard query cycle starts with the client sending a `Query` message to the server. The query flow is as follows:

1. The client sends an SQL command (starting with 'Q')
2. The server replies with `RowDescription` ('T') detailing the result structure
3. The server sends `DataRow` ('D') messages for each row in the result
4. Finally, the server sends `CommandComplete` ('C') and `ReadyForQuery` ('Z')

Here's a visual representation of the query flow:

![Postgres protocol - simple query flow](https://user-images.githubusercontent.com/21223421/178294158-ac9d8591-7224-4480-8a3d-024e2cd80782.png)

Let's examine each message type in detail:

### Query Message ('Q')

The Query message structure:

```
'Q' | int32 len | char[len] query
```

In Wireshark, a query packet looks like:

![Postgres protocol simple query packet](https://user-images.githubusercontent.com/21223421/178294620-8f46d06f-9791-4e68-b78b-7d6ae26c7394.png)

To parse a Query message in Node.js:

```javascript
function QueryParser(query) {
  // Check if the query packet starts with 'Q'
  if (chunk[0] === "Q".charCodeAt(0)) {
    // Remove the binary prefix 'Q' and the length bytes from the query:
    query = query.toString("utf8").substring(5);
    // Remove the last byte from the query:
    query = query.substring(0, query.length - 1);
    return query.trim().toUpperCase();
  }
}
```

Handling different queries:

```javascript
function HandleQuery(query) {
  switch (query) {
    case "SELECT 1;":
      values = ["1"];
      return values;
    case "SHOW DOCS;":
      values = ["https://postgresql.org/docs"];
      return values;
    default:
      values = ["Hello, world!"];
      return values;
  }
}
```

### RowDescription Message ('T')

The `RowDescription` message describes the structure of the result set:

```
'T' | int32 len | int16 numfields | str col | int32 tableoid | int16 colno | int32 typeoid | int16 typelen | int32 typmod | int16 format
```

For each field, it includes:
- Column name
- Table object ID
- Column number
- Data type object ID
- Data type size
- Type modifier
- Format code (text/binary)

In Wireshark:

![Postgres RowDescription packet inspected with Wireshark](https://user-images.githubusercontent.com/21223421/178294947-1adab49f-75bb-436d-9cc8-7ae17aca210b.png)

Implementation in Node.js:

```javascript
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
```

### DataRow Message ('D')

The `DataRow` message contains the actual data for a single row:

```
'D' | int32 len | int16 numfields | int32 fieldlen | char[fieldlen] data ...
```

In Wireshark:

![Postgres protocol data row packet inspected](https://user-images.githubusercontent.com/21223421/178295136-cbe1223b-8ca4-4e6b-9316-0375d12ce456.png)

### CommandComplete Message ('C')

The `CommandComplete` message indicates that the query is complete:

```
'C' | int32 len | str tag
```

In Wireshark:

![Postgres protocol command complete packet inspected](https://user-images.githubusercontent.com/21223421/178295697-e627a9cd-074c-47b7-abb5-dbbb70d0442f.png)

Implementation in Node.js:

```javascript
function CommandComplete(buf) {
  buf = Buffer.concat([buf, Buffer.from("C")]);
  buf = Buffer.concat([buf, Buffer.from([0, 0, 0, 13])]);
  buf = Buffer.concat([buf, Buffer.from("SELECT 1")]);
  buf = Buffer.concat([buf, Buffer.from([0])]);
  return buf;
}
```

### ReadyForQuery Message ('Z')

The `ReadyForQuery` message indicates that the server is ready for another query:

```
'Z' | int32 len | 'I' or 'T' or 'E'
```

The status byte indicates:
- 'I': Idle (not in a transaction)
- 'T': In a transaction
- 'E': In a failed transaction

In Wireshark:

![Postgres protocol ready for query packet inspected](https://user-images.githubusercontent.com/21223421/178295926-3ef33f78-796f-4850-b866-dea4d3b66b45.png)

Implementation in Node.js:

```javascript
function readyForQuery(ready) {
  ready = Buffer.concat([ready, Buffer.from("Z")]);
  ready = Buffer.concat([ready, Buffer.from([0, 0, 0, 5])]);
  ready = Buffer.concat([ready, Buffer.from("I")]);
  return ready;
}
```

## Complete Server Example

Here's a simple implementation of a mock PostgreSQL server using Node.js:

```javascript
const Net = require("net");

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
        { name: "Output", tableOID: 0, tableAttributeNumber: 0, dataTypeOID: 25, dataTypeSize: -1, typeModifier: -1, format: 0 },
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
```

## Getting Started

1. Clone this repository:
   ```bash
   git clone https://github.com/username/pg-wire-mock.git
   cd pg-wire-mock
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Run the server:
   ```bash
   node server.js
   ```

4. Connect using `psql`:
   ```bash
   psql -h localhost -p 5432 -U postgres
   ```

## Project Roadmap

This project aims to implement the following parts of the PostgreSQL wire protocol:

- Basic authentication flow
- Simple query handling
- Support for prepared statements
- Common PostgreSQL client commands

For a detailed list of planned features, see the GitHub issues.

## Contributing

Contributions are welcome! Please check out the [Contributing Guide](CONTRIBUTING.md) for guidelines about how to proceed.

## Learning the Protocol

A great way to get a better understanding of the protocol is to:

1. Install Wireshark and inspect the packets sent between client and server
2. Review the [PostgreSQL protocol documentation](https://www.postgresql.org/docs/current/protocol.html)
3. Examine the implemented messages in this repository

## References

- [PostgreSQL Wire Protocol Documentation](https://www.postgresql.org/docs/current/protocol-flow.html)
- [A look at the PostgreSQL wire protocol](https://www.pgcon.org/2014/schedule/attachments/330_postgres-for-the-wire.pdf)
- [How does PostgreSQL actually work](https://www.youtube.com/watch?v=OeKbL55OyL0)
- [Package pgproto3 (Go implementation)](https://github.com/jackc/pgproto3/)

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
