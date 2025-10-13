# COPY Protocol Support

This document describes the PostgreSQL COPY protocol implementation in the pg-wire-mock server.

## Overview

The COPY protocol allows for efficient bulk data transfer between PostgreSQL clients and servers. This mock implementation supports both COPY IN (data from client to server) and COPY OUT (data from server to client) operations.

## Supported Operations

### COPY FROM (COPY IN)
- `COPY table FROM STDIN`
- `COPY table (columns) FROM STDIN`
- `COPY table FROM STDIN WITH (options)`

### COPY TO (COPY OUT)
- `COPY table TO STDOUT`
- `COPY table (columns) TO STDOUT`
- `COPY (query) TO STDOUT`
- `COPY table TO STDOUT WITH (options)`

## Data Formats

### Text Format (Default)
- Tab-delimited fields
- Newline-terminated records
- Configurable delimiter via `DELIMITER` option
- NULL representation via `NULL` option

### CSV Format
- Comma-separated values
- Quoted fields containing delimiters or special characters
- Configurable quote character via `QUOTE` option
- Header support via `HEADER` option

### Binary Format
- PostgreSQL binary wire format
- Efficient for large datasets
- Type-specific encoding

## Configuration

Enable COPY protocol support in server configuration:

```javascript
{
  enableCopyProtocol: true
}
```

Or via environment variable:
```bash
PG_MOCK_ENABLE_COPY_PROTOCOL=true
```

## Usage Examples

### Basic COPY IN
```sql
COPY users FROM STDIN;
1	John Doe	john@example.com
2	Jane Doe	jane@example.com
\.
```

### COPY IN with CSV Format
```sql
COPY users FROM STDIN WITH (FORMAT csv, HEADER true);
id,name,email
1,"John Doe","john@example.com"
2,"Jane Doe","jane@example.com"
\.
```

### COPY OUT to Client
```sql
COPY users TO STDOUT;
-- Returns tab-delimited data
```

### COPY OUT from Query
```sql
COPY (SELECT id, name FROM users WHERE active = true) TO STDOUT WITH (FORMAT csv);
-- Returns CSV-formatted query results
```

## Options Reference

| Option | Description | Values | Default |
|--------|-------------|--------|---------|
| `FORMAT` | Data format | `text`, `csv`, `binary` | `text` |
| `DELIMITER` | Field delimiter | Single character | `\t` (tab) |
| `NULL` | NULL value representation | String | `\N` |
| `HEADER` | Include header row (CSV only) | `true`, `false` | `false` |
| `QUOTE` | Quote character (CSV only) | Single character | `"` |
| `ESCAPE` | Escape character | Single character | Same as quote |
| `FREEZE` | Optimize for bulk loading | `true`, `false` | `false` |

## Protocol Flow

### COPY IN (FROM STDIN)
1. Client sends COPY query
2. Server responds with CopyInResponse message
3. Client sends CopyData messages with row data
4. Client sends CopyDone or CopyFail message
5. Server responds with CommandComplete

### COPY OUT (TO STDOUT)
1. Client sends COPY query
2. Server responds with CopyOutResponse message
3. Server sends CopyData messages with row data
4. Server sends CopyDone message
5. Server sends CommandComplete

## Mock Data Generation

The mock server generates realistic test data for COPY operations:

### Table Data
- Generates mock rows based on table name
- Includes common fields like id, name, email, timestamps
- Configurable row count via query options

### Query Results
- Simulates query execution results
- Supports basic SELECT queries with WHERE clauses
- Returns appropriate column types

## Error Handling

### Client Errors
- Invalid query syntax
- Unsupported options
- Protocol violations

### Server Errors
- Data format errors
- Resource limitations
- Internal processing errors

### Error Codes
- `42601`: Syntax error in COPY command
- `0A000`: Feature not supported
- `08P01`: Protocol violation
- `22P02`: Invalid text representation
- `22P03`: Invalid binary format
- `22P04`: Bad COPY file format

## Performance Considerations

### Batch Processing
- Data is processed in chunks for efficiency
- Configurable buffer sizes
- Memory usage optimization

### Connection State
- Tracks active COPY operations
- Maintains statistics (rows processed, bytes transferred)
- Handles concurrent connections

## Testing

Comprehensive test suite covers:
- Query parsing and validation
- Data format handling (text, CSV, binary)
- Protocol message processing
- Error scenarios
- Integration workflows

Run COPY protocol tests:
```bash
npm test -- __tests__/handlers/copyBasic.test.js
```

## Client Libraries

### Node.js (pg)
```javascript
const { Pool } = require('pg');

// COPY IN example
const copyStream = client.query(copyFrom('COPY users FROM STDIN WITH CSV HEADER'));
copyStream.write('1,John,john@example.com\n');
copyStream.end();

// COPY OUT example
const copyToStream = client.query(copyTo('COPY users TO STDOUT WITH CSV'));
copyToStream.pipe(process.stdout);
```

### Python (psycopg2)
```python
import psycopg2

# COPY IN example
with conn.cursor() as cur:
    with cur.copy("COPY users FROM STDIN WITH CSV HEADER") as copy:
        copy.write_row([1, 'John', 'john@example.com'])

# COPY OUT example
with conn.cursor() as cur:
    with cur.copy("COPY users TO STDOUT WITH CSV") as copy:
        for row in copy:
            print(row)
```

## Limitations

### Current Implementation
- File-based COPY operations not supported (only STDIN/STDOUT)
- Limited to basic data types
- No compression support
- No parallel processing

### Future Enhancements
- File I/O operations
- Advanced data types (JSON, arrays, etc.)
- Streaming compression
- Performance optimizations

## Troubleshooting

### Common Issues

**COPY command not recognized**
- Ensure `enableCopyProtocol: true` in configuration
- Check server startup logs for feature flags

**Data format errors**
- Verify delimiter and quote characters match client expectations
- Check for proper escaping in CSV data
- Validate binary format alignment

**Protocol violations**
- Ensure proper message sequencing
- Handle connection state correctly
- Check for premature connection termination

### Debug Logging

Enable detailed COPY protocol logging:
```javascript
{
  queryLogging: {
    enableDetailedLogging: true,
    logLevel: 'debug'
  }
}
```

## Security Considerations

### Data Validation
- Input sanitization for all COPY data
- SQL injection protection
- Resource usage limits

### Access Control
- Authentication required for COPY operations
- Table-level permissions (simulated)
- Connection limits and rate limiting

## Compliance

This implementation follows the PostgreSQL wire protocol specification:
- Protocol version 3.0 compatibility
- Standard message formats
- Error code conventions
- Client library compatibility

## References

- [PostgreSQL COPY Documentation](https://www.postgresql.org/docs/current/sql-copy.html)
- [PostgreSQL Wire Protocol](https://www.postgresql.org/docs/current/protocol.html)
- [Frontend/Backend Protocol](https://www.postgresql.org/docs/current/protocol-flow.html)