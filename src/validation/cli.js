#!/usr/bin/env node

/**
 * PostgreSQL Wire Protocol Validation CLI
 * Command-line interface for running validation tests
 */

const { ProtocolValidationSystem } = require('./index');
const fs = require('fs').promises;
const path = require('path');

/**
 * CLI class for protocol validation
 */
class ValidationCLI {
  constructor() {
    this.options = {
      enableFuzzing: true,
      enableRealPostgreSQLComparison: false,
      realPostgreSQLConfig: null,
      reportFormat: 'json',
      outputDir: './validation-reports',
      verbose: false,
      quiet: false
    };
  }

  /**
   * Parse command line arguments
   * @param {Array} args - Command line arguments
   * @returns {Object} Parsed options
   */
  parseArguments(args) {
    const options = { ...this.options };
    
    for (let i = 0; i < args.length; i++) {
      const arg = args[i];
      
      switch (arg) {
        case '--help':
        case '-h':
          this.showHelp();
          process.exit(0);
          break;
          
        case '--version':
        case '-v':
          this.showVersion();
          process.exit(0);
          break;
          
        case '--format':
        case '-f':
          options.reportFormat = args[++i];
          break;
          
        case '--output':
        case '-o':
          options.outputDir = args[++i];
          break;
          
        case '--no-fuzzing':
          options.enableFuzzing = false;
          break;
          
        case '--real-postgresql':
          options.enableRealPostgreSQLComparison = true;
          break;
          
        case '--postgresql-config':
          const configPath = args[++i];
          try {
            const configData = require(path.resolve(configPath));
            options.realPostgreSQLConfig = configData;
          } catch (error) {
            console.error(`Error loading PostgreSQL config: ${error.message}`);
            process.exit(1);
          }
          break;
          
        case '--verbose':
          options.verbose = true;
          break;
          
        case '--quiet':
          options.quiet = true;
          break;
          
        case '--test':
          options.testType = args[++i];
          break;
          
        default:
          if (arg.startsWith('--')) {
            console.error(`Unknown option: ${arg}`);
            this.showHelp();
            process.exit(1);
          }
          break;
      }
    }
    
    return options;
  }

  /**
   * Show help message
   */
  showHelp() {
    console.log(`
PostgreSQL Wire Protocol Validation Tool

USAGE:
  node cli.js [OPTIONS]

OPTIONS:
  -h, --help                    Show this help message
  -v, --version                 Show version information
  -f, --format FORMAT          Report format (json, html, text) [default: json]
  -o, --output DIR             Output directory [default: ./validation-reports]
  --no-fuzzing                 Disable protocol fuzzing
  --real-postgresql            Enable real PostgreSQL comparison
  --postgresql-config FILE     PostgreSQL configuration file
  --verbose                    Enable verbose output
  --quiet                      Suppress output except errors
  --test TYPE                  Run specific test type

TEST TYPES:
  messageFormat                Message format validation
  compliance                   Protocol compliance tests
  edgeCases                    Edge case testing
  errorConditions              Error condition testing
  fuzzing                      Protocol fuzzing
  realPostgreSQLComparison     Real PostgreSQL comparison
  performance                  Performance benchmarking

EXAMPLES:
  # Run all validation tests
  node cli.js

  # Run with HTML report
  node cli.js --format html

  # Run only compliance tests
  node cli.js --test compliance

  # Run with real PostgreSQL comparison
  node cli.js --real-postgresql --postgresql-config ./pg-config.json

  # Run fuzzing tests only
  node cli.js --test fuzzing --verbose
`);
  }

  /**
   * Show version information
   */
  showVersion() {
    const packageJson = require('../../package.json');
    console.log(`PostgreSQL Wire Protocol Validation Tool v${packageJson.version}`);
  }

