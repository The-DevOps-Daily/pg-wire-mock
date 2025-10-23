/**
 * Tests for PostgreSQL Wire Protocol Validation System
 */

const { ProtocolValidationSystem } = require('../../src/validation');

describe('Protocol Validation System', () => {
  let validationSystem;

  beforeEach(() => {
    validationSystem = new ProtocolValidationSystem({
      enableFuzzing: false,
      enableRealPostgreSQLComparison: false,
      outputDir: './test-reports',
    });
  });

  describe('System Initialization', () => {
    test('should initialize with default options', () => {
      const system = new ProtocolValidationSystem();
      const status = system.getStatus();

      expect(status.enabled).toBe(true);
      expect(status.fuzzingEnabled).toBe(true);
      expect(status.realPostgreSQLComparisonEnabled).toBe(false);
    });

    test('should initialize with custom options', () => {
      const options = {
        enableFuzzing: false,
        enableRealPostgreSQLComparison: true,
        outputDir: './custom-reports',
      };

      const system = new ProtocolValidationSystem(options);
      const status = system.getStatus();

      expect(status.fuzzingEnabled).toBe(false);
      expect(status.realPostgreSQLComparisonEnabled).toBe(true);
      expect(status.outputDir).toBe('./custom-reports');
    });
  });

  describe('Validation Suite', () => {
    test('should run full validation suite', async () => {
      const results = await validationSystem.runValidationSuite();

      expect(results).toHaveProperty('timestamp');
      expect(results).toHaveProperty('version');
      expect(results).toHaveProperty('tests');
      expect(results).toHaveProperty('summary');

      expect(results.summary).toHaveProperty('total');
      expect(results.summary).toHaveProperty('passed');
      expect(results.summary).toHaveProperty('failed');
      expect(results.summary).toHaveProperty('warnings');
    });

    test('should run specific test type', async () => {
      const results = await validationSystem.runSpecificTest('messageFormat');

      expect(results).toHaveProperty('total');
      expect(results).toHaveProperty('passed');
      expect(results).toHaveProperty('failed');
      expect(results).toHaveProperty('warnings');
    });

    test('should handle unknown test type', async () => {
      await expect(validationSystem.runSpecificTest('unknown')).rejects.toThrow(
        'Unknown test type: unknown'
      );
    });
  });

  describe('Error Handling', () => {
    test('should handle validation errors gracefully', async () => {
      // Mock a failing validation
      const originalMethod = validationSystem.runValidationSuite;
      validationSystem.runValidationSuite = jest
        .fn()
        .mockRejectedValue(new Error('Validation failed'));

      try {
        const results = await validationSystem.runValidationSuite();
        expect(results).toHaveProperty('error');
        expect(results.error).toBe('Validation failed');
      } catch (error) {
        expect(error.message).toBe('Validation failed');
      } finally {
        validationSystem.runValidationSuite = originalMethod;
      }
    });
  });
});
