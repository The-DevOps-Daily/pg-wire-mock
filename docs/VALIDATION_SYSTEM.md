# PostgreSQL Wire Protocol Validation System

A comprehensive tool for validating protocol compliance and preventing regressions in the PostgreSQL wire protocol mock server.

## Overview

The validation system provides:

- **Message Format Validation**: Validates all message types against PostgreSQL specifications
- **Protocol Compliance Testing**: Tests complete protocol flows and state management
- **Edge Case Testing**: Tests handling of unusual but valid inputs
- **Error Condition Testing**: Tests robustness against malformed and invalid inputs
- **Protocol Fuzzing**: Generates random malformed messages to test robustness
- **Real PostgreSQL Comparison**: Compares behavior with actual PostgreSQL instances
- **CI Integration**: Automated regression prevention in continuous integration

## Quick Start

### Basic Usage

```bash
# Run all validation tests
npm run validate

# Run with HTML report
npm run validate:full

# Run specific test categories
npm run validate:compliance
npm run validate:edge-cases
npm run validate:error-conditions
npm run validate:fuzzing
npm run validate:message-format

# Run for CI (quiet mode with JSON output)
npm run validate:ci
```

### Command Line Interface

```bash
# Basic validation
node src/validation/cli.js

# With custom options
node src/validation/cli.js --format html --output ./reports --verbose

# Run specific test type
node src/validation/cli.js --test compliance --verbose

# With real PostgreSQL comparison
node src/validation/cli.js --real-postgresql --postgresql-config ./pg-config.json
```

## Test Categories

### 1. Message Format Validation

Validates the structure and format of all PostgreSQL wire protocol messages.

**Tests Include:**
- Message length validation
- Message type validation
- Required field presence
- Optional field handling
- Data type validation
- Encoding validation

**Example:**
```javascript
const validator = new MessageValidator();
const results = await validator.validateAllMessageFormats();
```

### 2. Protocol Compliance Testing

Tests complete protocol flows and state management.

**Tests Include:**
- Startup message protocol version handling
- Authentication flow (SCRAM-SHA-256)
- Query execution flow
- Extended query protocol (Parse/Bind/Execute/Describe)
- Transaction state management
- Error response format
- Parameter status messages
- Backend key data

**Example:**
```javascript
const tester = new ProtocolTester();
const results = await tester.runComplianceTests();
```

### 3. Edge Case Testing

Tests handling of unusual but valid inputs.

**Tests Include:**
- Empty query strings
- Very long queries
- Unicode characters and emojis
- Special characters and SQL injection attempts
- Large result sets
- Many columns
- Binary data
- Null values

**Example:**
```javascript
const results = await tester.runEdgeCaseTests();
```

### 4. Error Condition Testing

Tests robustness against malformed and invalid inputs.

**Tests Include:**
- Invalid message types
- Malformed message lengths
- Incomplete messages
- Invalid authentication
- Protocol violations
- Connection state errors
- Memory exhaustion
- Timeout conditions
- Buffer overflow
- Invalid data types
- Malformed arrays
- Invalid UTF-8 sequences
- Concurrent connection limits
- Resource exhaustion

**Example:**
```javascript
const results = await tester.runErrorConditionTests();
```

### 5. Protocol Fuzzing

Generates random malformed messages to test robustness.

**Fuzzing Strategies:**
- Message corruption (bit flips, byte swaps, length corruption)
- Boundary testing (minimum/maximum lengths, overflow)
- Encoding issues (invalid UTF-8, null byte injection)
- Protocol violations (invalid sequences, missing fields)

**Example:**
```javascript
const fuzzer = new ProtocolFuzzer();
const results = await fuzzer.runFuzzingTests({
  iterations: 1000,
  strategies: ['messageCorruption', 'boundaryTesting']
});
```

### 6. Real PostgreSQL Comparison

Compares behavior with actual PostgreSQL instances.

**Comparison Tests:**
- Message format compatibility
- Response format validation
- Error message consistency
- Performance comparison
- Feature compatibility

**Example:**
```javascript
const comparator = new RealPostgreSQLComparator({
  host: 'localhost',
  port: 5432,
  database: 'testdb',
  username: 'postgres',
  password: 'postgres'
});
const results = await comparator.runComparisonTests();
```

## Configuration

### Validation System Options

```javascript
const options = {
  enableFuzzing: true,                    // Enable protocol fuzzing
  enableRealPostgreSQLComparison: false,  // Enable real PostgreSQL comparison
  realPostgreSQLConfig: null,             // PostgreSQL connection config
  reportFormat: 'json',                   // Report format: json, html, text
  outputDir: './validation-reports',      // Output directory
  verbose: false,                         // Verbose output
  quiet: false                           // Quiet mode
};
```

### PostgreSQL Configuration

```javascript
const pgConfig = {
  host: 'localhost',
  port: 5432,
  database: 'testdb',
  username: 'postgres',
  password: 'postgres',
  ssl: false
};
```

## Report Formats

### JSON Report

