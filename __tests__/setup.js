/**
 * Jest setup file for pg-wire-mock tests
 * Configures global test environment and utilities
 */

// Increase timeout for integration tests
jest.setTimeout(30000);

// Global test utilities
global.testUtils = {
  /**
   * Creates a delay for async testing
   * @param {number} ms - Milliseconds to delay
   * @returns {Promise<void>}
   */
  delay: (ms) => new Promise(resolve => setTimeout(resolve, ms)),

  /**
   * Generates a random port for testing
   * @returns {number} Random port between 9000-9999
   */
  getRandomPort: () => Math.floor(Math.random() * 1000) + 9000,

  /**
   * Creates a mock connection object for testing
   * @param {string} id - Connection ID
   * @returns {Object} Mock connection
   */
  createMockConnection: (id = 'test-conn') => ({
    id,
    remoteAddress: '127.0.0.1',
    remotePort: 12345,
    createdAt: Date.now(),
    state: 'active',
  }),

  /**
   * Creates a mock query for testing
   * @param {string} type - Query type (SELECT, INSERT, etc.)
   * @returns {string} Mock SQL query
   */
  createMockQuery: (type = 'SELECT') => {
    const queries = {
      SELECT: 'SELECT * FROM users WHERE id = 1',
      INSERT: 'INSERT INTO users (name, email) VALUES (?, ?)',
      UPDATE: 'UPDATE users SET name = ? WHERE id = ?',
      DELETE: 'DELETE FROM users WHERE id = ?',
      SHOW: 'SHOW TABLES',
      BEGIN: 'BEGIN TRANSACTION',
      COMMIT: 'COMMIT',
      ROLLBACK: 'ROLLBACK',
    };
    return queries[type] || 'SELECT 1';
  },
};

// Suppress console output during tests unless explicitly needed
const originalConsole = { ...console };
beforeAll(() => {
  if (process.env.NODE_ENV === 'test') {
    console.log = jest.fn();
    console.info = jest.fn();
    console.warn = jest.fn();
    console.error = jest.fn();
  }
});

afterAll(() => {
  if (process.env.NODE_ENV === 'test') {
    console.log = originalConsole.log;
    console.info = originalConsole.info;
    console.warn = originalConsole.warn;
    console.error = originalConsole.error;
  }
});

// Handle unhandled promise rejections in tests
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

// Clean up any hanging resources after each test
afterEach(() => {
  // Force garbage collection if available (for memory leak detection)
  if (global.gc) {
    global.gc();
  }
});
