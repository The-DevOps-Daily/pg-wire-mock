# pg-wire-mock

[![CI](https://github.com/The-DevOps-Daily/pg-wire-mock/actions/workflows/ci.yml/badge.svg)](https://github.com/The-DevOps-Daily/pg-wire-mock/actions/workflows/ci.yml)
[![npm version](https://img.shields.io/npm/v/pg-wire-mock.svg)](https://www.npmjs.com/package/pg-wire-mock)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](https://github.com/The-DevOps-Daily/pg-wire-mock/blob/main/CONTRIBUTING.md)

A comprehensive mock PostgreSQL server that implements the PostgreSQL wire protocol for learning, testing, and development purposes. Built for experimenting with and understanding the PostgreSQL wire protocol.

> **New!** Check out our detailed [PostgreSQL Wire Protocol Guide](PROTOCOL.md) to learn how the protocol works, and our [Graceful Shutdown Documentation](SHUTDOWN.md) for production deployment guidance.

## 🌟 Features

- **Complete PostgreSQL Wire Protocol v3.0 Support**
  - Authentication flow with parameter negotiation
  - Simple and extended query protocols
  - Transaction management (BEGIN/COMMIT/ROLLBACK)
  - Prepared statements and portals
  - Error handling with proper SQLSTATE codes
  - **PostgreSQL array type support** (NEW!) - [See Array Documentation](docs/ARRAY_SUPPORT.md)

- **Comprehensive Query Support**
  - SELECT queries with various functions
  - Array queries and operations (NEW!)
  - SHOW commands for server information
  - DDL commands (CREATE/DROP - mock responses)
  - DML commands (INSERT/UPDATE/DELETE - mock responses)
  - Transaction control statements

- **Production-Ready Architecture**
  - Modular, well-organized codebase
  - Connection management and pooling
  - Configurable logging and monitoring
  - Statistics and performance tracking
  - Graceful shutdown handling with connection draining

## 🚀 Quick Start

### Installation

```bash
# Clone the repository
git clone https://github.com/The-DevOps-Daily/pg-wire-mock.git
cd pg-wire-mock

# Install dependencies (none required for basic usage!)
npm install

# Start the server
npm start
```

### Using the Server

```bash
# Start with default settings (port 5432)
npm start

# Start on a different port
npm run start:port  # Uses port 5433

# Start with debug logging
npm run dev

# Start quietly (no logging)
npm run start:quiet

# Start listening on all interfaces
npm run start:all
```

### Connect with psql

```bash
psql -h localhost -p 5432 -U postgres
```

### Try Some Queries

```sql
-- Basic queries
SELECT 1;
SELECT VERSION();
SELECT NOW();
SELECT CURRENT_USER;

-- Array queries (NEW!)
SELECT ARRAY[1, 2, 3, 4, 5];
SELECT '{apple,banana,cherry}';
SELECT '{1,2,3,4,5}'::int4[];
SELECT '{{a,b},{c,d}}'::text[][];

-- Server information
SHOW DOCS;
SHOW SERVER_VERSION;
SHOW TIMEZONE;

-- Transaction management
BEGIN;
SELECT 42;
COMMIT;
```

## 📖 Architecture

The server is built with a clean, modular architecture:

```
pg-wire-mock/
├── server.js                           # Main entry point and CLI
├── src/
│   ├── server/
│   │   └── serverManager.js            # TCP server and connection management
│   ├── protocol/
│   │   ├── messageProcessors.js        # Protocol message handling
│   │   ├── messageBuilders.js          # Protocol message construction
│   │   ├── constants.js                # Protocol constants and types
│   │   └── utils.js                    # Protocol utilities
│   ├── handlers/
│   │   └── queryHandlers.js            # SQL query processing
│   ├── connection/
│   │   └── connectionState.js          # Connection state management
│   └── config/
│       └── serverConfig.js             # Configuration management
├── package.json
├── CONTRIBUTING.md
├── LICENSE
└── README.md
```

### Key Components

- **ServerManager**: TCP server lifecycle, connection management, statistics
- **Message Processors**: Handle incoming protocol messages
- **Message Builders**: Construct outgoing protocol responses
- **Query Handlers**: Process SQL queries and generate results
- **Connection State**: Track connection parameters and transaction state
- **Configuration**: Centralized configuration with environment variable support

## ⚙️ Configuration

### Command Line Options

```bash
node server.js [options]

Options:
  -p, --port <port>              Port to listen on (default: 5432)
  -h, --host <host>              Host to bind to (default: localhost)
  --max-connections <num>        Max concurrent connections (default: 100)
  --log-level <level>            Log level: error, warn, info, debug (default: info)
  -q, --quiet                    Disable logging
  --help                         Show help message
  --version                      Show version information
```

### Environment Variables

```bash
# Server settings
export PG_MOCK_PORT=5432
export PG_MOCK_HOST=localhost
export PG_MOCK_MAX_CONNECTIONS=100
export PG_MOCK_CONNECTION_TIMEOUT=300000

# Logging settings
export PG_MOCK_ENABLE_LOGGING=true
export PG_MOCK_LOG_LEVEL=info

# Shutdown settings
export PG_MOCK_SHUTDOWN_TIMEOUT=30000
export PG_MOCK_SHUTDOWN_DRAIN_TIMEOUT=10000

# Database settings
export PG_MOCK_SERVER_VERSION="13.0 (Mock)"
export PG_MOCK_DEFAULT_DATABASE=postgres
export PG_MOCK_DEFAULT_USER=postgres
export PG_MOCK_DEFAULT_TIMEZONE=UTC
```

View current configuration:

```bash
npm run config
```

## 🔧 Development

### Project Structure

The codebase follows a clean architecture pattern:

1. **Presentation Layer** (`server.js`): CLI interface and application entry point
2. **Infrastructure Layer** (`src/server/`): TCP server management
3. **Protocol Layer** (`src/protocol/`): PostgreSQL wire protocol implementation
4. **Application Layer** (`src/handlers/`): Business logic for query processing
5. **Domain Layer** (`src/connection/`): Connection state and lifecycle management
6. **Configuration Layer** (`src/config/`): Application configuration

### Adding New Features

1. **New Query Types**: Add handlers in `src/handlers/queryHandlers.js`
2. **New Protocol Messages**: Add processors in `src/protocol/messageProcessors.js` and builders in `src/protocol/messageBuilders.js`
3. **New Configuration**: Update `src/config/serverConfig.js`
4. **New Connection Features**: Extend `src/connection/connectionState.js`

### Code Quality

- **Modular Design**: Each module has a single responsibility
- **Comprehensive Documentation**: JSDoc comments throughout
- **Error Handling**: Proper error responses with SQLSTATE codes
- **Logging**: Configurable logging with structured output
- **Configuration**: Environment-based configuration with validation

## 📊 Monitoring and Statistics

The server provides detailed statistics and monitoring:

```javascript
// Access server statistics (when running programmatically)
const stats = server.getStats();
console.log(stats);
// {
//   connectionsAccepted: 42,
//   messagesProcessed: 156,
//   queriesExecuted: 89,
//   uptime: 3600000,
//   activeConnections: 3
// }
```

## 🔄 Graceful Shutdown

The server implements comprehensive graceful shutdown behavior to ensure clean connection termination:

### Shutdown Process

1. **Stop Accepting New Connections**: Server immediately stops accepting new client connections
2. **Notify Active Clients**: All connected clients receive a shutdown notice
3. **Transaction Rollback**: Any active transactions are automatically rolled back
4. **Connection Draining**: Server waits for clients to disconnect gracefully
5. **Force Close**: After timeout, remaining connections are force-closed
6. **Resource Cleanup**: All server resources are cleaned up

### Configuration

```bash
# Shutdown timeout (total time for graceful shutdown)
export PG_MOCK_SHUTDOWN_TIMEOUT=30000

# Connection drain timeout (time to wait for clients to disconnect)
export PG_MOCK_SHUTDOWN_DRAIN_TIMEOUT=10000
```

### Shutdown Status Monitoring

```javascript
// Check if server is shutting down
if (server.isServerShuttingDown()) {
  console.log('Server is currently shutting down');
}

// Get detailed shutdown status
const status = server.getShutdownStatus();
console.log(status);
// {
//   isShuttingDown: false,
//   activeConnections: 5,
//   shutdownTimeout: 30000,
//   drainTimeout: 10000
// }
```

### Signal Handling

The server automatically handles common termination signals:

- **SIGTERM**: Graceful shutdown (used by process managers)
- **SIGINT**: Graceful shutdown (Ctrl+C)
- **SIGUSR1**: Graceful shutdown (custom signal)

### Best Practices

- **Client Applications**: Implement proper connection cleanup to respond to shutdown notices
- **Process Managers**: Use SIGTERM for graceful shutdown, SIGKILL only as last resort
- **Monitoring**: Check `isServerShuttingDown()` before attempting new operations
- **Timeouts**: Configure appropriate timeouts based on your application needs

## 🐞 Debugging

Enable debug logging to see detailed protocol information:

```bash
# Start with debug logging
npm run dev

# Or set environment variable
PG_MOCK_LOG_LEVEL=debug npm start
```

Debug logging shows:

- Individual protocol messages
- Connection state changes
- Query processing steps
- Buffer management details
- Performance statistics

## 📚 Learning the Protocol

This project is an excellent way to understand the PostgreSQL wire protocol:

1. **Start Simple**: Run the server and connect with psql
2. **Enable Debug Logging**: See exactly what messages are exchanged
3. **Try Different Queries**: Observe how different SQL commands are handled
4. **Examine the Code**: Follow a query from TCP socket to SQL response
5. **Use Wireshark**: Capture packets to see the binary protocol

### Useful Resources

- [PostgreSQL Wire Protocol Documentation](https://www.postgresql.org/docs/current/protocol.html)
- [Protocol Flow Diagrams](https://www.postgresql.org/docs/current/protocol-flow.html)
- [Message Format Reference](https://www.postgresql.org/docs/current/protocol-message-formats.html)

## 🤝 Contributing

We welcome contributions! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

### Development Workflow

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/my-feature`
3. Make your changes following the existing architecture
4. Test with various PostgreSQL clients
5. Submit a pull request

### Areas for Contribution

- Additional SQL query types and functions
- Enhanced protocol message support
- Performance optimizations
- Test coverage improvements
- Documentation enhancements
- Bug fixes and edge case handling

## 📝 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- PostgreSQL community for excellent protocol documentation
- Node.js community for robust TCP server capabilities
- All contributors who help improve this educational tool

## 📞 Support

- **Issues**: [GitHub Issues](https://github.com/The-DevOps-Daily/pg-wire-mock/issues)
- **Discussions**: [GitHub Discussions](https://github.com/The-DevOps-Daily/pg-wire-mock/discussions)
- **Documentation**: [Protocol Documentation](https://www.postgresql.org/docs/current/protocol.html)

---

**Happy learning!** 🎓 This project aims to make the PostgreSQL wire protocol approachable and understandable for developers, students, and database enthusiasts.
