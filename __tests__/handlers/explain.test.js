/**
 * Tests for EXPLAIN query functionality
 */

const {
  handleExplainQuery,
  processQuery,
} = require('../../src/handlers/queryHandlers');
const { ConnectionState } = require('../../src/connection/connectionState');

describe('EXPLAIN Query Handler', () => {
  let connState;

  beforeEach(() => {
    connState = new ConnectionState();
    connState.parameters.set('user', 'testuser');
    connState.parameters.set('database', 'testdb');
  });

  describe('Basic EXPLAIN functionality', () => {
    test('should handle basic EXPLAIN SELECT', () => {
      const query = 'EXPLAIN SELECT * FROM users';
      const result = handleExplainQuery(query, connState);

      expect(result.command).toBe('EXPLAIN');
      expect(result.columns).toHaveLength(1);
      expect(result.columns[0].name).toBe('QUERY PLAN');
      expect(result.rows).toBeDefined();
      expect(result.rows.length).toBeGreaterThan(0);
      
      // Check that it contains plan text
      const planText = result.rows.map(row => row[0]).join('\n');
      expect(planText).toContain('Seq Scan');
      expect(planText).toContain('cost=');
      expect(planText).toContain('rows=');
    });

    test('should handle EXPLAIN with parentheses format', () => {
      const query = 'EXPLAIN (ANALYZE false) SELECT 1';
      const result = handleExplainQuery(query, connState);

      expect(result.command).toBe('EXPLAIN');
      expect(result.rows).toBeDefined();
      
      const planText = result.rows.map(row => row[0]).join('\n');
      expect(planText).toContain('Result');
      expect(planText).not.toContain('actual time='); // ANALYZE is false
    });

    test('should handle EXPLAIN ANALYZE', () => {
      const query = 'EXPLAIN ANALYZE SELECT * FROM users WHERE id = 1';
      const result = handleExplainQuery(query, connState);

      expect(result.command).toBe('EXPLAIN');
      
      const planText = result.rows.map(row => row[0]).join('\n');
      expect(planText).toContain('actual time=');
      expect(planText).toContain('rows=');
      expect(planText).toContain('loops=');
      expect(planText).toContain('Planning Time:');
      expect(planText).toContain('Execution Time:');
    });

    test('should handle different query types', () => {
      const queries = [
        'EXPLAIN INSERT INTO users (name) VALUES (\'test\')',
        'EXPLAIN UPDATE users SET name = \'updated\' WHERE id = 1',
        'EXPLAIN DELETE FROM users WHERE id = 1'
      ];

      queries.forEach(query => {
        const result = handleExplainQuery(query, connState);
        expect(result.command).toBe('EXPLAIN');
        expect(result.rows).toBeDefined();
        expect(result.rows.length).toBeGreaterThan(0);
      });
    });
  });

  describe('Output formats', () => {
    test('should handle JSON format', () => {
      const query = 'EXPLAIN (FORMAT JSON) SELECT * FROM users';
      const result = handleExplainQuery(query, connState);

      expect(result.command).toBe('EXPLAIN');
      
      const jsonText = result.rows.map(row => row[0]).join('\n');
      const parsed = JSON.parse(jsonText);
      
      expect(Array.isArray(parsed)).toBe(true);
      expect(parsed[0]).toHaveProperty('Plan');
      expect(parsed[0].Plan).toHaveProperty('Node Type');
      expect(parsed[0].Plan).toHaveProperty('Startup Cost');
      expect(parsed[0].Plan).toHaveProperty('Total Cost');
    });

    test('should handle XML format', () => {
      const query = 'EXPLAIN (FORMAT XML) SELECT 1';
      const result = handleExplainQuery(query, connState);

      expect(result.command).toBe('EXPLAIN');
      
      const xmlText = result.rows.map(row => row[0]).join('\n');
      expect(xmlText).toContain('<?xml version="1.0"');
      expect(xmlText).toContain('<explain xmlns=');
      expect(xmlText).toContain('<Node-Type>');
      expect(xmlText).toContain('<Startup-Cost>');
      expect(xmlText).toContain('</explain>');
    });

    test('should handle YAML format', () => {
      const query = 'EXPLAIN (FORMAT YAML) SELECT * FROM posts';
      const result = handleExplainQuery(query, connState);

      expect(result.command).toBe('EXPLAIN');
      
      const yamlText = result.rows.map(row => row[0]).join('\n');
      expect(yamlText).toContain('- Plan:');
      expect(yamlText).toContain('Node Type:');
      expect(yamlText).toContain('Startup Cost:');
      expect(yamlText).toContain('Total Cost:');
    });

    test('should handle JSON with ANALYZE', () => {
      const query = 'EXPLAIN (FORMAT JSON, ANALYZE true) SELECT * FROM users';
      const result = handleExplainQuery(query, connState);

      const jsonText = result.rows.map(row => row[0]).join('\n');
      const parsed = JSON.parse(jsonText);
      
      expect(parsed[0].Plan).toHaveProperty('Actual Startup Time');
      expect(parsed[0].Plan).toHaveProperty('Actual Total Time');
      expect(parsed[0].Plan).toHaveProperty('Actual Rows');
      expect(parsed[0]).toHaveProperty('Planning Time');
      expect(parsed[0]).toHaveProperty('Execution Time');
    });
  });

  describe('Complex queries', () => {
    test('should handle JOIN queries', () => {
      const query = 'EXPLAIN SELECT * FROM users JOIN posts ON users.id = posts.user_id';
      const result = handleExplainQuery(query, connState);

      const planText = result.rows.map(row => row[0]).join('\n');
      expect(planText).toContain('Hash Join');
      expect(planText).toContain('Hash Cond:');
    });

    test('should handle queries with WHERE conditions', () => {
      const query = 'EXPLAIN SELECT * FROM users WHERE name = \'test\' AND id > 10';
      const result = handleExplainQuery(query, connState);

      const planText = result.rows.map(row => row[0]).join('\n');
      expect(planText).toContain('Filter:');
    });

    test('should handle queries with ORDER BY', () => {
      const query = 'EXPLAIN SELECT * FROM users ORDER BY name, created_at DESC';
      const result = handleExplainQuery(query, connState);

      const planText = result.rows.map(row => row[0]).join('\n');
      expect(planText).toContain('Sort');
      expect(planText).toContain('Sort Key:');
    });

    test('should handle complex UPDATE with WHERE', () => {
      const query = 'EXPLAIN ANALYZE UPDATE users SET name = \'new\' WHERE id IN (1,2,3)';
      const result = handleExplainQuery(query, connState);

      const planText = result.rows.map(row => row[0]).join('\n');
      expect(planText).toContain('Update');
      expect(planText).toContain('Seq Scan');
      expect(planText).toContain('Filter:');
      expect(planText).toContain('actual time=');
    });
  });

  describe('Error handling', () => {
    test('should handle invalid format', () => {
      const query = 'EXPLAIN (FORMAT INVALID) SELECT 1';
      
      expect(() => {
        handleExplainQuery(query, connState);
      }).toThrow();
    });

    test('should handle empty EXPLAIN', () => {
      const query = 'EXPLAIN';
      
      expect(() => {
        handleExplainQuery(query, connState);
      }).toThrow();
    });

    test('should handle EXPLAIN with only whitespace', () => {
      const query = 'EXPLAIN   ';
      
      expect(() => {
        handleExplainQuery(query, connState);
      }).toThrow();
    });

    test('should handle inner query processing', () => {
      // Test that EXPLAIN can handle unknown queries gracefully
      const query = 'EXPLAIN INVALID SYNTAX QUERY';
      const result = handleExplainQuery(query, connState);
      
      // Should return a result (mock server handles unknown queries)
      expect(result.command).toBe('EXPLAIN');
      expect(result.rows).toBeDefined();
    });
  });

  describe('Options parsing', () => {
    test('should parse multiple options', () => {
      const query = 'EXPLAIN (ANALYZE true, VERBOSE true, COSTS false) SELECT 1';
      const result = handleExplainQuery(query, connState);

      expect(result.command).toBe('EXPLAIN');
      const planText = result.rows.map(row => row[0]).join('\n');
      expect(planText).toContain('actual time='); // ANALYZE true
    });

    test('should handle options without values', () => {
      const query = 'EXPLAIN (ANALYZE, VERBOSE) SELECT * FROM users';
      const result = handleExplainQuery(query, connState);

      expect(result.command).toBe('EXPLAIN');
      const planText = result.rows.map(row => row[0]).join('\n');
      expect(planText).toContain('actual time='); // ANALYZE defaults to true
    });

    test('should handle case insensitive options', () => {
      const query = 'explain (format json, analyze true) select 1';
      const result = handleExplainQuery(query, connState);

      const jsonText = result.rows.map(row => row[0]).join('\n');
      const parsed = JSON.parse(jsonText);
      expect(parsed[0].Plan).toHaveProperty('Actual Startup Time');
    });
  });

  describe('Integration with processQuery', () => {
    test('should be called from processQuery for EXPLAIN queries', () => {
      const query = 'EXPLAIN SELECT 1';
      const result = processQuery(query, connState);

      expect(result.command).toBe('EXPLAIN');
      expect(result.rows).toBeDefined();
    });

    test('should work with multiple formats through processQuery', () => {
      const queries = [
        'EXPLAIN SELECT 1',
        'EXPLAIN (FORMAT JSON) SELECT 1',
        'EXPLAIN ANALYZE SELECT 1'
      ];

      queries.forEach(query => {
        const result = processQuery(query, connState);
        expect(result.command).toBe('EXPLAIN');
        expect(result.rows).toBeDefined();
        expect(result.error).toBeUndefined();
      });
    });
  });

  describe('Plan structure validation', () => {
    test('should generate realistic costs', () => {
      const query = 'EXPLAIN SELECT * FROM users';
      const result = handleExplainQuery(query, connState);

      const planText = result.rows.map(row => row[0]).join('\n');
      const costMatch = planText.match(/cost=(\d+\.\d+)\.\.(\d+\.\d+)/);
      
      expect(costMatch).toBeTruthy();
      const startupCost = parseFloat(costMatch[1]);
      const totalCost = parseFloat(costMatch[2]);
      
      expect(startupCost).toBeGreaterThanOrEqual(0);
      expect(totalCost).toBeGreaterThanOrEqual(startupCost);
    });

    test('should generate realistic row estimates', () => {
      const query = 'EXPLAIN SELECT * FROM users';
      const result = handleExplainQuery(query, connState);

      const planText = result.rows.map(row => row[0]).join('\n');
      const rowMatch = planText.match(/rows=(\d+)/);
      
      expect(rowMatch).toBeTruthy();
      const rows = parseInt(rowMatch[1]);
      expect(rows).toBeGreaterThan(0);
    });

    test('should include timing in ANALYZE mode', () => {
      const query = 'EXPLAIN ANALYZE SELECT * FROM users';
      const result = handleExplainQuery(query, connState);

      const planText = result.rows.map(row => row[0]).join('\n');
      expect(planText).toMatch(/Planning Time: \d+\.\d+ ms/);
      expect(planText).toMatch(/Execution Time: \d+\.\d+ ms/);
    });
  });
});
