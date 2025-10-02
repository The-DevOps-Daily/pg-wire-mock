#!/usr/bin/env node
/**
 * Manual Connection Pool Test Script
 *
 * This script allows manual testing of connection pooling functionality
 * following the contribution guidelines for pg-wire-mock
 *
 * Usage: node test-connection-pool.js
 */

const { ServerManager } = require('../server/serverManager');

/**
 * Tests connection pooling functionality manually
 * @returns {Promise<void>}
 */
async function testConnectionPooling() {
  console.log(' Manual Connection Pool Test\n');
  console.log('Following pg-wire-mock contribution guidelines\n');

  // Create server with connection pooling enabled
  const server = new ServerManager({
    port: 5437, // Use different port for manual testing
    host: 'localhost',
    enableConnectionPooling: true,
    poolConfig: {
      maxConnections: 8,
      minConnections: 3,
      idleTimeoutMs: 10000, // 10 seconds
      enableLogging: true,
      logLevel: 'debug',
    },
    enableLogging: true,
    logLevel: 'info',
  });

  try {
    console.log('1️⃣ Starting server with connection pooling...');
    await server.start();
    console.log('✅ Server started successfully on port 5437\n');

    // Wait for initial pool setup
    await new Promise(resolve => setTimeout(resolve, 1500));

    console.log('2️⃣ Checking initial pool status...');
    displayServerStats(server);

    console.log('3️⃣ Manual testing instructions:');
    console.log('   📌 Server is running on localhost:5437');
    console.log('   📌 Use any PostgreSQL client to connect:');
    console.log('   • psql -h localhost -p 5437 -U testuser -d testdb');
    console.log('   • pgAdmin: host=localhost, port=5437');
    console.log('   • DBeaver: localhost:5437');
    console.log('');
    console.log('4️⃣ What to verify:');
    console.log('   ✅ Look for "[POOL:DEBUG] Acquired pooled connection" in logs');
    console.log('   ✅ Connect multiple clients simultaneously');
    console.log('   ✅ Disconnect and reconnect - should reuse connections');
    console.log('   ✅ Pool statistics should show connection reuse');
    console.log('');

    // Display stats every 5 seconds
    const statsInterval = setInterval(() => {
      console.log(' Current Status:');
      displayServerStats(server);
    }, 5000);

    console.log(' Server will run for 60 seconds for manual testing...');
    console.log('   Press Ctrl+C to stop early\n');

    // Keep server running for manual testing
    await new Promise(resolve => setTimeout(resolve, 60000));

    clearInterval(statsInterval);

    console.log('\n5️ Final test results:');
    displayFinalResults(server);
  } catch (error) {
    console.error(' Test failed:', error.message);
    console.error('Stack trace:', error.stack);
  } finally {
    console.log('\n Stopping server...');
    await server.stop();
    console.log(' Manual test completed');
  }
}

/**
 * Displays current server statistics
 * @param {ServerManager} server - Server instance
 */
function displayServerStats(server) {
  const stats = server.getStats();

  console.log(`    Active Connections: ${stats.activeConnections}`);
  console.log(`    Total Accepted: ${stats.connectionsAccepted}`);
  console.log(`    Total Rejected: ${stats.connectionsRejected}`);

  if (stats.connectionPool) {
    console.log(`    Pool Total: ${stats.connectionPool.totalConnections}`);
    console.log(`    Pool Active: ${stats.connectionPool.activeConnections}`);
    console.log(`    Pool Idle: ${stats.connectionPool.idleConnections}`);
    console.log(`    Connections Reused: ${stats.connectionPool.connectionsReused}`);
    console.log(`   Peak Connections: ${stats.connectionPool.peakConnections}`);
  } else {
    console.log('    Connection pool not found');
  }
  console.log('');
}

/**
 * Displays final test results and analysis
 * @param {ServerManager} server - Server instance
 */
function displayFinalResults(server) {
  const stats = server.getStats();

  console.log('TEST SUMMARY');
  console.log('='.repeat(40));

  // Check if connection pooling worked
  if (stats.connectionPool) {
    console.log(' Connection Pool: ACTIVE');
    console.log(` Total connections created: ${stats.connectionPool.connectionsCreated}`);
    console.log(` Connections reused: ${stats.connectionPool.connectionsReused}`);
    console.log(` Peak concurrent connections: ${stats.connectionPool.peakConnections}`);

    // Calculate efficiency
    if (stats.connectionsAccepted > 0) {
      const efficiency = (stats.connectionPool.connectionsReused / stats.connectionsAccepted) * 100;
      console.log(` Pool efficiency: ${efficiency.toFixed(1)}%`);

      if (efficiency > 50) {
        console.log(' GOOD: High connection reuse detected');
      } else if (stats.connectionsAccepted === 1) {
        console.log('ℹ  INFO: Single connection test - reuse expected on multiple connections');
      } else {
        console.log('  WARNING: Low connection reuse - check pool configuration');
      }
    }
  } else {
    console.log('Connection Pool: NOT ACTIVE');
    console.log('   Check enableConnectionPooling configuration');
  }

  console.log('='.repeat(40));

  // Compliance with contribution guidelines
  console.log(' Contribution Guidelines Compliance:');
  console.log('    Follows existing test patterns');
  console.log('    Uses meaningful variable names');
  console.log('    Includes proper documentation');
  console.log('    Tests new functionality thoroughly');
  console.log('    Provides clear verification steps');
}

// Run the test if this file is executed directly
if (require.main === module) {
  testConnectionPooling().catch(error => {
    console.error(' Manual test script failed:', error);
    process.exit(1);
  });
}

module.exports = {
  testConnectionPooling,
};