  /**
   * Run validation
   * @param {Object} options - Validation options
   * @returns {Promise<void>}
   */
  async run(options) {
    try {
      if (!options.quiet) {
        console.log('PostgreSQL Wire Protocol Validation Tool');
        console.log('==========================================');
        console.log('');
      }

      const validationSystem = new ProtocolValidationSystem(options);

      if (options.testType) {
        // Run specific test type
        if (!options.quiet) {
          console.log(`Running ${options.testType} tests...`);
        }
        
        const results = await validationSystem.runSpecificTest(options.testType, options);
        // Wrap single test results in the expected format
        const wrappedResults = {
          timestamp: new Date().toISOString(),
          version: '1.0.0',
          summary: {
            total: results.total || 0,
            passed: results.passed || 0,
            failed: results.failed || 0,
            warnings: results.warnings || 0,
            successRate: results.total > 0 ? Math.round((results.passed / results.total) * 100) : 0
          },
          tests: {
            [options.testType]: results
          }
        };
        
        // Generate report for single test if format is specified
        if (options.reportFormat && options.reportFormat !== 'console') {
          const ComplianceReporter = require('./complianceReporter');
          const reporter = new ComplianceReporter(options);
          const report = await reporter.generateReport(wrappedResults);
          wrappedResults.report = report;
        }
        
        await this.displayResults(wrappedResults, options);
      } else {
        // Run full validation suite
        if (!options.quiet) {
          console.log('Running full validation suite...');
        }
        
        const results = await validationSystem.runValidationSuite(options);
        await this.displayResults(results, options);
      }

    } catch (error) {
      console.error(`Validation failed: ${error.message}`);
      if (options.verbose) {
        console.error(error.stack);
      }
      process.exit(1);
    }
  }

  /**
   * Display validation results
   * @param {Object} results - Validation results
   * @param {Object} options - Display options
   * @returns {Promise<void>}
   */
  async displayResults(results, options) {
    if (options.quiet) {
      return;
    }

    console.log('');
    console.log('Validation Results');
    console.log('==================');
    console.log('');

    // Display summary
    if (results.summary) {
      console.log('Summary:');
      console.log(`  Total Tests: ${results.summary.total}`);
      console.log(`  Passed: ${results.summary.passed}`);
      console.log(`  Failed: ${results.summary.failed}`);
      console.log(`  Warnings: ${results.summary.warnings}`);
      console.log(`  Success Rate: ${results.summary.successRate}%`);
      console.log('');
    }

    // Display test results by category
    if (results.tests) {
      for (const [category, categoryResults] of Object.entries(results.tests)) {
        console.log(`${category.charAt(0).toUpperCase() + category.slice(1)} Tests:`);
        console.log(`  Total: ${categoryResults.total}`);
        console.log(`  Passed: ${categoryResults.passed}`);
        console.log(`  Failed: ${categoryResults.failed}`);
        console.log(`  Warnings: ${categoryResults.warnings}`);
        console.log('');
      }
    }

    // Display critical issues
    if (results.summary && results.summary.criticalIssues) {
      const criticalIssues = results.summary.criticalIssues;
      if (criticalIssues.length > 0) {
        console.log('Critical Issues:');
        for (const issue of criticalIssues) {
          console.log(`  • ${issue.category}/${issue.test}: ${issue.issue}`);
        }
        console.log('');
      }
    }

    // Display recommendations
    if (results.summary && results.summary.recommendations) {
      const recommendations = results.summary.recommendations;
      if (recommendations.length > 0) {
        console.log('Recommendations:');
        for (const rec of recommendations) {
          console.log(`  • [${rec.type.toUpperCase()}] ${rec.message}`);
        }
        console.log('');
      }
    }

    // Display report information
    if (results.report && results.report.path) {
      console.log(`Report saved to: ${results.report.path}`);
      console.log('');
    }

    // Display verbose details
    if (options.verbose && results.tests) {
      console.log('Detailed Results:');
      console.log('=================');
      
      for (const [category, categoryResults] of Object.entries(results.tests)) {
        console.log(`\n${category.toUpperCase()}:`);
        
        if (categoryResults.details) {
          for (const [testName, testResult] of Object.entries(categoryResults.details)) {
            const status = testResult.passed ? 'PASS' : 'FAIL';
            const statusColor = testResult.passed ? '\x1b[32m' : '\x1b[31m';
            const resetColor = '\x1b[0m';
            
            console.log(`  ${statusColor}${status}${resetColor} ${testName}`);
            
            if (testResult.error) {
              console.log(`    Error: ${testResult.error}`);
            }
            
            if (testResult.warnings && testResult.warnings.length > 0) {
              console.log(`    Warnings: ${testResult.warnings.length}`);
              for (const warning of testResult.warnings) {
                console.log(`      • ${warning}`);
              }
            }
          }
        }
      }
    }
  }

  /**
   * Main entry point
   * @param {Array} args - Command line arguments
   * @returns {Promise<void>}
   */
  async main(args) {
    const options = this.parseArguments(args);
    await this.run(options);
  }
}

// Run CLI if this file is executed directly
if (require.main === module) {
  const cli = new ValidationCLI();
  cli.main(process.argv.slice(2)).catch(error => {
    console.error('Fatal error:', error.message);
    process.exit(1);
  });
}

module.exports = ValidationCLI;


