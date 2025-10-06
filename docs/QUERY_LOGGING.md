# Query Logging and Analysis

This document describes the comprehensive query logging and analysis capabilities in the PostgreSQL Wire Protocol Mock Server.

## Overview

The server provides detailed query logging with:
- **Execution time tracking** with high-precision timing
- **Parameter logging** with sanitization for security
- **Query analytics** for performance monitoring
- **File-based logging** with automatic rotation
- **Configurable logging levels** and options
- **Analysis tools** for pattern detection and performance optimization

## Configuration

### Basic Configuration

Query logging is configured through the `queryLogging` section in the server configuration:

```javascript
const config = {
  queryLogging: {
    enableDetailedLogging: true,      // Enable detailed query logging
    logParameters: true,              // Log query parameters (with sanitization)
    logExecutionTime: true,           // Log query execution times
    maxQueryLength: 500,              // Maximum query length to log (truncate longer queries)
    sanitizeParameters: true,         // Sanitize sensitive data in parameters
    logSlowQueries: true,             // Enable slow query logging
    slowQueryThreshold: 1000,         // Slow query threshold in milliseconds
    enableAnalytics: true,            // Track query analytics
    enableFileLogging: false,         // Enable file-based query logging
    logDirectory: './logs',           // Directory for log files
    maxLogFileSize: 10485760,         // Max log file size in bytes (10MB)
    maxLogFiles: 5,                   // Maximum number of log files to keep
    logRotationPattern: 'YYYY-MM-DD', // Log rotation pattern
  }
};
```

### Environment Variables

You can also configure query logging using environment variables:

```bash
# Detailed logging settings
PG_MOCK_QUERY_DETAILED_LOGGING=true
PG_MOCK_QUERY_LOG_PARAMETERS=true
PG_MOCK_QUERY_LOG_EXECUTION_TIME=true
PG_MOCK_QUERY_MAX_LENGTH=500

# Parameter sanitization
PG_MOCK_QUERY_SANITIZE_PARAMS=true

# Slow query detection
PG_MOCK_QUERY_LOG_SLOW=true
PG_MOCK_QUERY_SLOW_THRESHOLD=1000

# Analytics and file logging
PG_MOCK_QUERY_ANALYTICS=true
PG_MOCK_QUERY_FILE_LOGGING=false
PG_MOCK_QUERY_LOG_DIR=./logs
PG_MOCK_QUERY_MAX_FILE_SIZE=10485760
PG_MOCK_QUERY_MAX_FILES=5
```

## Features

### 1. Execution Time Tracking

Every query is timed with high precision using `process.hrtime.bigint()`:

```javascript
// Example log output
[2025-10-06T10:30:45.123Z] [INFO] [QUERY] Query Completed [session-123] {
  "sessionId": "session-123",
  "queryType": "SELECT",
  "executionTime": "12.456ms",
  "executionTimeMs": 12.456,
  "rowCount": 5,
  "command": "SELECT",
  "connectionId": "conn-1",
  "user": "postgres",
  "database": "testdb"
}
```

### 2. Parameter Logging

Parameters from prepared statements and extended queries are logged with automatic sanitization:

```javascript
// Example parameter logging
[2025-10-06T10:30:45.123Z] [INFO] [QUERY] Query with Parameters {
  "query": "SELECT * FROM users WHERE email = $1 AND age > $2",
  "parameters": ["***@***.***", "25"],  // Email sanitized
  "parameterCount": 2,
  "connectionId": "conn-1",
  "user": "postgres"
}
```

#### Parameter Sanitization

The system automatically sanitizes sensitive data patterns:
- **Credit card numbers**: `1234-5678-9012-3456` → `****-****-****-****`
- **Email addresses**: `user@example.com` → `***@***.***`
- **Social Security Numbers**: `123-45-6789` → `***-**-****`

### 3. Slow Query Detection

Queries that exceed the configured threshold are automatically flagged:

```javascript
[2025-10-06T10:30:45.123Z] [WARN] [QUERY] Slow Query [session-123] {
  "sessionId": "session-123",
  "queryType": "SELECT",
  "executionTime": "2134.567ms",
  "query": "SELECT * FROM large_table WHERE complex_condition...",
  "connectionId": "conn-1"
}
```

### 4. Query Analytics

The system tracks comprehensive query statistics:

```javascript
const analytics = queryLogger.getAnalytics();
console.log(analytics);

// Output:
{
  "totalQueries": 1500,
  "totalExecutionTime": 45678.9,
  "averageExecutionTime": 30.45,
  "slowQueries": 12,
  "errorQueries": 3,
  "queryTypes": {
    "SELECT": 1200,
    "INSERT": 150,
    "UPDATE": 100,
    "DELETE": 50
  },
  "lastReset": "2025-10-06T09:00:00.000Z"
}
```

### 5. File-Based Logging

When enabled, queries are logged to rotating files:

```
logs/
├── query-2025-10-06.log
├── query-2025-10-05.log
└── analytics-2025-10-06.log
```

Each log entry is a JSON object:

```json
{
  "timestamp": "2025-10-06T10:30:45.123Z",
  "level": "INFO",
  "component": "QUERY",
  "sessionId": "session-123",
  "queryType": "SELECT",
  "query": "SELECT * FROM users WHERE id = $1",
  "parameters": ["123"],
  "executionTime": "12.456ms",
  "executionTimeMs": 12.456,
  "rowCount": 1,
  "connectionId": "conn-1",
  "user": "postgres",
  "database": "testdb"
}
```

### 6. Log Rotation

Files are automatically rotated based on:
- **Size**: When files exceed `maxLogFileSize` (default 10MB)
- **Time**: Daily rotation with configurable patterns
- **Retention**: Keep only `maxLogFiles` (default 5) most recent files