```json
{
  "timestamp": "2024-01-15T10:30:00.000Z",
  "version": "1.0.0",
  "tests": {
    "messageFormat": {
      "total": 25,
      "passed": 24,
      "failed": 1,
      "warnings": 2,
      "details": { ... }
    }
  },
  "summary": {
    "total": 150,
    "passed": 145,
    "failed": 5,
    "warnings": 8,
    "successRate": 96.67
  }
}
```

### HTML Report

Generates a comprehensive HTML report with:
- Interactive test results
- Detailed error information
- Performance metrics
- Visual charts and graphs
- Export capabilities

### Text Report

Simple text-based report suitable for terminal output and CI systems.

## CI Integration

### GitHub Actions

The validation system includes a GitHub Actions workflow that runs:

- On every push and pull request
- Daily scheduled runs
- Multiple Node.js versions
- Real PostgreSQL comparison (main branch only)
- Performance benchmarks (scheduled runs)

### CI Script

```bash
# Run CI validation
node scripts/ci-validation.js
```

The CI script:
- Runs all validation tests
- Checks against configurable thresholds
- Generates CI-specific reports
- Returns appropriate exit codes
- Provides detailed failure information

### Thresholds

Configurable thresholds for CI validation:

```javascript
const thresholds = {
  minSuccessRate: 95,        // Minimum 95% success rate
  maxCriticalIssues: 0,      // No critical issues allowed
  maxWarnings: 10,           // Maximum 10 warnings
  maxFuzzingCrashes: 5       // Maximum 5 fuzzing crashes
};
```

## API Reference

### ProtocolValidationSystem

Main validation system class.

```javascript
const system = new ProtocolValidationSystem(options);

// Run full validation suite
const results = await system.runValidationSuite();

// Run specific test type
const results = await system.runSpecificTest('compliance');

// Get system status
const status = system.getStatus();
```

### MessageValidator

Validates message formats against specifications.

```javascript
const validator = new MessageValidator();

// Validate all message formats
const results = await validator.validateAllMessageFormats();

// Validate specific message
const result = validator.validateMessage(buffer, rules);
```

### ProtocolTester

Tests protocol compliance and edge cases.

```javascript
const tester = new ProtocolTester();

// Run compliance tests
const results = await tester.runComplianceTests();

// Run edge case tests
const results = await tester.runEdgeCaseTests();

// Run error condition tests
const results = await tester.runErrorConditionTests();
```

### ProtocolFuzzer

Generates malformed messages for robustness testing.

```javascript
const fuzzer = new ProtocolFuzzer();

// Run fuzzing tests
const results = await fuzzer.runFuzzingTests({
  iterations: 1000,
  strategies: ['messageCorruption', 'boundaryTesting']
});
```

### RealPostgreSQLComparator

Compares behavior with real PostgreSQL instances.

```javascript
const comparator = new RealPostgreSQLComparator(pgConfig);

// Run comparison tests
const results = await comparator.runComparisonTests();
```

## Best Practices

### Development Workflow

1. **Before Committing**: Run `npm run validate` to catch issues early
2. **Pull Requests**: Ensure all validation tests pass
3. **Releases**: Run full validation suite including real PostgreSQL comparison
4. **Monitoring**: Set up alerts for validation failures in CI

### Test Writing

1. **Comprehensive Coverage**: Test all message types and edge cases
2. **Realistic Scenarios**: Use real-world data and scenarios
3. **Error Handling**: Test both success and failure paths
4. **Performance**: Consider performance implications of tests

### CI Configuration

1. **Thresholds**: Set appropriate thresholds for your project
2. **Parallelization**: Run tests in parallel when possible
3. **Caching**: Cache dependencies and intermediate results
4. **Reporting**: Generate and store detailed reports

## Troubleshooting

### Common Issues

**Validation Failures:**
- Check message format compliance
- Verify protocol state management
- Review error handling logic

**Performance Issues:**
- Reduce fuzzing iterations
- Disable real PostgreSQL comparison
- Optimize test data generation

**CI Failures:**
- Check threshold configuration
- Review test environment setup
- Verify dependency versions

### Debug Mode

```bash
# Run with verbose output
npm run validate -- --verbose

# Run specific test with debug info
node src/validation/cli.js --test compliance --verbose
```

### Logging

The validation system uses structured logging:

```javascript
const logger = require('../utils/logger');
logger.info('Validation started', { testType: 'compliance' });
logger.error('Validation failed', { error: error.message });
```

## Contributing

### Adding New Tests

1. **Message Format Tests**: Add to `MessageValidator`
2. **Protocol Tests**: Add to `ProtocolTester`
3. **Fuzzing Tests**: Add to `ProtocolFuzzer`
4. **Comparison Tests**: Add to `RealPostgreSQLComparator`

### Test Structure

```javascript
async testNewFeature(options = {}) {
  const result = { passed: true, warnings: [], details: {} };
  
  try {
    // Test implementation
    result.details.testName = 'PASSED';
  } catch (error) {
    result.passed = false;
    result.details.error = error.message;
  }
  
  return result;
}
```

### Documentation

- Update this documentation for new features
- Add JSDoc comments to new functions
- Include examples in test descriptions
- Update CLI help text

## License

This validation system is part of the pg-wire-mock project and is licensed under the MIT License.
