/**
 * Query Caching Example
 * Demonstrates how to use the query result caching feature
 */

const { ServerManager } = require('../src/server/serverManager');
const { Client } = require('pg');

async function main() {
  // Create server with caching enabled
  const server = new ServerManager({
    port: 5433,
    host: 'localhost',
    enableLogging: true,
    logLevel: 'info',
    cache: {
      enabled: true,
      backend: 'memory',
      ttl: 60000, // 1 minute
      maxSize: 100,
      cleanupInterval: 30000,
      keyPrefix: 'pgmock:',
      // Pre-warm cache with common queries
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
      // Bypass caching for time-based functions
      bypassPatterns: ['NOW()', 'CURRENT_TIMESTAMP', /RANDOM/i],
    },
  });

  try {
    // Start the server
    await server.start();
    console.log('\n✓ Server started with caching enabled');
    console.log(`  Backend: ${server.config.cache.backend}`);
    console.log(`  TTL: ${server.config.cache.ttl}ms`);
    console.log(`  Max Size: ${server.config.cache.maxSize}`);

    // Create PostgreSQL client
    const client = new Client({
      host: 'localhost',
      port: 5433,
      user: 'postgres',
      database: 'postgres',
    });

    await client.connect();
    console.log('\n✓ Client connected');

    // Example 1: Cache Miss and Hit
    console.log('\n--- Example 1: Cache Miss and Hit ---');
    console.log('Executing query for the first time (cache miss)...');
    let result = await client.query('SELECT 1 as number');
    console.log('Result:', result.rows);

    let stats = server.getStats().cache;
    console.log('Cache stats:', {
      hits: stats.hits,
      misses: stats.misses,
      hitRate: stats.hitRate,
    });

    console.log('\nExecuting same query again (cache hit)...');
    result = await client.query('SELECT 1 as number');
    console.log('Result:', result.rows);

    stats = server.getStats().cache;
    console.log('Cache stats:', {
      hits: stats.hits,
      misses: stats.misses,
      hitRate: stats.hitRate,
    });

    // Example 2: Cache Warming
    console.log('\n--- Example 2: Cache Warming ---');
    console.log('Executing pre-warmed query (should be cache hit)...');
    result = await client.query('SELECT VERSION()');
    console.log('Result:', result.rows);

    stats = server.getStats().cache;
    console.log('Cache stats:', {
      hits: stats.hits,
      misses: stats.misses,
      hitRate: stats.hitRate,
    });

    // Example 3: Bypass Patterns
    console.log('\n--- Example 3: Bypass Patterns ---');
    console.log('Executing query with NOW() (bypassed)...');
    result = await client.query('SELECT NOW()');
    console.log('Result:', result.rows);

    stats = server.getStats().cache;
    console.log('Cache stats (should not change):', {
      hits: stats.hits,
      misses: stats.misses,
      hitRate: stats.hitRate,
    });

    // Example 4: Write Operations
    console.log('\n--- Example 4: Write Operations (Always Bypassed) ---');
    console.log('Executing INSERT (bypassed)...');
    result = await client.query('INSERT INTO users VALUES (1, "test")');
    console.log('Result:', result.command);

    stats = server.getStats().cache;
    console.log('Cache stats (should not change):', {
      hits: stats.hits,
      misses: stats.misses,
      hitRate: stats.hitRate,
    });

    // Example 5: Multiple Queries
    console.log('\n--- Example 5: Multiple Queries ---');
    const queries = [
      'SELECT 1',
      'SELECT 2',
      'SELECT 1', // Cache hit
      'SELECT 3',
      'SELECT 2', // Cache hit
      'SELECT 1', // Cache hit
    ];

    for (const query of queries) {
      await client.query(query);
    }

    stats = server.getStats().cache;
    console.log('Final cache stats:', {
      hits: stats.hits,
      misses: stats.misses,
      sets: stats.sets,
      totalRequests: stats.totalRequests,
      hitRate: stats.hitRate,
      size: stats.size,
    });

    // Example 6: Cache Performance
    console.log('\n--- Example 6: Cache Performance Test ---');
    const testQuery = 'SELECT * FROM users';
    const iterations = 100;

    console.log(`Executing query ${iterations} times...`);
    const startTime = Date.now();

    for (let i = 0; i < iterations; i++) {
      await client.query(testQuery);
    }

    const duration = Date.now() - startTime;
    console.log(`Completed in ${duration}ms (${(duration / iterations).toFixed(2)}ms per query)`);

    stats = server.getStats().cache;
    console.log('Cache performance:', {
      hitRate: stats.hitRate,
      totalRequests: stats.totalRequests,
      avgTimePerRequest: `${(duration / iterations).toFixed(2)}ms`,
    });

    // Cleanup
    await client.end();
    console.log('\n✓ Client disconnected');

    await server.stop();
    console.log('✓ Server stopped');

    console.log('\n=== Cache Example Completed Successfully ===');
  } catch (error) {
    console.error('Error:', error);
    if (server.isRunning) {
      await server.stop();
    }
    process.exit(1);
  }
}

// Run the example
if (require.main === module) {
  main().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

module.exports = { main };
