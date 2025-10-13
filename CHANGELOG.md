# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [v1.2.0] - 2025-10-11

### Added

- **COPY Protocol Support** - Full implementation of PostgreSQL COPY command protocol (#108)
  - Support for COPY FROM and COPY TO operations
  - Binary and text format support
  - Streaming data transfer capabilities
  - Comprehensive protocol message handling

- **EXPLAIN Query Support** - Complete EXPLAIN functionality for query analysis (#105)
  - Support for all EXPLAIN formats (TEXT, JSON, XML, YAML)
  - EXPLAIN ANALYZE with simulated timing information
  - Mock execution plans for testing query optimization tools
  - Integration with PostgreSQL client libraries
  - Comprehensive documentation and examples

- **Custom Data Types Support** - Framework for defining custom PostgreSQL data types (#104)
  - Extensible type system architecture
  - Custom type registration and validation
  - Wire protocol integration for custom types

- **SCRAM-SHA-256 Authentication** - Enhanced security with modern authentication (#99, #100)
  - Full SCRAM-SHA-256 implementation
  - Secure password hashing and verification
  - Nonce generation and challenge-response protocol
  - Backwards compatibility with existing auth methods

- **Enhanced Query Logging** - Comprehensive query monitoring and debugging (#96)
  - Timestamped query logs with execution details
  - Parameter binding information
  - Configurable log levels and formats
  - Performance metrics and timing data

- **SSL/TLS Support** - Secure connections for production-like testing (#89)
  - Full SSL/TLS handshake implementation
  - Certificate-based authentication
  - Configurable cipher suites and protocols
  - Self-signed certificate generation scripts

- **Comprehensive Error Handling** - PostgreSQL-compliant error responses (#91)
  - Standard PostgreSQL error codes and messages
  - Detailed error context and suggestions
  - Proper error propagation through the protocol stack
  - Enhanced debugging capabilities

- **Protocol Test Suite** - Extensive testing framework for protocol compliance (#103)
  - Message flow validation tests
  - Authentication mechanism tests
  - Error condition testing
  - Performance and stress testing

- **Environment Variable Validation** - Robust configuration management (#86)
  - Startup validation of all configuration parameters
  - Clear error messages for invalid settings
  - Default value documentation and validation

### Improved

- **Connection State Management** - Enhanced connection lifecycle handling (#83)
  - Improved state validation methods
  - Better connection tracking and cleanup
  - Enhanced error recovery mechanisms

- **Message Type Validation** - Strengthened protocol message handling (#84)
  - Comprehensive protocol state validation
  - Enhanced message type checking
  - Better error reporting for invalid messages

- **Logging System** - Standardized log formatting across components (#85)
  - Consistent log message structure
  - Improved readability and parsing
  - Better integration with log aggregation tools

- **Test Infrastructure** - Reduced test noise and improved reliability (#92, #93)
  - Cleaner test output and reporting
  - Fixed flaky tests and race conditions
  - Better test isolation and cleanup

### Fixed

- **Linting Issues** - Code quality and consistency improvements (#107, #98)
  - Fixed ESLint violations across codebase
  - Improved CI/CD pipeline reliability
  - Enhanced code formatting and style consistency

### Internal

- **Error Message Consolidation** - Centralized error constant management (#82)
  - Unified error message definitions
  - Improved maintainability and consistency
  - Better internationalization support preparation

## [1.1.0] - 2024-10-04

### Added

- **PostgreSQL Array Type Support** - Complete implementation of PostgreSQL array data types
  - Support for 40+ array types (INT4[], TEXT[], BOOL[], etc.)
  - Multi-dimensional array support (2D, 3D, and beyond)
  - Array literal syntax: `'{1,2,3,4,5}'::int4[]`
  - Array constructor syntax: `ARRAY[1, 2, 3, 4, 5]`
  - Automatic array encoding/decoding in wire protocol messages
  - Comprehensive test suite with 54 test cases
  - Full documentation in [docs/ARRAY_SUPPORT.md](docs/ARRAY_SUPPORT.md)
- **Graceful Shutdown System**
  - Multi-phase shutdown process with connection draining
  - Client notification system with shutdown notices
  - Automatic transaction rollback during shutdown
  - Configurable shutdown and drain timeouts
  - Force closure of lingering connections after timeout
  - Comprehensive shutdown status monitoring
  - Signal handling for SIGTERM, SIGINT, and SIGUSR1
  - Resource cleanup and state management
  - Error handling during shutdown process
- **Enhanced Configuration**
  - `PG_MOCK_SHUTDOWN_TIMEOUT` environment variable (default: 30000ms)
  - `PG_MOCK_SHUTDOWN_DRAIN_TIMEOUT` environment variable (default: 10000ms)
  - New server configuration options for shutdown behavior
- **API Enhancements**
  - `isServerShuttingDown()` method to check shutdown status
  - `getShutdownStatus()` method for detailed shutdown information
  - `getActiveConnectionCount()` method for connection monitoring
  - Enhanced `closeConnection()` method with graceful closure support
- **Documentation**
  - Comprehensive [Graceful Shutdown Documentation](SHUTDOWN.md)
  - Updated README with shutdown configuration and best practices
  - API reference for shutdown methods and monitoring
- **Testing**
  - Comprehensive test suite for shutdown behavior
  - Tests for connection draining and force closure
  - Error handling tests during shutdown
  - Configuration and status monitoring tests

### Changed

- Enhanced CI/CD pipeline with security scanning
- Improved Docker configuration to reduce vulnerabilities
- Code quality improvements and linting fixes

### Fixed

- Docker security vulnerabilities
- Linting issues and code formatting
- Minor bug fixes and stability improvements

## [1.0.0] - Initial Release

### Added

- Full PostgreSQL wire protocol v3.0 support
- Authentication flow
- Simple and extended query protocols
- Transaction management
- Multiple query types (SELECT, SHOW, INSERT, UPDATE, DELETE)
- Connection state management
- Prepared statements and portals
- Error handling with proper SQLSTATE codes
- Connection statistics and monitoring
