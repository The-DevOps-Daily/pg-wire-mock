/**
 * Tests for query logging functionality
 */

const { createQueryLogger, QueryAnalyzer } = require('../../src/utils/logger');

describe('Query Logging', () => {
  test('should create query logger', () => {
    const logger = createQueryLogger();
    expect(logger).toBeDefined();
    expect(typeof logger.queryStart).toBe('function');
    expect(typeof logger.queryComplete).toBe('function');
  });

  test('should analyze query patterns', () => {
    const logs = [
      { query: 'SELECT 1', queryType: 'SELECT', executionTimeMs: 10 },
      { query: 'INSERT INTO t VALUES (1)', queryType: 'INSERT', executionTimeMs: 20 },
    ];
    
    const analysis = QueryAnalyzer.analyzePatterns(logs);
    expect(analysis.totalQueries).toBe(2);
    expect(analysis.queryTypes.SELECT).toBe(1);
    expect(analysis.queryTypes.INSERT).toBe(1);
  });
});
