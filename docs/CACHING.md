# Query Result Caching

The pg-wire-mock server includes a configurable caching layer to improve performance for repeated queries. This feature is particularly useful for load testing, performance optimization, and reducing computation overhead.

## Features

- **Multiple Backend Support**: In-memory and Redis backends
- **TTL-based Invalidation**: Automatic cache expiration
- **Cache Statistics**: Hit/miss tracking and monitoring
- **Cache Warming**: Pre-populate cache on startup
- **Bypass Patterns**: Selective caching with custom patterns
- **Automatic Write Operation Bypass**: Write operations never cached

## Configuration

### Environment Variables

Configure caching using environment variables:

```bash
# Enable caching
PG_MOCK_CACHE_ENABLED=true

# Backend type: 'memory' or 'redis'
PG_MOCK_CACHE_BACKEND=memory

# Cache TTL in milliseconds (default: 300000 = 5 minutes)
PG_MOCK_CACHE_TTL=300000

# Maximum cache entries for memory backend (default: 1000)
PG_MOCK_CACHE_MAX_SIZE=1000

# Cleanup interval in milliseconds (default: 60000 = 1 minute)
PG_MOCK_CACHE_CLEANUP_INTERVAL=60000

# Cache key prefix (default: 'pgmock:')
PG_MOCK_CACHE_KEY_PREFIX=pgmock:

# Redis connection URL (for Redis backend)
PG_MOCK_CACHE_REDIS_URL=redis://localhost:6379

# Redis connection timeout in milliseconds (default: 5000)
PG_MOCK_CACHE_REDIS_TIMEOUT=5000
```

### Programmatic Configuration

```javascript
const { ServerManager } = require('./src/server/serverManager');

const server = new ServerManager({
  port: 5432,
  host: 'localhost',
  cache: {
    enabled: true,
    backend: 'memory', // or 'redis'
    ttl: 300000, // 5 minutes
    maxSize: 1000,
    cleanupInterval: 60000,
    keyPrefix: 'pgmock:',
    warmupQueries: [
      {
        query: 'SELECT VERSION()',
        parameters: [],
        result: {
          columns: [{ name: 'version', dataTypeOID: 25, dataTypeSize: -1 }],
          rows: [['PostgreSQL Wire Protocol Mock Server 1.0']],
          command: 'SELECT',
          rowCount: 1,
        },
      },
    ],
    bypassPatterns: [
      'NOW()', // Bypass queries containing NOW()
      /RANDOM/i, // Bypass queries matching regex
    ],
    redis: {
      url: 'redis://localhost:6379',
      connectTimeout: 5000,
    },
  },
});

await server.start();
```

## Backends

### Memory Backend

The memory backend stores cached results in-process memory. It's fast and requires no external dependencies.

**Pros:**
- No external dependencies
- Very fast access
- Simple setup

**Cons:**
- Limited by available memory
- Not shared across multiple server instances
- Lost on server restart

**Configuration:**
```javascript
cache: {
  enabled: true,
  backend: 'memory',
  maxSize: 1000, // Maximum number of cached entries
  cleanupInterval: 60000, // Cleanup expired entries every minute
}
```

### Redis Backend

The Redis backend stores cached results in Redis, allowing cache sharing across multiple server instances.

**Pros:**
- Shared cache across multiple instances
- Persistent across restarts (if Redis is configured for persistence)
- Scalable

**Cons:**
- Requires Redis server
- Network latency
- Additional dependency

**Configuration:**
```javascript
cache: {
  enabled: true,
  backend: 'redis',
  redis: {
    url: 'redis://localhost:6379',
    connectTimeout: 5000,
  },
}
```

**Note:** Redis backend requires the `redis` npm package to be installed:
```bash
npm install redis
```

If Redis is not available or fails to connect, the cache manager automatically falls back to the memory backend.

## Cache Behavior

### Cached Operations

The following query types are cached by default:
- `SELECT` queries
- `SHOW` queries
- Read-only queries

### Bypassed Operations

The following operations are **never cached**:
- `INSERT`, `UPDATE`, `DELETE` (write operations)
- `CREATE`, `DROP`, `ALTER` (DDL operations)
- `BEGIN`, `COMMIT`, `ROLLBACK` (transaction control)
- `LISTEN`, `UNLISTEN`, `NOTIFY` (notifications)
- `COPY` operations
- Queries matching custom bypass patterns

### Cache Key Generation

Cache keys are generated from:
1. SQL query text (normalized)
2. Query parameters

This ensures that:
- Same query with same parameters = cache hit
- Same query with different parameters = cache miss
- Different queries = different cache entries

Example:
```javascript
// These will use the same cache entry
await executeQuery('SELECT * FROM users WHERE id = 1');
await executeQuery('SELECT * FROM users WHERE id = 1');

// These will use different cache entries
await executeQuery('SELECT * FROM users WHERE id = 1');
await executeQuery('SELECT * FROM users WHERE id = 2');
```

## Cache Warming

Pre-populate the cache on server startup with frequently-used queries:

```javascript
cache: {
  enabled: true,
  warmupQueries: [
    {
      query: 'SELECT VERSION()',
      parameters: [],
      result: {
        columns: [{ name: 'version', dataTypeOID: 25, dataTypeSize: -1 }],
        rows: [['PostgreSQL Wire Protocol Mock Server 1.0']],
        command: 'SELECT',
        rowCount: 1,
      },
    },
    {
      query: 'SELECT * FROM users WHERE id = $1',
      parameters: [1],
      result: {
        columns: [
          { name: 'id', dataTypeOID: 23, dataTypeSize: 4 },
          { name: 'name', dataTypeOID: 25, dataTypeSize: -1 },
        ],
        rows: [[1, 'John Doe']],
        command: 'SELECT',
        rowCount: 1,
      },
    },
  ],
}
```

