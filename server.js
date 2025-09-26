#!/usr/bin/env node

/**
 * PostgreSQL Wire Protocol Mock Server
 * 
 * A mock PostgreSQL server that implements the PostgreSQL wire protocol for 
 * learning, testing, and development purposes. This server can handle basic
 * SQL queries and responds with mock data while maintaining protocol compliance.
 * 
 * Features:
 * - Full PostgreSQL wire protocol v3.0 support
 * - Authentication flow (without actual password validation)
 * - Simple and extended query protocols
 * - Transaction management (BEGIN/COMMIT/ROLLBACK)
 * - Multiple query types (SELECT, SHOW, INSERT, UPDATE, DELETE, etc.)
 * - Connection state management
 * - Prepared statements and portals
 * - Error handling with proper SQLSTATE codes
 * - Connection statistics and monitoring
 * 
 * Architecture:
 * - src/server/serverManager.js - TCP server and connection management
 * - src/protocol/messageProcessors.js - Protocol message handling
 * - src/protocol/messageBuilders.js - Protocol message construction  
 * - src/handlers/queryHandlers.js - SQL query processing
 * - src/connection/connectionState.js - Connection state management
 * - src/protocol/constants.js - Protocol constants and types
 * - src/protocol/utils.js - Protocol utility functions
 * 
 * Usage:
 *   node server.js [options]
 *   npm start
 * 
 * Environment Variables:
 *   PG_MOCK_PORT - Port to listen on (default: 5432)
 *   PG_MOCK_HOST - Host to bind to (default: localhost) 
 *   PG_MOCK_MAX_CONNECTIONS - Max concurrent connections (default: 100)
 *   PG_MOCK_LOG_LEVEL - Log level: error, warn, info, debug (default: info)
 * 
 * Connect with psql:
 *   psql -h localhost -p 5432 -U postgres
 * 
 * @author The DevOps Daily
 * @license MIT
 */

const { ServerManager } = require('./src/server/serverManager');

/**
 * Parse command line arguments and environment variables
 * @returns {Object} Parsed configuration
 */
function parseConfig() {
  const config = {
    port: parseInt(process.env.PG_MOCK_PORT) || 5432,
    host: process.env.PG_MOCK_HOST || 'localhost',
    maxConnections: parseInt(process.env.PG_MOCK_MAX_CONNECTIONS) || 100,
    connectionTimeout: parseInt(process.env.PG_MOCK_CONNECTION_TIMEOUT) || 300000,
    enableLogging: process.env.PG_MOCK_ENABLE_LOGGING !== 'false',
    logLevel: process.env.PG_MOCK_LOG_LEVEL || 'info'
  };

  // Parse command line arguments
  const args = process.argv.slice(2);
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    switch (arg) {
      case '--port':
      case '-p':
        config.port = parseInt(args[++i]) || config.port;
        break;
      case '--host':
      case '-h':
        config.host = args[++i] || config.host;
        break;
      case '--max-connections':
        config.maxConnections = parseInt(args[++i]) || config.maxConnections;
        break;
      case '--log-level':
        config.logLevel = args[++i] || config.logLevel;
        break;
      case '--quiet':
      case '-q':
        config.enableLogging = false;
        break;
      case '--help':
        printUsage();
        process.exit(0);
        break;
      case '--version':
        console.log('PostgreSQL Wire Protocol Mock Server v1.0.0');
        process.exit(0);
        break;
      default:
        if (arg.startsWith('-')) {
          console.error(`Unknown option: ${arg}`);
          printUsage();
          process.exit(1);
        }
    }
  }

  return config;
}

/**
 * Prints usage information
 */
