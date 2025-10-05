# SSL/TLS Support Documentation

This document explains how to configure and use SSL/TLS connections with the PostgreSQL Mock Server.

## Overview

The PostgreSQL Mock Server now supports SSL/TLS encrypted connections, allowing clients to establish secure connections using the standard PostgreSQL SSL request protocol. This implementation handles the SSL negotiation process and upgrades TCP connections to TLS when requested by clients.

## Features

- **SSL Request Handling**: Properly responds to PostgreSQL SSL request messages
- **TLS Connection Upgrade**: Seamlessly upgrades TCP connections to encrypted TLS
- **Certificate Management**: Supports custom SSL certificates and keys
- **Configuration Options**: Comprehensive SSL settings with validation
- **Certificate Generation**: Built-in script to generate self-signed certificates for testing
- **Cross-Platform Support**: Works on Windows, macOS, and Linux

## Quick Start

### 1. Generate Test Certificates

```bash
# Generate self-signed certificates for testing
npm run generate-certs

# Or force regeneration
npm run generate-certs:force
```

### 2. Enable SSL in Configuration

Set environment variables:

```bash
# Enable SSL support
export PG_MOCK_ENABLE_SSL=true

# Certificate paths (defaults)
export PG_MOCK_SSL_CERT_PATH=./certs/server.crt
export PG_MOCK_SSL_KEY_PATH=./certs/server.key

# Optional: SSL security settings
export PG_MOCK_SSL_REJECT_UNAUTHORIZED=false
export PG_MOCK_SSL_MIN_VERSION=TLSv1.2
export PG_MOCK_SSL_MAX_VERSION=TLSv1.3
```

### 3. Start the Server

```bash
# Start with SSL enabled on port 5433
export PORT=5433
npm run dev
```

### 4. Test SSL Connection

Using `psql`:

```bash
psql "sslmode=require host=localhost port=5433 dbname=postgres user=postgres"
```

Using Node.js:

```javascript
const { Client } = require('pg');

const client = new Client({
  host: 'localhost',
  port: 5433,
  database: 'postgres',
  user: 'postgres',
  ssl: {
    rejectUnauthorized: false, // For self-signed certificates
  },
});

await client.connect();
console.log('SSL connection established!');
await client.end();
```

## Configuration Options

### Environment Variables

| Variable                          | Type    | Default              | Description                       |
| --------------------------------- | ------- | -------------------- | --------------------------------- |
| `PG_MOCK_ENABLE_SSL`              | boolean | `false`              | Enable SSL/TLS support            |
| `PG_MOCK_SSL_CERT_PATH`           | string  | `./certs/server.crt` | Path to SSL certificate file      |
| `PG_MOCK_SSL_KEY_PATH`            | string  | `./certs/server.key` | Path to SSL private key file      |
| `PG_MOCK_SSL_CA_PATH`             | string  | `null`               | Path to CA certificate (optional) |
| `PG_MOCK_SSL_REJECT_UNAUTHORIZED` | boolean | `false`              | Reject unauthorized certificates  |
| `PG_MOCK_SSL_MIN_VERSION`         | string  | `TLSv1.2`            | Minimum TLS version               |
| `PG_MOCK_SSL_MAX_VERSION`         | string  | `TLSv1.3`            | Maximum TLS version               |

### Programmatic Configuration

```javascript
const { ServerManager } = require('./src/server/serverManager');

const config = {
  port: 5433,
  enableSSL: true,
  sslCertPath: './certs/server.crt',
  sslKeyPath: './certs/server.key',
  sslRejectUnauthorized: false,
  sslMinVersion: 'TLSv1.2',
  sslMaxVersion: 'TLSv1.3',
};

const server = new ServerManager(config);
await server.start();
```

## Certificate Management

### Generating Self-Signed Certificates

The included certificate generation script creates self-signed certificates suitable for development and testing:

```bash
# Basic generation
npm run generate-certs

# Force regeneration (overwrites existing)
npm run generate-certs:force

# Direct script execution
node scripts/generate-certs.js
```

#### Certificate Details

- **Key Size**: 2048-bit RSA
- **Validity**: 365 days
- **Subject**: localhost (Common Name)
- **Subject Alternative Names**: localhost, 127.0.0.1, ::1
- **Usage**: Server authentication, key encipherment

