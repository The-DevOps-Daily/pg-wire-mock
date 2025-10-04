# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
- Project setup with ESLint, Prettier, Jest
- GitHub Actions CI configuration
- Husky pre-commit hooks
- Docker support
- VS Code configuration
- GitHub issue and PR templates
- Security policy
- Dependabot configuration
- PostgreSQL Wire Protocol documentation
- Minor code refactoring and cleanup

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
