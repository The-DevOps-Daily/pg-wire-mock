/**
 * PostgreSQL Wire Protocol Compliance Reporter
 * Generates detailed compliance reports in multiple formats
 */

const fs = require('fs').promises;
const path = require('path');

/**
 * Compliance reporter class
 */
class ComplianceReporter {
  constructor(options = {}) {
    this.options = {
      outputDir: './validation-reports',
      reportFormat: 'json', // json, html, text
      includeDetails: true,
      includeTimestamps: true,
      includeVersion: true,
      ...options
    };
  }

  /**
   * Generate compliance report
   * @param {Object} results - Validation results
   * @returns {Promise<Object>} Report information
   */
  async generateReport(results) {
    const report = {
      timestamp: new Date().toISOString(),
      format: this.options.reportFormat,
      summary: this.generateSummary(results),
      // Only include full details for HTML reports to avoid memory issues
      details: (this.options.includeDetails && this.options.reportFormat === 'html') ? results : null,
      metadata: this.generateMetadata(results)
    };

    // Ensure output directory exists
    await this.ensureOutputDirectory();

    // Generate report in specified format
    const reportPath = await this.writeReport(report, results);

    return {
      ...report,
      path: reportPath
    };
  }

  /**
   * Generate summary statistics
   * @param {Object} results - Validation results
   * @returns {Object} Summary statistics
   */
  generateSummary(results) {
    const summary = {
      overall: {
        total: 0,
        passed: 0,
        failed: 0,
        warnings: 0,
        successRate: 0
      },
      byCategory: {},
      criticalIssues: [],
      recommendations: []
    };

    // Process overall summary
    if (results.summary) {
      summary.overall = { ...results.summary };
      summary.overall.successRate = results.summary.total > 0 
        ? ((results.summary.passed / results.summary.total) * 100).toFixed(2)
        : 0;
    }

    // Process category summaries
    if (results.tests) {
      for (const [category, categoryResults] of Object.entries(results.tests)) {
        summary.byCategory[category] = {
          total: categoryResults.total || 0,
          passed: categoryResults.passed || 0,
          failed: categoryResults.failed || 0,
          warnings: categoryResults.warnings || 0,
          successRate: categoryResults.total > 0 
            ? ((categoryResults.passed / categoryResults.total) * 100).toFixed(2)
            : 0
        };
      }
    }

    // Identify critical issues
    summary.criticalIssues = this.identifyCriticalIssues(results);

    // Generate recommendations
    summary.recommendations = this.generateRecommendations(results);

    return summary;
  }

  /**
   * Generate metadata
   * @param {Object} results - Validation results
   * @returns {Object} Metadata
   */
  generateMetadata(results) {
    return {
      version: results.version || '1.0.0',
      timestamp: results.timestamp || new Date().toISOString(),
      duration: this.calculateDuration(results),
      environment: {
        nodeVersion: process.version,
        platform: process.platform,
        arch: process.arch
      },
      configuration: {
        includeDetails: this.options.includeDetails,
        reportFormat: this.options.reportFormat,
        outputDir: this.options.outputDir
      }
    };
  }

  /**
   * Calculate test duration
   * @param {Object} results - Validation results
   * @returns {string|null} Duration string
   */
  calculateDuration(results) {
    if (results.startTime && results.endTime) {
      const duration = new Date(results.endTime) - new Date(results.startTime);
      return `${duration}ms`;
    }
    return null;
  }

  /**
   * Identify critical issues
   * @param {Object} results - Validation results
   * @returns {Array} Critical issues
   */
  identifyCriticalIssues(results) {
    const criticalIssues = [];

    if (results.tests) {
      for (const [category, categoryResults] of Object.entries(results.tests)) {
        if (categoryResults.details) {
          for (const [testName, testResult] of Object.entries(categoryResults.details)) {
            if (testResult.error || (testResult.passed === false && !testResult.warnings)) {
              criticalIssues.push({
                category,
                test: testName,
                issue: testResult.error || 'Test failed',
                severity: 'critical'
              });
            }
          }
        }
      }
    }

    return criticalIssues;
  }

  /**
   * Generate recommendations
   * @param {Object} results - Validation results
   * @returns {Array} Recommendations
   */
  generateRecommendations(results) {
    const recommendations = [];

    if (results.summary) {
      const successRate = results.summary.total > 0 
        ? (results.summary.passed / results.summary.total) * 100
        : 0;

      if (successRate < 80) {
        recommendations.push({
          type: 'performance',
          priority: 'high',
          message: 'Overall success rate is below 80%. Review failed tests and improve implementation.'
        });
      }

      if (results.summary.warnings > 0) {
        recommendations.push({
          type: 'quality',
          priority: 'medium',
          message: `${results.summary.warnings} warnings found. Review and address warnings to improve code quality.`
        });
      }
    }

    if (results.tests) {
      for (const [category, categoryResults] of Object.entries(results.tests)) {
        if (categoryResults.failed > 0) {
          recommendations.push({
            type: 'category',
            priority: 'high',
            message: `${category} category has ${categoryResults.failed} failed tests. Focus on fixing these issues.`
          });
        }
      }
    }

    return recommendations;
  }