## Query Analysis Tools

### Pattern Analysis

```javascript
const { QueryAnalyzer } = require('./src/utils/logger');

// Analyze query patterns from log data
const queryLogs = [/* array of query log entries */];
const analysis = QueryAnalyzer.analyzePatterns(queryLogs);

console.log(analysis);
// Output includes:
// - Query type distribution
// - Execution time statistics
// - Slow query identification
// - Error analysis
// - Unique query count
```

### Performance Reports

```javascript
const report = QueryAnalyzer.generateReport(queryLogs);
console.log(report);

// Generates a comprehensive text report:
/*
=== Query Performance Report ===

Total Queries: 1500
Unique Queries: 234
Error Rate: 0.20%

Query Types:
  SELECT: 1200
  INSERT: 150
  UPDATE: 100
  DELETE: 50

Execution Time Distribution:
  Fast (< 100ms): 1350
  Medium (100ms - 1s): 135
  Slow (1s - 5s): 12
  Very Slow (> 5s): 3

Execution Time Stats:
  Min: 0.123ms
  Max: 8765.432ms
  Average: 30.452ms

Top 5 Slowest Queries:
  1. 8765.432ms - SELECT * FROM orders o JOIN customers c ON o.customer_id = c.id WHERE...
  2. 5432.123ms - UPDATE inventory SET quantity = quantity - 1 WHERE product_id IN...
  ...
*/
```

## Usage Examples

### Basic Setup

```javascript
const { ServerManager } = require('./src/server/serverManager');

const server = new ServerManager({
  port: 5432,
  queryLogging: {
    enableDetailedLogging: true,
    logParameters: true,
    logExecutionTime: true,
    slowQueryThreshold: 500, // 500ms threshold
    enableAnalytics: true,
  }
});

await server.start();
```

### Getting Analytics

```javascript
// Get real-time analytics
const analytics = server.getQueryAnalytics();
console.log('Query Analytics:', analytics);

// Get comprehensive server stats (includes query logging)
const stats = server.getStats();
console.log('Server Stats:', stats);
```

### Custom Analysis

```javascript
const { createFileLogger, QueryAnalyzer } = require('./src/utils/logger');

// Create file logger for custom analysis
const fileLogger = createFileLogger({
  baseDir: './custom-logs',
  maxFileSize: 5 * 1024 * 1024, // 5MB
  maxFiles: 10,
});

const queryFileLogger = fileLogger.createSpecificFileLogger('custom-queries', {
  component: 'ANALYSIS'
});

// Log custom metrics
queryFileLogger.writeRaw({
  type: 'CUSTOM_METRIC',
  metric: 'query_complexity',
  value: calculateQueryComplexity(query),
  query: query,
});
```

### Real-time Monitoring

```javascript
// Reset analytics for fresh monitoring period
queryLogger.resetAnalytics();

// Monitor for a period
setTimeout(() => {
  const analytics = queryLogger.getAnalytics();
  const report = QueryAnalyzer.generateReport([/* your query logs */]);
  
  console.log('Monitoring Period Results:');
  console.log(report);
}, 60000); // 1 minute monitoring
```

## Integration with Monitoring Tools

### Prometheus Metrics

The query analytics can be exposed as Prometheus metrics:

```javascript
// Example Prometheus integration
const prometheus = require('prom-client');
const analytics = queryLogger.getAnalytics();

const queryCounter = new prometheus.Counter({
  name: 'pg_mock_queries_total',
  help: 'Total number of queries executed',
  labelNames: ['query_type', 'status']
});

const queryDuration = new prometheus.Histogram({
  name: 'pg_mock_query_duration_ms',
  help: 'Query execution duration in milliseconds',
  labelNames: ['query_type']
});

// Update metrics from analytics
Object.entries(analytics.queryTypes).forEach(([type, count]) => {
  queryCounter.labels(type, 'success').inc(count);
});
```

### Log Aggregation

Query logs can be consumed by log aggregation systems like ELK Stack:

```json
{
  "@timestamp": "2025-10-06T10:30:45.123Z",
  "service": "pg-wire-mock",
  "level": "INFO",
  "component": "QUERY",
  "query": {
    "sessionId": "session-123",
    "type": "SELECT",
    "executionTimeMs": 12.456,
    "rowCount": 1,
    "slow": false
  },
  "connection": {
    "id": "conn-1",
    "user": "postgres",
    "database": "testdb"
  }
}
```

## Best Practices

1. **Configure appropriate thresholds**: Set `slowQueryThreshold` based on your application's performance requirements
2. **Monitor disk space**: Enable log rotation to prevent disk space issues
3. **Sanitize sensitive data**: Keep `sanitizeParameters` enabled in production
4. **Use analytics for optimization**: Regularly review query patterns and slow queries
5. **Balance logging detail**: Detailed logging provides insights but may impact performance
6. **Archive logs**: Implement log archival for long-term analysis

## Performance Considerations

- **Minimal overhead**: High-precision timing adds <1μs per query
- **Memory usage**: In-memory analytics use ~1KB per 1000 queries
- **File I/O**: File logging is asynchronous and non-blocking
- **Parameter parsing**: Binary parameter parsing may add 1-2ms for complex payloads

## Troubleshooting

### Common Issues

1. **High memory usage**: Reset analytics periodically or disable if not needed
2. **Log rotation not working**: Check directory permissions and disk space
3. **Parameters not logged**: Ensure `logParameters` is enabled and queries use prepared statements
4. **Missing slow queries**: Verify `slowQueryThreshold` configuration

### Debug Mode

Enable debug logging to troubleshoot:

```javascript
const config = {
  logLevel: 'debug',
  queryLogging: {
    enableDetailedLogging: true,
    // ... other options
  }
};
```

This will output additional information about query processing and parameter parsing.