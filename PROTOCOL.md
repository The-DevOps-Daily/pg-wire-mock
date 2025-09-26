# PostgreSQL Wire Protocol Guide

A comprehensive guide to the PostgreSQL wire protocol as implemented in pg-wire-mock.

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

|     |           |              |                |
| --- | --------- | ------------ | -------------- |
| 'R' | int32 len | int32 method | optional other |

Using Wireshark to inspect an `AuthenticationRequest` packet:

![Authentication request inspected with WireShark](https://user-images.githubusercontent.com/21223421/178292228-ff6ab5cd-db4b-42c7-b4cb-055d70e463af.png)

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

## Extended Query Protocol

PostgreSQL also supports an extended query protocol which separates the process into multiple steps:

1. Parse: Client sends a Parse message with an SQL query
2. Bind: Client binds values to the parameters in the parsed query
3. Execute: Client requests execution of the bound query
4. Sync: Client requests synchronization

This extended protocol allows for better performance in applications that reuse similar queries with different parameters.

## Error and Notice Messages

The server can send Error ('E') and Notice ('N') messages at any time. These messages have a similar format:

```
'E'/'N' | int32 len | byte field-type | str field-value | ... | \0
```

Common field types include:

- 'S': Severity
- 'C': Code
- 'M': Message
- 'D': Detail
- 'H': Hint

## Transaction Management

PostgreSQL uses the following transaction states:

- 'I': Idle (not in a transaction)
- 'T': In a transaction block
- 'E': In a failed transaction block

The client can control transactions with SQL commands:

- BEGIN: Start a transaction block
- COMMIT: Commit the current transaction
- ROLLBACK: Roll back the current transaction

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