### Using Custom Certificates

For production or specific testing scenarios, you can use your own certificates:

```bash
# Set custom certificate paths
export PG_MOCK_SSL_CERT_PATH=/path/to/your/certificate.crt
export PG_MOCK_SSL_KEY_PATH=/path/to/your/private.key
export PG_MOCK_SSL_CA_PATH=/path/to/your/ca.crt  # Optional
```

### Certificate Requirements

- **Format**: PEM encoded
- **Key Type**: RSA or EC
- **Extensions**: Server authentication (recommended)
- **Subject**: Should match your server hostname

## SSL Connection Flow

### 1. SSL Request Detection

When a client connects and sends an SSL request:

```
Client -> Server: SSL Request (8 bytes: length + SSL_REQUEST_CODE)
```

### 2. SSL Negotiation

Server responds based on configuration:

```
# SSL Enabled
Server -> Client: 'S' (SSL supported)

# SSL Disabled
Server -> Client: 'N' (SSL not supported)
```

### 3. TLS Handshake

If SSL is accepted, the connection is upgraded to TLS:

```
Client <-> Server: TLS Handshake
Client <-> Server: Encrypted PostgreSQL Protocol
```

### 4. PostgreSQL Protocol

After successful TLS establishment, normal PostgreSQL protocol continues over the encrypted connection.

## Testing SSL Connections

### Unit Tests

Run the SSL-specific test suite:

```bash
# Run all tests
npm test

# Run only SSL tests
npm test -- --testNamePattern="SSL"
```

### Manual Testing

#### Test SSL Acceptance

```javascript
const net = require('net');

const client = new net.Socket();
client.connect(5433, 'localhost', () => {
  // Send SSL request
  const sslRequest = Buffer.alloc(8);
  sslRequest.writeInt32BE(8, 0); // Length
  sslRequest.writeInt32BE(80877103, 4); // SSL_REQUEST_CODE
  client.write(sslRequest);
});

client.on('data', data => {
  console.log('SSL Response:', data[0] === 83 ? 'Accepted (S)' : 'Rejected (N)');
  client.end();
});
```

#### Test Different SSL Modes

```bash
# Require SSL
psql "sslmode=require host=localhost port=5433"

# Prefer SSL but allow non-SSL
psql "sslmode=prefer host=localhost port=5433"

# Disable SSL
psql "sslmode=disable host=localhost port=5433"
```

## Troubleshooting

### Common Issues

#### 1. Certificate Not Found

```
SSL certificates not found for connection
```

**Solution**: Generate certificates or check paths:

```bash
npm run generate-certs
ls -la certs/
```

#### 2. Permission Denied

```
Error reading SSL certificates: EACCES
```

**Solution**: Check file permissions:

```bash
chmod 600 certs/server.key
chmod 644 certs/server.crt
```

#### 3. TLS Handshake Failure

```
SSL error: handshake failure
```

**Solution**: Check TLS version compatibility:

```bash
export PG_MOCK_SSL_MIN_VERSION=TLSv1.0
export PG_MOCK_SSL_MAX_VERSION=TLSv1.3
```

#### 4. Client Certificate Verification

```
certificate verify failed
```

**Solution**: Disable verification for self-signed certificates:

```javascript
ssl: {
  rejectUnauthorized: false, // For self-signed certificates
},
}
```

### Debug Logging

Enable debug logging to troubleshoot SSL issues:

```bash
export PG_MOCK_LOG_LEVEL=debug
npm run dev
```

### OpenSSL Compatibility

The certificate generation script requires OpenSSL:

