/**
 * Jest setup configuration to reduce log noise during tests
 */

// Set environment variables to minimize logging during tests
process.env.LOG_LEVEL = 'error';
process.env.QUIET_MODE = 'true';
process.env.NODE_ENV = 'test';

// Override console methods to reduce noise (but preserve error logs)
const originalConsoleLog = console.log;
const originalConsoleWarn = console.warn;

// Only suppress non-error console output during tests
console.log = (...args) => {
  // Allow logs that seem to be from test assertions or failures
  const message = args.join(' ');
  if (
    message.includes('FAIL') ||
    message.includes('PASS') ||
    message.includes('✓') ||
    message.includes('✗')
  ) {
    originalConsoleLog(...args);
  }
  // Suppress other logs unless in debug mode
};

console.info = () => {}; // Suppress info logs
console.debug = () => {}; // Suppress debug logs

// Keep warnings and errors visible (no change needed for console.error)
console.warn = originalConsoleWarn;

// Restore console methods after each test to avoid interfering with test output
afterEach(() => {
  // Keep the suppression active - only restore if explicitly needed
});
