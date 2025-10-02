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