- **Windows**: Download from [Win32OpenSSL](https://slproweb.com/products/Win32OpenSSL.html)
- **macOS**: `brew install openssl`
- **Ubuntu/Debian**: `sudo apt-get install openssl`

## Security Considerations

### Development vs Production

**Development (Self-Signed)**:

- ✅ Quick setup
- ✅ Local testing
- ❌ Browser warnings
- ❌ Not trusted by clients

**Production (CA-Signed)**:

- ✅ Trusted by clients
- ✅ No browser warnings
- ✅ Better security
- ❌ Requires CA certificate

### Best Practices

1. **Use CA-signed certificates** in production
2. **Set appropriate TLS versions** (TLSv1.2 minimum)
3. **Enable certificate validation** in production
4. **Rotate certificates** before expiration
5. **Secure private keys** with proper permissions
6. **Monitor certificate expiry** dates

### TLS Configuration

```javascript
// Secure production configuration
const secureConfig = {
  enableSSL: true,
  sslRejectUnauthorized: true, // Validate certificates
  sslMinVersion: 'TLSv1.2', // Modern TLS only
  sslMaxVersion: 'TLSv1.3',
  sslCipherSuites: 'ECDHE-RSA-AES128-GCM-SHA256:ECDHE-RSA-AES256-GCM-SHA384',
};
```

## API Reference

### ServerManager SSL Methods

#### `getSSLOptions()`

Returns SSL/TLS configuration options:

```javascript
const sslOptions = serverManager.getSSLOptions();
// Returns: { cert: Buffer, key: Buffer, ca?: Buffer, ... }
```

#### `upgradeToSSL(connectionId, connectionData)`

Upgrades a TCP connection to TLS:

```javascript
serverManager.upgradeToSSL('conn_1', connectionData);
```

### Configuration Validation

The `validateConfig()` function validates SSL settings:

```javascript
const { validateConfig } = require('./src/config/serverConfig');

const result = validateConfig(config);
if (!result.isValid) {
  console.error('SSL configuration errors:', result.errors);
}
```

## Examples

### Basic SSL Server

```javascript
const { ServerManager } = require('./src/server/serverManager');

async function startSSLServer() {
  const config = {
    port: 5433,
    enableSSL: true,
    sslCertPath: './certs/server.crt',
    sslKeyPath: './certs/server.key',
    enableLogging: true,
    logLevel: 'debug',
  };

  const server = new ServerManager(config);

  try {
    await server.start();
    console.log('SSL-enabled PostgreSQL mock server started');
    console.log('Address:', server.getAddress());
  } catch (error) {
    console.error('Failed to start server:', error);
  }
}

startSSLServer();
```

### Client Connection Examples

#### Node.js with pg

```javascript
const { Client } = require('pg');

// Self-signed certificate
const client = new Client({
  host: 'localhost',
  port: 5433,
  ssl: { rejectUnauthorized: false },
});

// CA-signed certificate
const client = new Client({
  host: 'localhost',
  port: 5433,
  ssl: {
    rejectUnauthorized: true,
    ca: fs.readFileSync('ca.crt'),
  },
});
```

#### Python with psycopg2

```python
import psycopg2

# Self-signed certificate
conn = psycopg2.connect(
    host="localhost",
    port=5433,
    sslmode="require",
    sslcert="client.crt",
    sslkey="client.key",
    sslrootcert="ca.crt"
)
```

#### CLI with psql

```bash
# Basic SSL connection
psql "postgresql://user@localhost:5433/dbname?sslmode=require"

# With client certificate
psql "postgresql://user@localhost:5433/dbname?sslmode=require&sslcert=client.crt&sslkey=client.key"
```

## Migration Guide

### Upgrading from Non-SSL

1. **Generate certificates**:

   ```bash
   npm run generate-certs
   ```

2. **Update configuration**:

   ```bash
   export PG_MOCK_ENABLE_SSL=true
   ```

3. **Update client connections**:

   ```javascript
   // Before
   const client = new Client({ host: 'localhost', port: 5432 });

   // After
   const client = new Client({
     host: 'localhost',
     port: 5432,
     ssl: { rejectUnauthorized: false },
   });
   ```

4. **Test connections**:
   ```bash
   psql "sslmode=require host=localhost port=5432"
   ```

### Backward Compatibility

The server maintains backward compatibility:

- **SSL disabled**: Works exactly as before
- **SSL enabled**: Supports both SSL and non-SSL connections
- **Client choice**: Clients can choose SSL or non-SSL

## Contributing

When contributing SSL-related features:

1. **Update tests** in `__tests__/ssl-connection.test.js`
2. **Update documentation** in this file
3. **Test cross-platform** compatibility
4. **Validate with real PostgreSQL clients**
5. **Consider security implications**

### Testing Requirements

- Unit tests for SSL request handling
- Integration tests with real TLS sockets
- Cross-platform certificate generation
- Client compatibility tests

---

For more information, see the main [README.md](../README.md) and [CONTRIBUTING.md](../CONTRIBUTING.md) files.