function printUsage() {
  console.log(`
PostgreSQL Wire Protocol Mock Server

Usage: node server.js [options]

Options:
  -p, --port <port>              Port to listen on (default: 5432)
  -h, --host <host>              Host to bind to (default: localhost)
  --max-connections <num>        Max concurrent connections (default: 100)
  --log-level <level>            Log level: error, warn, info, debug (default: info)
  -q, --quiet                    Disable logging
  --help                         Show this help message
  --version                      Show version information

Environment Variables:
  PG_MOCK_PORT                   Port to listen on
  PG_MOCK_HOST                   Host to bind to
  PG_MOCK_MAX_CONNECTIONS        Max concurrent connections
  PG_MOCK_CONNECTION_TIMEOUT     Connection timeout in ms
  PG_MOCK_LOG_LEVEL              Log level
  PG_MOCK_ENABLE_LOGGING         Enable logging (true/false)

Examples:
  node server.js                              # Start with defaults
  node server.js --port 5433                  # Start on port 5433
  node server.js --host 0.0.0.0 --port 5432  # Listen on all interfaces
  node server.js --quiet                      # Start without logging

Connect with psql:
  psql -h localhost -p 5432 -U postgres

For more information, visit: https://github.com/The-DevOps-Daily/pg-wire-mock
`);
}

/**
 * Main application entry point
 */
async function main() {
  let server = null;

  try {
    // Parse configuration
    const config = parseConfig();
    
    // Create and configure server manager
    server = new ServerManager(config);
    
    // Display startup banner
    if (config.enableLogging) {
      console.log('');
      console.log('╔════════════════════════════════════════════════════════════╗');
      console.log('║              PostgreSQL Wire Protocol Mock Server          ║');
      console.log('║                                                            ║');
      console.log('║  A learning tool for PostgreSQL wire protocol development  ║');
      console.log('║  https://github.com/The-DevOps-Daily/pg-wire-mock          ║');
      console.log('╚════════════════════════════════════════════════════════════╝');
      console.log('');
    }
    
    // Start the server
    await server.start();
    
    // Display connection information
    if (config.enableLogging) {
      console.log('');
      console.log('🚀 Server is ready to accept connections!');
      console.log('');
      console.log('Connect with psql:');
      console.log(`  psql -h ${config.host} -p ${config.port} -U postgres`);
      console.log('');
      console.log('Try these example queries:');
      console.log('  SELECT 1;');
      console.log('  SELECT VERSION();');
      console.log('  SHOW DOCS;');
      console.log('  SELECT NOW();');
      console.log('  BEGIN; SELECT 42; COMMIT;');
      console.log('');
      console.log('Press Ctrl+C to stop the server');
      console.log('');
    }

    // Set up periodic stats logging (every 5 minutes)
    if (config.enableLogging && config.logLevel === 'debug') {
      setInterval(() => {
        const stats = server.getStats();
        console.log(`[DEBUG] Server stats: ${JSON.stringify(stats, null, 2)}`);
      }, 300000);
    }

  } catch (error) {
    console.error('Failed to start server:', error.message);
    
    if (error.code === 'EADDRINUSE') {
      console.error(`Port ${config?.port || 5432} is already in use. Try a different port with --port <port>`);
    } else if (error.code === 'EACCES') {
      console.error(`Permission denied. Try running with sudo or use a port >= 1024`);
    }
    
    process.exit(1);
  }

  // Handle graceful shutdown
  const shutdown = async (signal) => {
    console.log(`\n[INFO] Received ${signal}, shutting down gracefully...`);
    
    if (server) {
      try {
        await server.stop();
        console.log('[INFO] Server stopped successfully');
      } catch (error) {
        console.error('[ERROR] Error during shutdown:', error.message);
      }
    }
    
    process.exit(0);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
  
  // Handle uncaught exceptions
  process.on('uncaughtException', (error) => {
    console.error('[ERROR] Uncaught exception:', error);
    if (server) {
      server.stop().finally(() => process.exit(1));
    } else {
      process.exit(1);
    }
  });

  process.on('unhandledRejection', (reason, promise) => {
    console.error('[ERROR] Unhandled rejection at:', promise, 'reason:', reason);
  });
}

// Start the application
if (require.main === module) {
  main().catch(error => {
    console.error('Application failed to start:', error);
    process.exit(1);
  });
}

module.exports = { main, parseConfig };
