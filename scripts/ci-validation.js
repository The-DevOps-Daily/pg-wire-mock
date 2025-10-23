#!/usr/bin/env node

/**
 * CI Validation Script
 * Runs validation tests for continuous integration and regression prevention
 */

const { ProtocolValidationSystem } = require('../src/validation');
const fs = require('fs').promises;
const path = require('path');

/**
 * CI Validation class
 */
class CIValidation {
  constructor() {
    this.options = {
      enableFuzzing: true,
      enableRealPostgreSQLComparison: false,
      reportFormat: 'json',
      outputDir: './ci-reports',
      verbose: false,
      quiet: true,
    };

    this.thresholds = {
      minSuccessRate: 95, // Minimum 95% success rate
      maxCriticalIssues: 0, // No critical issues allowed
      maxWarnings: 10, // Maximum 10 warnings
      maxFuzzingCrashes: 5, // Maximum 5 fuzzing crashes
    };
  }

  /**
   * Run CI validation
   * @returns {Promise<boolean>} True if validation passes, false otherwise
   */
  async run() {
    try {
      console.log('🔍 Starting CI Validation...');

      const validationSystem = new ProtocolValidationSystem(this.options);
      const results = await validationSystem.runValidationSuite();

      // Generate CI report
      await this.generateCIReport(results);

      // Check thresholds
      const passed = await this.checkThresholds(results);

      if (passed) {
        console.log('✅ CI Validation PASSED');
        return true;
      } else {
        console.log('❌ CI Validation FAILED');
        return false;
      }
    } catch (error) {
      console.error('💥 CI Validation Error:', error.message);
      return false;
    }
  }

  /**
   * Check validation results against thresholds
   * @param {Object} results - Validation results
   * @returns {Promise<boolean>} True if all thresholds are met
   */
  async checkThresholds(results) {
    const issues = [];

    // Check success rate
    if (results.summary) {
      const successRate = (results.summary.passed / results.summary.total) * 100;
      if (successRate < this.thresholds.minSuccessRate) {
        issues.push(
          `Success rate ${successRate.toFixed(2)}% below threshold ${this.thresholds.minSuccessRate}%`
        );
      }

      // Check critical issues
      if (
        results.summary.criticalIssues &&
        results.summary.criticalIssues.length > this.thresholds.maxCriticalIssues
      ) {
        issues.push(
          `Critical issues ${results.summary.criticalIssues.length} ` +
            `exceed threshold ${this.thresholds.maxCriticalIssues}`
        );
      }

      // Check warnings
      if (results.summary.warnings > this.thresholds.maxWarnings) {
        issues.push(
          `Warnings ${results.summary.warnings} exceed threshold ${this.thresholds.maxWarnings}`
        );
      }
    }

    // Check fuzzing crashes
    if (results.tests && results.tests.fuzzing) {
      const fuzzingCrashes = results.tests.fuzzing.crashes
        ? results.tests.fuzzing.crashes.length
        : 0;
      if (fuzzingCrashes > this.thresholds.maxFuzzingCrashes) {
        issues.push(
          `Fuzzing crashes ${fuzzingCrashes} exceed threshold ${this.thresholds.maxFuzzingCrashes}`
        );
      }
    }

    if (issues.length > 0) {
      console.log('🚨 Threshold violations:');
      issues.forEach(issue => console.log(`  - ${issue}`));
      return false;
    }

    return true;
  }

  /**
   * Generate CI-specific report
   * @param {Object} results - Validation results
   */
  async generateCIReport(results) {
    const report = {
      timestamp: new Date().toISOString(),
      ci: true,
      thresholds: this.thresholds,
      results: results,
      summary: {
        passed: this.checkThresholds(results),
        successRate: results.summary ? (results.summary.passed / results.summary.total) * 100 : 0,
        criticalIssues: results.summary?.criticalIssues?.length || 0,
        warnings: results.summary?.warnings || 0,
        fuzzingCrashes: results.tests?.fuzzing?.crashes?.length || 0,
      },
    };

    // Ensure output directory exists
    await fs.mkdir(this.options.outputDir, { recursive: true });

    // Write JSON report
    const jsonPath = path.join(this.options.outputDir, 'ci-validation-report.json');
    await fs.writeFile(jsonPath, JSON.stringify(report, null, 2));

    // Write summary for CI systems
    const summaryPath = path.join(this.options.outputDir, 'ci-summary.txt');
    const summary = this.generateSummaryText(report);
    await fs.writeFile(summaryPath, summary);

    console.log(`📊 CI Report generated: ${jsonPath}`);
  }

  /**
   * Generate summary text for CI systems
   * @param {Object} report - CI report
   * @returns {string} Summary text
   */
  generateSummaryText(report) {
    const lines = [];
    lines.push('PostgreSQL Wire Protocol CI Validation Report');
    lines.push('============================================');
    lines.push('');
    lines.push(`Timestamp: ${report.timestamp}`);
    lines.push(`Status: ${report.summary.passed ? 'PASSED' : 'FAILED'}`);
    lines.push(`Success Rate: ${report.summary.successRate.toFixed(2)}%`);
    lines.push(`Critical Issues: ${report.summary.criticalIssues}`);
    lines.push(`Warnings: ${report.summary.warnings}`);
    lines.push(`Fuzzing Crashes: ${report.summary.fuzzingCrashes}`);
    lines.push('');

    if (report.results.summary) {
      lines.push('Test Summary:');
      lines.push(`  Total: ${report.results.summary.total}`);
      lines.push(`  Passed: ${report.results.summary.passed}`);
      lines.push(`  Failed: ${report.results.summary.failed}`);
      lines.push('');
    }

    if (report.results.tests) {
      lines.push('Test Categories:');
      for (const [category, categoryResults] of Object.entries(report.results.tests)) {
        lines.push(`  ${category}: ${categoryResults.passed}/${categoryResults.total} passed`);
      }
      lines.push('');
    }

    if (!report.summary.passed) {
      lines.push('❌ CI Validation FAILED - Check thresholds above');
    } else {
      lines.push('✅ CI Validation PASSED - All thresholds met');
    }

    return lines.join('\n');
  }
}

// Run CI validation if this file is executed directly
if (require.main === module) {
  const ci = new CIValidation();
  ci.run()
    .then(success => {
      process.exit(success ? 0 : 1);
    })
    .catch(error => {
      console.error('Fatal error:', error.message);
      process.exit(1);
    });
}

module.exports = CIValidation;
