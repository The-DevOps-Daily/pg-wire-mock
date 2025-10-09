#!/usr/bin/env node

/**
 * EXPLAIN Query Functionality Demo
 *
 * This example demonstrates the EXPLAIN query functionality of the PostgreSQL
 * Wire Protocol Mock Server, showing how to analyze query execution plans
 * in different formats and with various options.
 *
 * Usage:
 *   node examples/explain-demo.js
 *
 * Prerequisites:
 *   - Mock server running on localhost:5432
 *   - pg module installed (npm install pg)
 */

const { Client } = require('pg');

// ANSI color codes for prettier output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
};

function colorize(text, color) {
  return `${color}${text}${colors.reset}`;
}

function logSection(title) {
  console.log('\n' + colorize('='.repeat(60), colors.cyan));
  console.log(colorize(title, colors.bright + colors.cyan));
  console.log(colorize('='.repeat(60), colors.cyan));
}

function logSubsection(title) {
  console.log('\n' + colorize(title, colors.yellow));
  console.log(colorize('-'.repeat(40), colors.yellow));
}

async function runQuery(client, query, description) {
  console.log(colorize(`\n➤ ${description}`, colors.green));
  console.log(colorize(`Query: ${query}`, colors.blue));
  
  try {
    const result = await client.query(query);
    console.log('\nResult:');
    
    if (result.rows && result.rows.length > 0) {
      // For EXPLAIN queries, the result is typically in a single column
      if (result.rows[0]['QUERY PLAN']) {
        result.rows.forEach(row => {
          console.log(row['QUERY PLAN']);
        });
      } else {
        // Handle other query types
        console.log(result.rows);
      }
    } else {
      console.log('No rows returned');
    }
    
    console.log(colorize(`\nRows: ${result.rowCount || 0}`, colors.magenta));
    
  } catch (error) {
    console.error(colorize(`Error: ${error.message}`, colors.red));
  }
}

async function demonstrateExplainBasics(client) {
  logSection('EXPLAIN Basics');
  
  await runQuery(
    client,
    'EXPLAIN SELECT 1',
    'Simple EXPLAIN - shows basic execution plan'
  );
  
  await runQuery(
    client,
    'EXPLAIN SELECT * FROM users',
    'Table scan - shows sequential scan operation'
  );
  
  await runQuery(
    client,
    'EXPLAIN SELECT * FROM users WHERE id = 1',
    'Filtered query - shows scan with filter condition'
  );
}

async function demonstrateExplainAnalyze(client) {
  logSection('EXPLAIN ANALYZE');
  
  await runQuery(
    client,
    'EXPLAIN ANALYZE SELECT * FROM users',
    'EXPLAIN ANALYZE - includes actual execution statistics'
  );
  
  await runQuery(
    client,
    'EXPLAIN ANALYZE SELECT * FROM users WHERE name = \'John\' ORDER BY created_at',
    'Complex query with ANALYZE - shows filtering and sorting'
  );
  
  await runQuery(
    client,
    'EXPLAIN ANALYZE INSERT INTO users (name, email) VALUES (\'test\', \'test@example.com\')',
    'DML operation with ANALYZE - shows insert execution plan'
  );
}

async function demonstrateOutputFormats(client) {
  logSection('Output Formats');
  
  logSubsection('JSON Format');
  await runQuery(
    client,
    'EXPLAIN (FORMAT JSON) SELECT * FROM users JOIN posts ON users.id = posts.user_id',
    'JSON format - structured plan data'
  );
  
  logSubsection('XML Format');
  await runQuery(
    client,
    'EXPLAIN (FORMAT XML) SELECT * FROM users ORDER BY name',
    'XML format - hierarchical plan structure'
  );
  
  logSubsection('YAML Format');
  await runQuery(
    client,
    'EXPLAIN (FORMAT YAML) SELECT * FROM posts WHERE user_id IN (1, 2, 3)',
    'YAML format - human-readable structured output'
  );
}

async function demonstrateComplexQueries(client) {
  logSection('Complex Query Plans');
  
  await runQuery(
    client,
    'EXPLAIN SELECT u.name, COUNT(p.id) FROM users u ' +
    'LEFT JOIN posts p ON u.id = p.user_id GROUP BY u.id, u.name',
    'Join with aggregation - shows hash join and grouping'
  );
  
  await runQuery(
    client,
    'EXPLAIN (FORMAT JSON, ANALYZE) SELECT * FROM users ' +
    'WHERE name LIKE \'John%\' ORDER BY created_at DESC LIMIT 10',
    'Complex SELECT with multiple operations in JSON format'
  );
  
  await runQuery(
    client,
    'EXPLAIN ANALYZE UPDATE users SET last_login = NOW() WHERE active = true',
    'Bulk update operation - shows update with scan'
  );
}

async function demonstrateOptions(client) {
  logSection('EXPLAIN Options');
  
  await runQuery(
    client,
    'EXPLAIN (ANALYZE true, COSTS true) SELECT * FROM users',
    'Explicit options - ANALYZE and COSTS enabled'
  );
  
  await runQuery(
    client,
    'EXPLAIN (FORMAT JSON, ANALYZE false, VERBOSE true) SELECT COUNT(*) FROM posts',
    'Multiple options - JSON format without ANALYZE but with VERBOSE'
  );
}

