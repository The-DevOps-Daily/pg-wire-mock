# Authentication Support

pg-wire-mock supports modern PostgreSQL authentication methods, focusing on secure authentication for testing different authentication scenarios in your applications.

## 🔐 Supported Authentication Methods

### Trust Authentication (Default)

No authentication required - clients connect without providing credentials.

```bash
export PG_MOCK_AUTH_METHOD=trust
export PG_MOCK_REQUIRE_AUTHENTICATION=false
npm start
```

### SCRAM-SHA-256 Authentication (Recommended)

Modern, secure authentication method using SCRAM-SHA-256 (RFC 7677). This is the preferred method in PostgreSQL 10+ and the only password-based authentication method supported.

```bash
export PG_MOCK_AUTH_METHOD=scram-sha-256
export PG_MOCK_REQUIRE_AUTHENTICATION=true
export PG_MOCK_SCRAM_ITERATIONS=4096  # Optional: iteration count
npm start
```

## 🔧 Configuration Options

| Environment Variable             | Description                        | Default | Values                   |
| -------------------------------- | ---------------------------------- | ------- | ------------------------ |
| `PG_MOCK_AUTH_METHOD`            | Authentication method to use       | `trust` | `trust`, `scram-sha-256` |
| `PG_MOCK_REQUIRE_AUTHENTICATION` | Whether authentication is required | `false` | `true`, `false`          |
| `PG_MOCK_SCRAM_ITERATIONS`       | SCRAM-SHA-256 iteration count      | `4096`  | Any positive integer     |

## 🔌 Client Connection Examples

### psql (PostgreSQL CLI)

```bash
# Trust authentication (no password)
psql -h localhost -p 5432 -U postgres -d postgres

# With authentication enabled (will prompt for password)
psql -h localhost -p 5432 -U postgres -d postgres -W

# Specify connection string
psql "host=localhost port=5432 dbname=postgres user=postgres"
```

### Node.js (node-postgres)

```javascript
const { Client } = require('pg');

// Trust authentication
const client = new Client({
  host: 'localhost',
  port: 5432,
  database: 'postgres',
  user: 'postgres',
});

// With authentication
const clientWithAuth = new Client({
  host: 'localhost',
  port: 5432,
  database: 'postgres',
  user: 'postgres',
  password: 'password', // Default mock password
});

await client.connect();
```

### Python (psycopg2)

```python
import psycopg2

# Trust authentication
conn = psycopg2.connect(
    host="localhost",
    port=5432,
    database="postgres",
    user="postgres"
)

# With authentication
conn_with_auth = psycopg2.connect(
    host="localhost",
    port=5432,
    database="postgres",
    user="postgres",
    password="password"  # Default mock password
)
```

### Java (JDBC)

```java
// Trust authentication
String url = "jdbc:postgresql://localhost:5432/postgres";
Connection conn = DriverManager.getConnection(url, "postgres", null);

// With authentication
String urlWithAuth = "jdbc:postgresql://localhost:5432/postgres";
Connection connWithAuth = DriverManager.getConnection(urlWithAuth, "postgres", "password");
```

## 🛡️ SCRAM-SHA-256 Details

SCRAM-SHA-256 (Salted Challenge Response Authentication Mechanism) is a modern authentication method that provides:

### Security Features

- **Salted passwords**: Passwords are salted before hashing
- **Challenge-response**: No passwords transmitted over the network
- **Iteration count**: Configurable PBKDF2 iterations for key stretching
- **Mutual authentication**: Both client and server authenticate each other

### Protocol Flow

1. Client sends authentication request
2. Server responds with SASL mechanisms (SCRAM-SHA-256)
3. Client sends initial SCRAM message with username and nonce
4. Server responds with server nonce, salt, and iteration count
5. Client computes proof and sends final message
6. Server verifies proof and sends verification signature
7. Authentication completes successfully

### Configuration Recommendations

