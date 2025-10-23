/**
 * Tests for Compliance Reporter
 */

const ComplianceReporter = require('../../src/validation/complianceReporter');
const fs = require('fs').promises;

describe('Compliance Reporter', () => {
  let reporter;

  beforeEach(() => {
    reporter = new ComplianceReporter({
      outputDir: './test-reports',
      reportFormat: 'json',
    });
  });

  describe('Initialization', () => {
    test('should initialize with default options', () => {
      const defaultReporter = new ComplianceReporter();

      expect(defaultReporter.options).toHaveProperty('outputDir', './validation-reports');
      expect(defaultReporter.options).toHaveProperty('reportFormat', 'json');
      expect(defaultReporter.options).toHaveProperty('includeDetails', true);
    });

    test('should initialize with custom options', () => {
      const options = {
        outputDir: './custom-reports',
        reportFormat: 'html',
        includeDetails: false,
      };

      const customReporter = new ComplianceReporter(options);

      expect(customReporter.options).toHaveProperty('outputDir', './custom-reports');
      expect(customReporter.options).toHaveProperty('reportFormat', 'html');
      expect(customReporter.options).toHaveProperty('includeDetails', false);
    });
  });

  describe('Report Generation', () => {
    test('should generate report', async () => {
      const mockResults = {
        timestamp: new Date().toISOString(),
        version: '1.0.0',
        summary: {
          total: 10,
          passed: 8,
          failed: 2,
          warnings: 1,
        },
        tests: {
          messageFormat: {
            total: 5,
            passed: 4,
            failed: 1,
            warnings: 0,
          },
          compliance: {
            total: 5,
            passed: 4,
            failed: 1,
            warnings: 1,
          },
        },
      };

      const report = await reporter.generateReport(mockResults);

      expect(report).toHaveProperty('timestamp');
      expect(report).toHaveProperty('format', 'json');
      expect(report).toHaveProperty('summary');
      expect(report).toHaveProperty('details');
      expect(report).toHaveProperty('metadata');
      expect(report).toHaveProperty('path');
    });

    test('should generate summary statistics', () => {
      const mockResults = {
        summary: {
          total: 10,
          passed: 8,
          failed: 2,
          warnings: 1,
        },
        tests: {
          messageFormat: {
            total: 5,
            passed: 4,
            failed: 1,
            warnings: 0,
          },
        },
      };

      const summary = reporter.generateSummary(mockResults);

      expect(summary).toHaveProperty('overall');
      expect(summary).toHaveProperty('byCategory');
      expect(summary).toHaveProperty('criticalIssues');
      expect(summary).toHaveProperty('recommendations');

      expect(summary.overall.total).toBe(10);
      expect(summary.overall.passed).toBe(8);
      expect(summary.overall.failed).toBe(2);
      expect(summary.overall.warnings).toBe(1);
      expect(summary.overall.successRate).toBe('80.00');
    });

    test('should generate metadata', () => {
      const mockResults = {
        version: '1.0.0',
        timestamp: new Date().toISOString(),
      };

      const metadata = reporter.generateMetadata(mockResults);

      expect(metadata).toHaveProperty('version', '1.0.0');
      expect(metadata).toHaveProperty('timestamp');
      expect(metadata).toHaveProperty('environment');
      expect(metadata).toHaveProperty('configuration');

      expect(metadata.environment).toHaveProperty('nodeVersion');
      expect(metadata.environment).toHaveProperty('platform');
      expect(metadata.environment).toHaveProperty('arch');
    });
  });

  describe('Critical Issues Identification', () => {
    test('should identify critical issues', () => {
      const mockResults = {
        tests: {
          messageFormat: {
            details: {
              test1: {
                passed: true,
                warnings: [],
              },
              test2: {
                passed: false,
                error: 'Test failed',
              },
              test3: {
                passed: false,
                warnings: ['Warning message'],
              },
            },
          },
        },
      };

      const criticalIssues = reporter.identifyCriticalIssues(mockResults);

      expect(criticalIssues).toHaveLength(1);
      expect(criticalIssues[0]).toHaveProperty('category', 'messageFormat');
      expect(criticalIssues[0]).toHaveProperty('test', 'test2');
      expect(criticalIssues[0]).toHaveProperty('issue', 'Test failed');
      expect(criticalIssues[0]).toHaveProperty('severity', 'critical');
    });

    test('should handle no critical issues', () => {
      const mockResults = {
        tests: {
          messageFormat: {
            details: {
              test1: {
                passed: true,
                warnings: [],
              },
            },
          },
        },
      };

      const criticalIssues = reporter.identifyCriticalIssues(mockResults);

      expect(criticalIssues).toHaveLength(0);
    });
  });

  describe('Recommendations Generation', () => {
    test('should generate recommendations for low success rate', () => {
      const mockResults = {
        summary: {
          total: 10,
          passed: 5,
          failed: 5,
          warnings: 2,
        },
      };

      const recommendations = reporter.generateRecommendations(mockResults);

      expect(recommendations).toHaveLength(2);
      expect(recommendations[0]).toHaveProperty('type', 'performance');
      expect(recommendations[0]).toHaveProperty('priority', 'high');
      expect(recommendations[1]).toHaveProperty('type', 'quality');
      expect(recommendations[1]).toHaveProperty('priority', 'medium');
    });

    test('should generate recommendations for failed categories', () => {
      const mockResults = {
        summary: {
          total: 10,
          passed: 8,
          failed: 2,
          warnings: 0,
        },
        tests: {
          messageFormat: {
            total: 5,
            passed: 2,
            failed: 3,
            warnings: 0,
          },
        },
      };

      const recommendations = reporter.generateRecommendations(mockResults);

      expect(recommendations).toHaveLength(1);
      expect(recommendations[0]).toHaveProperty('type', 'category');
      expect(recommendations[0]).toHaveProperty('priority', 'high');
      expect(recommendations[0].message).toContain('messageFormat');
    });

    test('should handle no recommendations needed', () => {
      const mockResults = {
        summary: {
          total: 10,
          passed: 10,
          failed: 0,
          warnings: 0,
        },
      };

      const recommendations = reporter.generateRecommendations(mockResults);

      expect(recommendations).toHaveLength(0);
    });
  });

  describe('Report Format Generation', () => {
    test('should generate JSON report', () => {
      const mockReport = {
        timestamp: new Date().toISOString(),
        format: 'json',
        summary: { total: 10, passed: 8, failed: 2, warnings: 0 },
      };
      const mockResults = {};

      const jsonContent = reporter.generateJSONReport(mockReport, mockResults);

      expect(() => JSON.parse(jsonContent)).not.toThrow();
      const parsed = JSON.parse(jsonContent);
      expect(parsed).toHaveProperty('timestamp');
      expect(parsed).toHaveProperty('format', 'json');
      expect(parsed).toHaveProperty('summary');
    });

    test('should generate HTML report', () => {
      const mockReport = {
        timestamp: new Date().toISOString(),
        format: 'html',
        summary: {
          overall: { total: 10, passed: 8, failed: 2, warnings: 0, successRate: '80.00' },
          byCategory: {},
          criticalIssues: [],
          recommendations: [],
        },
        metadata: {
          version: '1.0.0',
          duration: '1000ms',
          environment: {
            nodeVersion: 'v16.0.0',
            platform: 'linux',
            arch: 'x64',
          },
        },
      };
      const mockResults = {
        tests: {
          messageFormat: {
            total: 5,
            passed: 4,
            failed: 1,
            warnings: 0,
            details: {
              test1: { passed: true, warnings: [] },
              test2: { passed: false, error: 'Test failed' },
            },
          },
        },
      };

      const htmlContent = reporter.generateHTMLReport(mockReport, mockResults);

      expect(htmlContent).toContain('<!DOCTYPE html>');
      expect(htmlContent).toContain('<title>PostgreSQL Wire Protocol Compliance Report</title>');
      expect(htmlContent).toContain('80.00%');
      expect(htmlContent).toContain('Total Tests: 10');
    });

    test('should generate text report', () => {
      const mockReport = {
        timestamp: new Date().toISOString(),
        format: 'text',
        summary: {
          overall: { total: 10, passed: 8, failed: 2, warnings: 1, successRate: '80.00' },
          byCategory: {
            messageFormat: { total: 5, passed: 4, failed: 1, warnings: 0, successRate: '80.00' },
          },
          criticalIssues: [],
          recommendations: [],
        },
        metadata: {
          version: '1.0.0',
          duration: '1000ms',
          environment: {
            nodeVersion: 'v16.0.0',
            platform: 'linux',
            arch: 'x64',
          },
        },
      };
      const mockResults = {};

      const textContent = reporter.generateTextReport(mockReport, mockResults);

      expect(textContent).toContain('PostgreSQL Wire Protocol Compliance Report');
      expect(textContent).toContain('Total Tests: 10');
      expect(textContent).toContain('Passed: 8');
      expect(textContent).toContain('Failed: 2');
      expect(textContent).toContain('Success Rate: 80.00%');
    });
  });

  describe('File Operations', () => {
    test('should ensure output directory exists', async () => {
      const testDir = './test-reports-' + Date.now();
      const testReporter = new ComplianceReporter({ outputDir: testDir });

      await testReporter.ensureOutputDirectory();

      try {
        const stats = await fs.stat(testDir);
        expect(stats.isDirectory()).toBe(true);
      } finally {
        await fs.rmdir(testDir);
      }
    });

    test('should write report to file', async () => {
      const testDir = './test-reports-' + Date.now();
      const testReporter = new ComplianceReporter({
        outputDir: testDir,
        reportFormat: 'json',
      });

      await testReporter.ensureOutputDirectory();

      const mockReport = {
        timestamp: new Date().toISOString(),
        format: 'json',
        summary: { total: 10, passed: 8, failed: 2, warnings: 0 },
      };
      const mockResults = {};

      const reportPath = await testReporter.writeReport(mockReport, mockResults);

      expect(reportPath).toContain(testDir);
      expect(reportPath).toContain('.json');

      try {
        const stats = await fs.stat(reportPath);
        expect(stats.isFile()).toBe(true);
      } finally {
        await fs.rmdir(testDir, { recursive: true });
      }
    });
  });

  describe('Edge Cases', () => {
    test('should handle empty results', () => {
      const mockResults = {};
      const summary = reporter.generateSummary(mockResults);

      expect(summary.overall.total).toBe(0);
      expect(summary.overall.passed).toBe(0);
      expect(summary.overall.failed).toBe(0);
      expect(summary.overall.warnings).toBe(0);
    });

    test('should handle missing summary', () => {
      const mockResults = {
        tests: {
          messageFormat: {
            total: 5,
            passed: 4,
            failed: 1,
            warnings: 0,
          },
        },
      };

      const summary = reporter.generateSummary(mockResults);

      expect(summary.overall.total).toBe(0);
      expect(summary.byCategory.messageFormat.total).toBe(5);
    });

    test('should handle missing tests', () => {
      const mockResults = {
        summary: {
          total: 10,
          passed: 8,
          failed: 2,
          warnings: 1,
        },
      };

      const summary = reporter.generateSummary(mockResults);

      expect(summary.overall.total).toBe(10);
      expect(Object.keys(summary.byCategory)).toHaveLength(0);
    });
  });
});