async function demonstrateErrorHandling(client) {
  logSection('Error Handling');
  
  await runQuery(
    client,
    'EXPLAIN (FORMAT INVALID) SELECT 1',
    'Invalid format - should return error'
  );
  
  await runQuery(
    client,
    'EXPLAIN',
    'Missing query - should return error'
  );
}

async function demonstrateToolingIntegration(client) {
  logSection('Integration with Query Analysis Tools');
  
  console.log(colorize('\n➤ Analyzing query plans programmatically', colors.green));
  
  try {
    // Get JSON format plan for analysis
    const result = await client.query(
      'EXPLAIN (FORMAT JSON, ANALYZE true) SELECT u.*, p.title ' +
      'FROM users u JOIN posts p ON u.id = p.user_id ' +
      'WHERE u.active = true ORDER BY u.created_at DESC'
    );
    
    if (result.rows && result.rows.length > 0) {
      const planJson = result.rows.map(row => row['QUERY PLAN']).join('\n');
      const plan = JSON.parse(planJson);
      
      console.log(colorize('\nParsed Plan Analysis:', colors.blue));
      console.log(`- Query Plan Type: ${plan[0].Plan['Node Type']}`);
      console.log(`- Total Cost: ${plan[0].Plan['Total Cost']}`);
      console.log(`- Estimated Rows: ${plan[0].Plan['Plan Rows']}`);
      
      if (plan[0]['Planning Time']) {
        console.log(`- Planning Time: ${plan[0]['Planning Time']} ms`);
      }
      
      if (plan[0]['Execution Time']) {
        console.log(`- Execution Time: ${plan[0]['Execution Time']} ms`);
      }
      
      // Analyze plan nodes - move function to top level
      const analyzePlanNode = (node, depth = 0) => {
        const indent = '  '.repeat(depth);
        console.log(`${indent}- Node: ${node['Node Type']}`);
        
        if (node['Relation Name']) {
          console.log(`${indent}  Table: ${node['Relation Name']}`);
        }
        
        if (node['Filter']) {
          console.log(`${indent}  Filter: ${node['Filter']}`);
        }
        
        if (node['Join Type']) {
          console.log(`${indent}  Join: ${node['Join Type']}`);
        }
        
        if (node['Plans']) {
          node['Plans'].forEach(childNode => analyzePlanNode(childNode, depth + 1));
        }
      };
      
      console.log(colorize('\nPlan Structure:', colors.magenta));
      analyzePlanNode(plan[0].Plan);
    }
    
  } catch (error) {
    console.error(colorize(`Analysis Error: ${error.message}`, colors.red));
  }
}

async function main() {
  console.log(colorize('PostgreSQL Wire Protocol Mock Server - EXPLAIN Demo', colors.bright + colors.green));
  console.log(colorize('This demo showcases the EXPLAIN query functionality\n', colors.blue));
  
  const client = new Client({
    host: 'localhost',
    port: 5432,
    user: 'postgres',
    database: 'postgres',
  });
  
  try {
    console.log(colorize('Connecting to mock server...', colors.yellow));
    await client.connect();
    console.log(colorize('Connected successfully!', colors.green));
    
    // Run all demonstrations
    await demonstrateExplainBasics(client);
    await demonstrateExplainAnalyze(client);
    await demonstrateOutputFormats(client);
    await demonstrateComplexQueries(client);
    await demonstrateOptions(client);
    await demonstrateToolingIntegration(client);
    await demonstrateErrorHandling(client);
    
    logSection('Demo Complete');
    const successMsg = 'All EXPLAIN functionality demonstrated successfully!';
    console.log(colorize(successMsg, colors.bright + colors.green));
    console.log(colorize('\nKey takeaways:', colors.yellow));
    console.log('• EXPLAIN provides mock execution plans for query analysis');
    console.log('• EXPLAIN ANALYZE includes simulated timing information');
    console.log('• Multiple output formats support different tooling needs');
    console.log('• Plans are realistic but deterministic for testing');
    console.log('• Integrates seamlessly with PostgreSQL client libraries');
    
    console.log(colorize('\nFor more information, see:', colors.blue));
    console.log('• docs/EXPLAIN_SUPPORT.md - Comprehensive documentation');
    console.log('• __tests__/handlers/explain.test.js - Test examples');
    console.log('• src/handlers/queryHandlers.js - Implementation details');
    
  } catch (error) {
    console.error(colorize(`Connection Error: ${error.message}`, colors.red));
    console.error(colorize('Make sure the mock server is running on localhost:5432', colors.yellow));
    process.exit(1);
  } finally {
    await client.end();
    console.log(colorize('\nDisconnected from server.', colors.yellow));
  }
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log(colorize('\n\nDemo interrupted by user. Exiting...', colors.yellow));
  process.exit(0);
});

process.on('uncaughtException', (error) => {
  console.error(colorize(`Uncaught Exception: ${error.message}`, colors.red));
  process.exit(1);
});

// Run the demo
if (require.main === module) {
  main().catch(error => {
    console.error(colorize(`Fatal Error: ${error.message}`, colors.red));
    process.exit(1);
  });
}

module.exports = {
  demonstrateExplainBasics,
  demonstrateExplainAnalyze,
  demonstrateOutputFormats,
  demonstrateComplexQueries,
  demonstrateOptions,
  demonstrateErrorHandling,
  demonstrateToolingIntegration,
};