## Cache Statistics

Monitor cache performance using the server statistics endpoint:

```javascript
const stats = server.getStats();
console.log(stats.cache);
```

Output:
```json
{
  "hits": 150,
  "misses": 50,
  "sets": 50,
  "invalidations": 5,
  "errors": 0,
  "totalRequests": 200,
  "hitRate": "75.00%",
  "uptimeMs": 3600000,
  "enabled": true,
  "backend": "memory",
  "size": 45
}
```

### Metrics Explained

- **hits**: Number of cache hits (queries served from cache)
- **misses**: Number of cache misses (queries not in cache)
- **sets**: Number of entries added to cache
- **invalidations**: Number of cache invalidations
- **errors**: Number of cache errors
- **totalRequests**: Total cache requests (hits + misses)
- **hitRate**: Percentage of requests served from cache
- **uptimeMs**: Cache uptime in milliseconds
- **enabled**: Whether caching is enabled
- **backend**: Active backend (memory or redis)
- **size**: Current number of cached entries

## Custom Bypass Patterns

Exclude specific queries from caching using custom patterns:

```javascript
cache: {
  enabled: true,
  bypassPatterns: [
    'NOW()',           // String match (case-insensitive)
    'CURRENT_TIMESTAMP',
    /RANDOM/i,         // Regular expression
    /uuid_generate/i,
  ],
}
```

Queries matching any bypass pattern will not be cached.

## Use Cases

### Load Testing

Enable caching to reduce computation overhead during load tests:

```javascript
cache: {
  enabled: true,
  backend: 'memory',
  ttl: 600000, // 10 minutes
  maxSize: 5000,
}
```

### Performance Optimization

Cache frequently-executed queries to improve response times:

```javascript
cache: {
  enabled: true,
  backend: 'redis', // Share cache across instances
  ttl: 300000, // 5 minutes
  warmupQueries: [
    // Pre-cache common queries
  ],
}
```

### Reducing Computation Overhead

Cache complex queries that don't change frequently:

```javascript
cache: {
  enabled: true,
  ttl: 3600000, // 1 hour
  bypassPatterns: [
    'NOW()',
    'RANDOM()',
  ],
}
```

## Testing with Cache

### Bypass Cache for Testing

Disable caching during tests:

```bash
PG_MOCK_CACHE_ENABLED=false npm test
```

Or programmatically:

```javascript
const server = new ServerManager({
  cache: {
    enabled: false,
  },
});
```

### Test Cache Behavior

Enable caching in tests to verify cache behavior:

```javascript
const server = new ServerManager({
  cache: {
    enabled: true,
    backend: 'memory',
    ttl: 1000,
  },
});

await server.start();

// First query - cache miss
await executeQuery('SELECT 1');

// Second query - cache hit
await executeQuery('SELECT 1');

const stats = server.getStats();
expect(stats.cache.hits).toBe(1);
expect(stats.cache.misses).toBe(1);
```

## Best Practices

1. **Choose the Right Backend**
   - Use memory backend for single-instance deployments
   - Use Redis backend for multi-instance deployments

2. **Set Appropriate TTL**
   - Short TTL (1-5 minutes) for frequently-changing data
   - Long TTL (30-60 minutes) for static data
   - Consider your use case and data freshness requirements

3. **Monitor Cache Performance**
   - Track hit rate to ensure cache is effective
   - Adjust maxSize and TTL based on usage patterns
   - Monitor memory usage for memory backend

4. **Use Cache Warming**
   - Pre-populate cache with common queries
   - Reduces initial latency
   - Improves user experience

5. **Configure Bypass Patterns**
   - Exclude time-based functions (NOW(), CURRENT_TIMESTAMP)
   - Exclude random functions (RANDOM(), UUID)
   - Exclude user-specific queries if needed

6. **Test Without Cache**
   - Disable cache during unit tests
   - Verify application behavior without cache
   - Test cache behavior separately

## Troubleshooting

### Cache Not Working

1. Verify cache is enabled:
   ```javascript
   console.log(server.cacheManager.config.enabled);
   ```

2. Check cache statistics:
   ```javascript
   console.log(server.getStats().cache);
   ```

3. Verify query is not bypassed:
   ```javascript
   console.log(server.cacheManager.shouldBypassCache('YOUR_QUERY'));
   ```

### Low Hit Rate

1. Check if TTL is too short
2. Verify queries are consistent (same text and parameters)
3. Check if bypass patterns are too broad
4. Increase maxSize if cache is full

### Redis Connection Issues

1. Verify Redis is running:
   ```bash
   redis-cli ping
   ```

2. Check Redis URL configuration
3. Verify network connectivity
4. Check Redis logs for errors

The cache manager automatically falls back to memory backend if Redis connection fails.

## API Reference

### CacheManager

```javascript
const { CacheManager } = require('./src/cache/cacheManager');

const cache = new CacheManager(config);
await cache.initialize();

// Get cached result
const result = await cache.get(query, parameters);

// Set cached result
await cache.set(query, parameters, result, ttl);

// Invalidate cached result
await cache.invalidate(query, parameters);

// Clear all cache
await cache.clear();

// Get statistics
const stats = cache.getStats();

// Reset statistics
cache.resetStats();

// Close cache
await cache.close();
```

## Examples

See the [examples](../examples/) directory for complete examples:
- `examples/cache-memory.js` - Memory backend example
- `examples/cache-redis.js` - Redis backend example
- `examples/cache-warmup.js` - Cache warming example
- `examples/cache-monitoring.js` - Cache monitoring example
