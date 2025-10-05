/**
 * Tests for database introspection query handlers
 */
const {
  handleIntrospectionQuery,
  handleInformationSchemaTables,
  handleInformationSchemaColumns,
  handleInformationSchemaSchemata,
  handlePgCatalogQuery,
  handlePgTables,
  handlePgType,
  handlePgClass,
} = require('../src/handlers/queryHandlers');

const { DATA_TYPES } = require('../src/protocol/constants');

// Mock connection state for testing
const mockConnState = {
  parameters: new Map([
    ['user', 'testuser'],
    ['database', 'testdb'],
  ]),
  transactionStatus: 'I',
};

describe('Database Introspection Queries', () => {
  describe('Main Introspection Handler', () => {
    test('should route information_schema.tables queries correctly', () => {
      const query = 'SELECT * FROM information_schema.tables';
      const result = handleIntrospectionQuery(query, mockConnState);

      expect(result.command).toBe('SELECT');
      expect(result.columns).toBeDefined();
      expect(result.rows).toBeDefined();
      expect(result.rowCount).toBeGreaterThan(0);
    });

    test('should route information_schema.columns queries correctly', () => {
      const query = 'SELECT * FROM information_schema.columns';
      const result = handleIntrospectionQuery(query, mockConnState);

      expect(result.command).toBe('SELECT');
      expect(result.columns).toBeDefined();
      expect(result.rows).toBeDefined();
      expect(result.rowCount).toBeGreaterThan(0);
    });

    test('should route pg_catalog queries correctly', () => {
      const query = 'SELECT * FROM pg_catalog.pg_tables';
      const result = handleIntrospectionQuery(query, mockConnState);

      expect(result.command).toBe('SELECT');
      expect(result.columns).toBeDefined();
      expect(result.rows).toBeDefined();
    });

    test('should handle unknown introspection queries gracefully', () => {
      const query = 'SELECT * FROM unknown_schema.unknown_table';
      const result = handleIntrospectionQuery(query, mockConnState);

      expect(result.command).toBe('SELECT');
      expect(result.columns[0].name).toBe('note');
      expect(result.rows[0][0]).toContain('not yet implemented');
    });
  });

  describe('Information Schema Tables', () => {
    test('should return correct table structure for information_schema.tables', () => {
      const result = handleInformationSchemaTables('', mockConnState);

      // Check column structure
      expect(result.columns).toHaveLength(4);
      expect(result.columns[0].name).toBe('table_catalog');
      expect(result.columns[1].name).toBe('table_schema');
      expect(result.columns[2].name).toBe('table_name');
      expect(result.columns[3].name).toBe('table_type');

      // Check data types
      expect(result.columns[0].dataTypeOID).toBe(DATA_TYPES.NAME);
      expect(result.columns[3].dataTypeOID).toBe(DATA_TYPES.TEXT);

      // Check that we have mock tables
      expect(result.rowCount).toBeGreaterThan(0);
      expect(result.rows[0]).toHaveLength(4);

      // Verify mock data structure
      const firstRow = result.rows[0];
      expect(firstRow[0]).toBe('postgres'); // table_catalog
      expect(firstRow[1]).toBe('public'); // table_schema
      expect(['users', 'posts']).toContain(firstRow[2]); // table_name
      expect(firstRow[3]).toBe('BASE TABLE'); // table_type
    });
  });

  describe('Information Schema Columns', () => {
    test('should return correct column structure for information_schema.columns', () => {
      const result = handleInformationSchemaColumns('', mockConnState);

      // Check column structure
      expect(result.columns).toHaveLength(9);
      expect(result.columns[0].name).toBe('table_catalog');
      expect(result.columns[3].name).toBe('column_name');
      expect(result.columns[7].name).toBe('data_type');

      // Check that we have columns from mock tables
      expect(result.rowCount).toBeGreaterThan(0);

      // Verify we have columns from both tables
      const columnNames = result.rows.map(row => row[3]); // column_name
      expect(columnNames).toContain('id');
      expect(columnNames).toContain('name');
      expect(columnNames).toContain('email');
    });

    test('should include proper data types for columns', () => {
      const result = handleInformationSchemaColumns('', mockConnState);

      // Find the 'id' column
      const idColumn = result.rows.find(row => row[3] === 'id');
      expect(idColumn).toBeDefined();
      expect(idColumn[7]).toBe('integer'); // data_type
      expect(idColumn[6]).toBe('NO'); // is_nullable

      // Find the 'name' column
      const nameColumn = result.rows.find(row => row[3] === 'name');
      expect(nameColumn).toBeDefined();
      expect(nameColumn[7]).toBe('character varying'); // data_type
      expect(nameColumn[6]).toBe('YES'); // is_nullable
    });
  });

  describe('Information Schema Schemata', () => {
    test('should return correct schema structure', () => {
      const result = handleInformationSchemaSchemata('', mockConnState);

      // Check column structure
      expect(result.columns).toHaveLength(3);
      expect(result.columns[0].name).toBe('catalog_name');
      expect(result.columns[1].name).toBe('schema_name');
      expect(result.columns[2].name).toBe('schema_owner');

      // Check that we have the expected schemas
      expect(result.rowCount).toBe(3);
      const schemaNames = result.rows.map(row => row[1]);
      expect(schemaNames).toContain('public');
      expect(schemaNames).toContain('information_schema');
      expect(schemaNames).toContain('pg_catalog');
    });
  });

  describe('PostgreSQL Catalog Queries', () => {
    test('should handle pg_catalog.pg_tables correctly', () => {
      const result = handlePgTables('', mockConnState);

      // Check column structure matches PostgreSQL pg_tables
      expect(result.columns).toHaveLength(8);
      expect(result.columns[0].name).toBe('schemaname');
      expect(result.columns[1].name).toBe('tablename');
      expect(result.columns[4].name).toBe('hasindexes');

      // Check data types
      expect(result.columns[4].dataTypeOID).toBe(DATA_TYPES.BOOL);

      // Verify we have tables
      expect(result.rowCount).toBeGreaterThan(0);
      const tableNames = result.rows.map(row => row[1]);
      expect(tableNames).toContain('users');
      expect(tableNames).toContain('posts');
    });

    test('should handle pg_catalog.pg_type correctly', () => {
      const result = handlePgType('', mockConnState);

      // Check column structure
      expect(result.columns).toHaveLength(5);
      expect(result.columns[0].name).toBe('oid');
      expect(result.columns[1].name).toBe('typname');

      // Check that we have common data types
      expect(result.rowCount).toBeGreaterThan(0);
      const typeNames = result.rows.map(row => row[1]);
      expect(typeNames).toContain('bool');
      expect(typeNames).toContain('int4');
      expect(typeNames).toContain('text');
      expect(typeNames).toContain('varchar');
    });

    test('should handle pg_catalog.pg_class correctly', () => {
      const result = handlePgClass('', mockConnState);

      // Check column structure
      expect(result.columns).toHaveLength(8);
      expect(result.columns[0].name).toBe('oid');
      expect(result.columns[1].name).toBe('relname');
      expect(result.columns[3].name).toBe('relkind');

      // Verify we have relations (tables)
      expect(result.rowCount).toBeGreaterThan(0);
      const relationNames = result.rows.map(row => row[1]);
      expect(relationNames).toContain('users');
      expect(relationNames).toContain('posts');

      // Check that all relations are marked as tables
      result.rows.forEach(row => {
        expect(row[3]).toBe('r'); // relkind = 'r' for ordinary table
      });
    });
  });

  describe('Query Integration', () => {
    test('should handle case-insensitive schema names', () => {
      const lowerQuery = 'select * from information_schema.tables';
      const upperQuery = 'SELECT * FROM INFORMATION_SCHEMA.TABLES';

      const lowerResult = handleIntrospectionQuery(lowerQuery, mockConnState);
      const upperResult = handleIntrospectionQuery(upperQuery, mockConnState);

      expect(lowerResult.rowCount).toBe(upperResult.rowCount);
      expect(lowerResult.columns).toEqual(upperResult.columns);
    });

    test('should route pg_catalog queries to correct handlers', () => {
      const query = "SELECT * FROM pg_catalog.pg_type WHERE typname = 'int4'";
      const result = handlePgCatalogQuery(query, mockConnState);

      expect(result.command).toBe('SELECT');
      expect(result.rowCount).toBeGreaterThan(0);
    });
  });
});
