/**
 * Simple COPY Protocol Test
 * Basic verification that COPY functionality is working
 */

const {
  handleCopyQuery,
  parseCopyQuery,
  parseCopyOptions,
  generateMockCopyData,
  formatCopyData
} = require('../../src/handlers/queryHandlers');

const { ConnectionState } = require('../../src/connection/connectionState');

describe('COPY Protocol Basic Functionality', () => {
  let mockConnState;

  beforeEach(() => {
    mockConnState = new ConnectionState();
  });

  describe('Core COPY Functions', () => {
    test('parseCopyQuery should parse basic COPY FROM STDIN', () => {
      const query = "COPY users FROM STDIN";
      const result = parseCopyQuery(query);
      
      expect(result.direction).toBe('FROM');
      expect(result.tableName).toBe('users');
      expect(result.source).toBe('STDIN');
      expect(result.format).toBe('text');
    });

    test('parseCopyQuery should parse COPY TO STDOUT', () => {
      const query = "COPY products TO STDOUT";
      const result = parseCopyQuery(query);
      
      expect(result.direction).toBe('TO');
      expect(result.tableName).toBe('products');
      expect(result.destination).toBe('STDOUT');
      expect(result.format).toBe('text');
    });

    test('parseCopyOptions should parse basic options', () => {
      const optionsStr = "(FORMAT csv, HEADER true)";
      const result = parseCopyOptions(optionsStr);
      
      expect(result.format).toBe('csv');
      expect(result.header).toBe(true);
    });

    test('handleCopyQuery should handle COPY FROM STDIN', () => {
      const query = "COPY users FROM STDIN";
      const result = handleCopyQuery(query, mockConnState);
      
      expect(result.needsCopyInResponse).toBe(true);
      expect(result.copyInfo.direction).toBe('FROM');
      expect(result.copyInfo.tableName).toBe('users');
    });

    test('handleCopyQuery should handle COPY TO STDOUT', () => {
      const query = "COPY products TO STDOUT";
      const result = handleCopyQuery(query, mockConnState);
      
      expect(result.needsCopyOutResponse).toBe(true);
      expect(result.copyInfo.direction).toBe('TO');
      expect(result.copyInfo.tableName).toBe('products');
    });

    test('generateMockCopyData should generate data', () => {
      const copyInfo = {
        tableName: 'users',
        format: 'text'
      };
      const data = generateMockCopyData(copyInfo, 3);
      
      expect(Array.isArray(data)).toBe(true);
      expect(data.length).toBeGreaterThan(0);
    });

    test('formatCopyData should format text data', () => {
      const rows = [
        { id: 1, name: 'John', email: 'john@example.com' }
      ];
      const copyInfo = {
        format: 'text',
        delimiter: '\t'
      };
      
      const result = formatCopyData(rows, copyInfo);
      expect(typeof result).toBe('string');
      expect(result.length).toBeGreaterThan(0);
    });
  });

  describe('Connection State Integration', () => {
    test('should update connection state for COPY operations', () => {
      const query = "COPY users FROM STDIN WITH (FORMAT csv)";
      const result = handleCopyQuery(query, mockConnState);
      
      expect(result.needsCopyInResponse).toBe(true);
      
      // Verify connection state was updated
      const copyState = mockConnState.getCopyState();
      expect(copyState.active).toBe(true);
      expect(copyState.direction).toBe('in');  // Should be converted to 'in' for FROM operations
      expect(copyState.format).toBe('csv');
    });

    test('should detect COPY mode correctly', () => {
      expect(mockConnState.isInCopyMode()).toBe(false);
      
      const query = "COPY users FROM STDIN";
      handleCopyQuery(query, mockConnState);
      
      expect(mockConnState.isInCopyMode()).toBe(true);
    });
  });

  describe('Error Handling', () => {
    test('should handle invalid COPY syntax', () => {
      const query = "COPY invalid syntax";
      const result = parseCopyQuery(query);
      
      expect(result.error).toBeDefined();
    });

    test('should handle file operations gracefully', () => {
      const query = "COPY users FROM '/path/to/file.csv'";
      const result = handleCopyQuery(query, mockConnState);
      
      // Should return an error for file operations (not supported)
      expect(result.error).toBeDefined();
    });
  });
});