  /**
   * Write report to file
   * @param {Object} report - Report object
   * @param {Object} results - Validation results
   * @returns {Promise<string>} Report file path
   */
  async writeReport(report, results) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `compliance-report-${timestamp}.${this.options.reportFormat}`;
    const filepath = path.join(this.options.outputDir, filename);

    let content;
    switch (this.options.reportFormat) {
      case 'json':
        content = this.generateJSONReport(report, results);
        break;
      case 'html':
        content = this.generateHTMLReport(report, results);
        break;
      case 'text':
        content = this.generateTextReport(report, results);
        break;
      default:
        throw new Error(`Unsupported report format: ${this.options.reportFormat}`);
    }

    await fs.writeFile(filepath, content, 'utf8');
    return filepath;
  }

  /**
   * Generate JSON report
   * @param {Object} report - Report object
   * @param {Object} results - Validation results
   * @returns {string} JSON content
   */
  generateJSONReport(report, results) {
    try {
      // Create a simplified report for JSON to avoid memory issues
      const jsonReport = {
        timestamp: report.timestamp,
        format: report.format,
        summary: report.summary,
        metadata: report.metadata,
        // Only include summary details, not full test results
        testSummaries: this.generateTestSummaries(results),
        // Include critical issues and recommendations
        criticalIssues: report.summary.criticalIssues,
        recommendations: report.summary.recommendations
      };
      
      return JSON.stringify(jsonReport, null, 2);
    } catch (error) {
      // If JSON.stringify still fails, create a minimal report
      const minimalReport = {
        timestamp: report.timestamp,
        format: report.format,
        summary: report.summary,
        error: 'Report too large for JSON serialization',
        message: 'Use HTML or text format for detailed reports'
      };
      
      return JSON.stringify(minimalReport, null, 2);
    }
  }

  /**
   * Generate test summaries for JSON report
   * @param {Object} results - Validation results
   * @returns {Object} Test summaries
   */
  generateTestSummaries(results) {
    const summaries = {};
    
    if (results.tests) {
      for (const [category, categoryResults] of Object.entries(results.tests)) {
        summaries[category] = {
          total: categoryResults.total || 0,
          passed: categoryResults.passed || 0,
          failed: categoryResults.failed || 0,
          warnings: categoryResults.warnings || 0,
          successRate: categoryResults.total > 0 
            ? ((categoryResults.passed / categoryResults.total) * 100).toFixed(2)
            : 0,
          // Only include a sample of failed tests to keep JSON manageable
          failedTests: this.getSampleFailedTests(categoryResults.details, 10)
        };
      }
    }
    
    return summaries;
  }

  /**
   * Get a sample of failed tests for JSON report
   * @param {Object} details - Test details
   * @param {number} maxSamples - Maximum number of samples
   * @returns {Array} Sample of failed tests
   */
  getSampleFailedTests(details, maxSamples = 10) {
    if (!details) return [];
    
    const failedTests = [];
    let count = 0;
    
    for (const [testName, testResult] of Object.entries(details)) {
      if (count >= maxSamples) break;
      
      if (!testResult.passed) {
        failedTests.push({
          name: testName,
          error: testResult.error || 'Test failed',
          warnings: testResult.warnings || []
        });
        count++;
      }
    }
    
    return failedTests;
  }

  /**
   * Generate HTML report
   * @param {Object} report - Report object
   * @param {Object} results - Validation results
   * @returns {string} HTML content
   */
  generateHTMLReport(report, results) {
    const html = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>PostgreSQL Wire Protocol Compliance Report</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            line-height: 1.6;
            margin: 0;
            padding: 20px;
            background-color: #f5f5f5;
        }
        .container {
            max-width: 1200px;
            margin: 0 auto;
            background: white;
            padding: 30px;
            border-radius: 8px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
        }
        .header {
            border-bottom: 2px solid #e0e0e0;
            padding-bottom: 20px;
            margin-bottom: 30px;
        }
        .header h1 {
            color: #333;
            margin: 0;
            font-size: 2.5em;
        }
        .header .subtitle {
            color: #666;
            margin: 10px 0 0 0;
            font-size: 1.1em;
        }
        .summary {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 20px;
            margin-bottom: 30px;
        }
        .summary-card {
            background: #f8f9fa;
            padding: 20px;
            border-radius: 6px;
            text-align: center;
            border-left: 4px solid #007bff;
        }
        .summary-card.success {
            border-left-color: #28a745;
        }
        .summary-card.warning {
            border-left-color: #ffc107;
        }
        .summary-card.danger {
            border-left-color: #dc3545;
        }
        .summary-card h3 {
            margin: 0 0 10px 0;
            font-size: 2em;
            color: #333;
        }
        .summary-card p {
            margin: 0;
            color: #666;
            font-weight: 500;
        }
        .category {
            margin-bottom: 30px;
        }
        .category h3 {
            color: #333;
            border-bottom: 1px solid #e0e0e0;
            padding-bottom: 10px;
        }
        .test-results {
            background: #f8f9fa;
            border-radius: 6px;
            padding: 15px;
            margin-top: 15px;
        }
        .test-item {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 10px 0;
            border-bottom: 1px solid #e0e0e0;
        }
        .test-item:last-child {
            border-bottom: none;
        }
        .test-name {
            font-weight: 500;
            color: #333;
        }
        .test-status {
            padding: 4px 12px;
            border-radius: 20px;
            font-size: 0.9em;
            font-weight: 500;
        }
        .test-status.passed {
            background: #d4edda;
            color: #155724;
        }
        .test-status.failed {
            background: #f8d7da;
            color: #721c24;
        }
        .test-status.warning {
            background: #fff3cd;
            color: #856404;
        }
        .critical-issues {
            background: #f8d7da;
            border: 1px solid #f5c6cb;
            border-radius: 6px;
            padding: 20px;
            margin: 20px 0;
        }
        .critical-issues h3 {
            color: #721c24;
            margin-top: 0;
        }
        .recommendations {
            background: #d1ecf1;
            border: 1px solid #bee5eb;
            border-radius: 6px;
            padding: 20px;
            margin: 20px 0;
        }
        .recommendations h3 {
            color: #0c5460;
            margin-top: 0;
        }
        .metadata {
            background: #e9ecef;
            border-radius: 6px;
            padding: 15px;
            margin-top: 30px;
            font-size: 0.9em;
            color: #666;
        }
        .metadata h4 {
            margin-top: 0;
            color: #333;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>PostgreSQL Wire Protocol Compliance Report</h1>
            <p class="subtitle">Generated on ${report.timestamp}</p>
        </div>

        <div class="summary">
            <div class="summary-card ${report.summary.overall.successRate >= 90 ? 'success' : report.summary.overall.successRate >= 70 ? 'warning' : 'danger'}">
                <h3>${report.summary.overall.successRate}%</h3>
                <p>Success Rate</p>
            </div>
            <div class="summary-card">
                <h3>${report.summary.overall.total}</h3>
                <p>Total Tests</p>
            </div>
            <div class="summary-card success">
                <h3>${report.summary.overall.passed}</h3>
                <p>Passed</p>
            </div>
            <div class="summary-card danger">
                <h3>${report.summary.overall.failed}</h3>
                <p>Failed</p>
            </div>
            <div class="summary-card warning">
                <h3>${report.summary.overall.warnings}</h3>
                <p>Warnings</p>
            </div>
        </div>

        ${this.generateCategorySections(report, results)}

        ${report.summary.criticalIssues.length > 0 ? this.generateCriticalIssuesSection(report.summary.criticalIssues) : ''}

        ${report.summary.recommendations.length > 0 ? this.generateRecommendationsSection(report.summary.recommendations) : ''}

        <div class="metadata">
            <h4>Report Metadata</h4>
            <p><strong>Version:</strong> ${report.metadata.version}</p>
            <p><strong>Duration:</strong> ${report.metadata.duration || 'N/A'}</p>
            <p><strong>Node Version:</strong> ${report.metadata.environment.nodeVersion}</p>
            <p><strong>Platform:</strong> ${report.metadata.environment.platform} (${report.metadata.environment.arch})</p>
        </div>
    </div>
</body>
</html>`;

    return html;
  }

  /**
   * Generate category sections for HTML report
   * @param {Object} report - Report object
   * @param {Object} results - Validation results
   * @returns {string} HTML content
   */
  generateCategorySections(report, results) {
    let html = '';

    if (results.tests) {
      for (const [category, categoryResults] of Object.entries(results.tests)) {
        html += `
        <div class="category">
            <h3>${category.charAt(0).toUpperCase() + category.slice(1)} Tests</h3>
            <div class="test-results">
                <div class="test-item">
                    <span class="test-name">Overall</span>
                    <span class="test-status ${categoryResults.passed === categoryResults.total ? 'passed' : 'failed'}">
                        ${categoryResults.passed}/${categoryResults.total} passed
                    </span>
                </div>`;

        if (categoryResults.details) {
          for (const [testName, testResult] of Object.entries(categoryResults.details)) {
            const status = testResult.passed ? 'passed' : 'failed';
            const statusText = testResult.passed ? 'PASSED' : 'FAILED';
            
            html += `
                <div class="test-item">
                    <span class="test-name">${testName}</span>
                    <span class="test-status ${status}">${statusText}</span>
                </div>`;
          }
        }

        html += `
            </div>
        </div>`;
      }
    }

    return html;
  }

  /**
   * Generate critical issues section for HTML report
   * @param {Array} criticalIssues - Critical issues
   * @returns {string} HTML content
   */
  generateCriticalIssuesSection(criticalIssues) {
    let html = `
    <div class="critical-issues">
        <h3>Critical Issues (${criticalIssues.length})</h3>
        <ul>`;

    for (const issue of criticalIssues) {
      html += `
            <li><strong>${issue.category}/${issue.test}:</strong> ${issue.issue}</li>`;
    }

    html += `
        </ul>
    </div>`;

    return html;
  }

  /**
   * Generate recommendations section for HTML report
   * @param {Array} recommendations - Recommendations
   * @returns {string} HTML content
   */
  generateRecommendationsSection(recommendations) {
    let html = `
    <div class="recommendations">
        <h3>Recommendations (${recommendations.length})</h3>
        <ul>`;

    for (const rec of recommendations) {
      html += `
            <li><strong>${rec.type.toUpperCase()} (${rec.priority}):</strong> ${rec.message}</li>`;
    }

    html += `
        </ul>
    </div>`;

    return html;
  }

  /**
   * Generate text report
   * @param {Object} report - Report object
   * @param {Object} results - Validation results
   * @returns {string} Text content
   */
  generateTextReport(report, results) {
    let text = '';
    
    text += '='.repeat(80) + '\n';
    text += 'PostgreSQL Wire Protocol Compliance Report\n';
    text += '='.repeat(80) + '\n';
    text += `Generated: ${report.timestamp}\n`;
    text += `Format: ${report.format}\n\n`;

    // Summary
    text += 'SUMMARY\n';
    text += '-'.repeat(40) + '\n';
    text += `Total Tests: ${report.summary.overall.total}\n`;
    text += `Passed: ${report.summary.overall.passed}\n`;
    text += `Failed: ${report.summary.overall.failed}\n`;
    text += `Warnings: ${report.summary.overall.warnings}\n`;
    text += `Success Rate: ${report.summary.overall.successRate}%\n\n`;

    // Category summaries
    text += 'CATEGORY BREAKDOWN\n';
    text += '-'.repeat(40) + '\n';
    for (const [category, categorySummary] of Object.entries(report.summary.byCategory)) {
      text += `${category.toUpperCase()}: ${categorySummary.passed}/${categorySummary.total} (${categorySummary.successRate}%)\n`;
    }
    text += '\n';

    // Critical issues
    if (report.summary.criticalIssues.length > 0) {
      text += 'CRITICAL ISSUES\n';
      text += '-'.repeat(40) + '\n';
      for (const issue of report.summary.criticalIssues) {
        text += `• ${issue.category}/${issue.test}: ${issue.issue}\n`;
      }
      text += '\n';
    }

    // Recommendations
    if (report.summary.recommendations.length > 0) {
      text += 'RECOMMENDATIONS\n';
      text += '-'.repeat(40) + '\n';
      for (const rec of report.summary.recommendations) {
        text += `• [${rec.type.toUpperCase()}] ${rec.message}\n`;
      }
      text += '\n';
    }

    // Metadata
    text += 'METADATA\n';
    text += '-'.repeat(40) + '\n';
    text += `Version: ${report.metadata.version}\n`;
    text += `Duration: ${report.metadata.duration || 'N/A'}\n`;
    text += `Node Version: ${report.metadata.environment.nodeVersion}\n`;
    text += `Platform: ${report.metadata.environment.platform} (${report.metadata.environment.arch})\n`;

    return text;
  }

  /**
   * Ensure output directory exists
   * @returns {Promise<void>}
   */
  async ensureOutputDirectory() {
    try {
      await fs.mkdir(this.options.outputDir, { recursive: true });
    } catch (error) {
      if (error.code !== 'EEXIST') {
        throw error;
      }
    }
  }
}

module.exports = ComplianceReporter;


