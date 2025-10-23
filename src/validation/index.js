/**
 * PostgreSQL Wire Protocol Validation System
 * Comprehensive tool for validating protocol compliance and preventing regressions
 */

const MessageValidator = require('./messageValidator');
const ProtocolTester = require('./protocolTester');
const ComplianceReporter = require('./complianceReporter');
const ProtocolFuzzer = require('./protocolFuzzer');
const PerformanceBenchmark = require('./performanceBenchmark');

// Optional PostgreSQL comparison module
let RealPostgreSQLComparator = null;
try {
  RealPostgreSQLComparator = require('./realPostgreSQLComparator');
} catch (error) {
  // PostgreSQL comparison module not available
  console.warn(
    'PostgreSQL comparison module not available. Install "pg" package to enable real PostgreSQL comparison.'
  );
}

/**
 * Main validation system class
 * Orchestrates all validation components
 */
class ProtocolValidationSystem {
  constructor(options = {}) {
    this.options = {
      enableFuzzing: true,
      enableRealPostgreSQLComparison: false,
      realPostgreSQLConfig: null,
      reportFormat: 'json', // json, html, text
      outputDir: './validation-reports',
      ...options,
    };

    this.validator = new MessageValidator();
    this.tester = new ProtocolTester();
    this.reporter = new ComplianceReporter(this.options);
    this.fuzzer = new ProtocolFuzzer();
    this.comparator = RealPostgreSQLComparator
      ? new RealPostgreSQLComparator(this.options.realPostgreSQLConfig)
      : null;
    this.benchmark = new PerformanceBenchmark(this.options);
  }

  /**
   * Run comprehensive validation suite
   * @param {Object} config - Validation configuration
   * @returns {Promise<Object>} Validation results
   */
  async runValidationSuite(_config = {}) {
    const results = {
      timestamp: new Date().toISOString(),
      version: '1.0.0',
      tests: {},
      summary: {
        total: 0,
        passed: 0,
        failed: 0,
        warnings: 0,
        successRate: 0,
      },
    };

    try {
      // 1. Message Format Validation
      console.log('Running message format validation...');
      results.tests.messageFormat = await this.validator.validateAllMessageFormats();
      this.updateSummary(results, 'messageFormat');

      // 2. Protocol Compliance Testing
      console.log('Running protocol compliance tests...');
      results.tests.compliance = await this.tester.runComplianceTests();
      this.updateSummary(results, 'compliance');

      // 3. Edge Case Testing
      console.log('Running edge case tests...');
      results.tests.edgeCases = await this.tester.runEdgeCaseTests();
      this.updateSummary(results, 'edgeCases');

      // 4. Error Condition Testing
      console.log('Running error condition tests...');
      results.tests.errorConditions = await this.tester.runErrorConditionTests();
      this.updateSummary(results, 'errorConditions');

      // 5. Protocol Fuzzing (if enabled)
      if (this.options.enableFuzzing) {
        console.log('Running protocol fuzzing...');
        results.tests.fuzzing = await this.fuzzer.runFuzzingTests();
        this.updateSummary(results, 'fuzzing');
      }

      // 6. Real PostgreSQL Comparison (if enabled and available)
      if (
        this.options.enableRealPostgreSQLComparison &&
        this.options.realPostgreSQLConfig &&
        this.comparator
      ) {
        console.log('Running real PostgreSQL comparison...');
        results.tests.realPostgreSQLComparison = await this.comparator.runComparisonTests();
        this.updateSummary(results, 'realPostgreSQLComparison');
      } else if (this.options.enableRealPostgreSQLComparison && !this.comparator) {
        console.log('Real PostgreSQL comparison skipped - pg package not available');
        results.tests.realPostgreSQLComparison = {
          total: 0,
          passed: 0,
          failed: 0,
          warnings: 1,
          details: {
            skipped: {
              passed: false,
              error:
                'PostgreSQL comparison module not available. Install "pg" package to enable real PostgreSQL comparison.',
              warnings: [],
            },
          },
        };
        this.updateSummary(results, 'realPostgreSQLComparison');
      }

      // 7. Generate compliance report
      console.log('Generating compliance report...');
      const report = await this.reporter.generateReport(results);
      results.report = report;

      return results;
    } catch (error) {
      console.error('Validation suite failed:', error);
      results.error = error.message;
      return results;
    }
  }

  /**
   * Run specific validation test
   * @param {string} testType - Type of test to run
   * @param {Object} options - Test options
   * @returns {Promise<Object>} Test results
   */
  async runSpecificTest(testType, options = {}) {
    switch (testType) {
      case 'messageFormat':
        return await this.validator.validateAllMessageFormats(options);
      case 'compliance':
        return await this.tester.runComplianceTests(options);
      case 'edgeCases':
        return await this.tester.runEdgeCaseTests(options);
      case 'errorConditions':
        return await this.tester.runErrorConditionTests(options);
      case 'fuzzing':
        return await this.fuzzer.runFuzzingTests(options);
      case 'realPostgreSQLComparison':
        if (!this.comparator) {
          throw new Error(
            'PostgreSQL comparison module not available. Install "pg" package to enable real PostgreSQL comparison.'
          );
        }
        return await this.comparator.runComparisonTests(options);
      case 'performance':
        return await this.benchmark.runBenchmark(this);
      default:
        throw new Error(`Unknown test type: ${testType}`);
    }
  }

  /**
   * Update summary statistics
   * @param {Object} results - Results object
   * @param {string} testType - Test type
   */
  updateSummary(results, testType) {
    const testResults = results.tests[testType];
    if (testResults) {
      results.summary.total += testResults.total || 0;
      results.summary.passed += testResults.passed || 0;
      results.summary.failed += testResults.failed || 0;
      results.summary.warnings += testResults.warnings || 0;

      // Calculate success rate
      if (results.summary.total > 0) {
        results.summary.successRate = Math.round(
          (results.summary.passed / results.summary.total) * 100
        );
      } else {
        results.summary.successRate = 0;
      }
    }
  }

  /**
   * Get validation system status
   * @returns {Object} System status
   */
  getStatus() {
    return {
      enabled: true,
      fuzzingEnabled: this.options.enableFuzzing,
      realPostgreSQLComparisonEnabled: this.options.enableRealPostgreSQLComparison,
      outputDirectory: this.options.outputDir,
      reportFormat: this.options.reportFormat,
    };
  }
}

module.exports = {
  ProtocolValidationSystem,
  MessageValidator,
  ProtocolTester,
  ComplianceReporter,
  ProtocolFuzzer,
  RealPostgreSQLComparator: RealPostgreSQLComparator,
  PerformanceBenchmark,
};