- **Development**: Use 4,096 iterations for faster testing
- **Production**: Use 10,000+ iterations for enhanced security
- **Security**: Always use SCRAM-SHA-256 over SCRAM-SHA-1

## 🧪 Testing Authentication

### Test Different Authentication Methods

```bash
# Test trust authentication
export PG_MOCK_AUTH_METHOD=trust
npm start &
psql -h localhost -p 5432 -U testuser -c "SELECT 'Trust auth works!'"

# Test SCRAM-SHA-256 authentication
export PG_MOCK_AUTH_METHOD=scram-sha-256
export PG_MOCK_REQUIRE_AUTHENTICATION=true
npm start &
echo "password" | psql -h localhost -p 5432 -U testuser -c "SELECT 'SCRAM auth works!'"
```

### Automated Testing

```javascript
// Jest test example
const { Client } = require('pg');

describe('Authentication Tests', () => {
  test('should connect with trust auth', async () => {
    const client = new Client({
      host: 'localhost',
      port: 5432,
      user: 'testuser',
    });

    await client.connect();
    const result = await client.query('SELECT 1');
    expect(result.rows[0]['?column?']).toBe(1);
    await client.end();
  });

  test('should connect with SCRAM-SHA-256', async () => {
    const client = new Client({
      host: 'localhost',
      port: 5432,
      user: 'testuser',
      password: 'password',
    });

    await client.connect();
    const result = await client.query('SELECT 1');
    expect(result.rows[0]['?column?']).toBe(1);
    await client.end();
  });
});
```

## 🐛 Troubleshooting

### Common Issues

**"authentication method X not supported"**

- Check that `PG_MOCK_AUTH_METHOD` is set to a supported value (`trust` or `scram-sha-256`)
- Verify that `PG_MOCK_REQUIRE_AUTHENTICATION=true` when using SCRAM-SHA-256

**"SCRAM authentication failed"**

- Default mock password is "password"
- Check client is sending the correct password
- Verify authentication method matches server configuration
- Ensure client supports SCRAM-SHA-256 (PostgreSQL 10+, recent drivers)
- Check iteration count isn't set too high for client timeout
- Verify client is using PostgreSQL wire protocol v3.0

**Connection hangs during authentication**

- Check that both client and server support the configured auth method
- Verify network connectivity and firewall settings
- Enable debug logging: `export PG_MOCK_LOG_LEVEL=debug`

### Debug Logging

Enable detailed authentication logging:

```bash
export PG_MOCK_LOG_LEVEL=debug
export PG_MOCK_AUTH_METHOD=scram-sha-256
export PG_MOCK_REQUIRE_AUTHENTICATION=true
npm start
```

This will show detailed logs of the authentication flow, including:

- Authentication method selection
- SCRAM message exchanges
- Credential verification steps
- Error details

## 📚 References

- [PostgreSQL Authentication Methods](https://www.postgresql.org/docs/current/auth-methods.html)
- [SCRAM-SHA-256 RFC 7677](https://tools.ietf.org/html/rfc7677)
- [PostgreSQL Wire Protocol v3.0](https://www.postgresql.org/docs/current/protocol.html)
- [SASL (Simple Authentication and Security Layer)](https://tools.ietf.org/html/rfc4422)

## 🔄 Migration Guide

### Upgrading to Authentication Support

If you're upgrading from a version without authentication support:

1. **No changes required** - trust authentication is the default
2. **Enable authentication** by setting `PG_MOCK_REQUIRE_AUTHENTICATION=true`
3. **Choose authentication method** with `PG_MOCK_AUTH_METHOD`
4. **Update client code** to provide credentials when required
5. **Test thoroughly** with your specific client libraries

### Best Practices

- Use SCRAM-SHA-256 for new applications
- Set appropriate iteration counts for your security requirements
- Always test authentication changes in development first
- Monitor authentication logs for security events
- Consider using SSL/TLS with authentication for enhanced security
