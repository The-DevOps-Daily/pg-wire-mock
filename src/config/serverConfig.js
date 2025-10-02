/**
 * Server Configuration Management
 * Handles configuration loading, validation, and defaults
 */

/**
 * Default server configuration
 */
const DEFAULT_CONFIG = {
  // Server settings
  port: 5432,
  host: 'localhost',
  maxConnections: 100,
  connectionTimeout: 300000, // 5 minutes

  // Logging settings
  enableLogging: true,
  logLevel: 'info', // error, warn, info, debug

  // Protocol settings
  protocolVersion: '3.0',
  serverVersion: '13.0 (Mock)',

  // Database settings
  defaultDatabase: 'postgres',
  defaultUser: 'postgres',
  defaultEncoding: 'UTF8',
  defaultTimezone: 'UTC',

  // Performance settings
  maxQueryLength: 1048576, // 1MB
  maxParameterLength: 65536, // 64KB
  cleanupInterval: 60000, // 1 minute

  // Feature flags
  enableExtendedProtocol: true,
  enableCopyProtocol: false,
  enableFunctionCalls: false,
  enableNotifications: false,

  // Security settings (for future use)
  requireAuthentication: false,
  allowPasswordAuthentication: true,
  allowCleartextPasswords: false,
};

/**
 * Environment variable mapping
 */
const ENV_MAPPING = {
  PG_MOCK_PORT: { key: 'port', type: 'number' },
  PG_MOCK_HOST: { key: 'host', type: 'string' },
  PG_MOCK_MAX_CONNECTIONS: { key: 'maxConnections', type: 'number' },
  PG_MOCK_CONNECTION_TIMEOUT: { key: 'connectionTimeout', type: 'number' },
  PG_MOCK_ENABLE_LOGGING: { key: 'enableLogging', type: 'boolean' },
  PG_MOCK_LOG_LEVEL: { key: 'logLevel', type: 'string' },
  PG_MOCK_SERVER_VERSION: { key: 'serverVersion', type: 'string' },
  PG_MOCK_DEFAULT_DATABASE: { key: 'defaultDatabase', type: 'string' },
  PG_MOCK_DEFAULT_USER: { key: 'defaultUser', type: 'string' },
  PG_MOCK_DEFAULT_ENCODING: { key: 'defaultEncoding', type: 'string' },
  PG_MOCK_DEFAULT_TIMEZONE: { key: 'defaultTimezone', type: 'string' },
  PG_MOCK_MAX_QUERY_LENGTH: { key: 'maxQueryLength', type: 'number' },
  PG_MOCK_CLEANUP_INTERVAL: { key: 'cleanupInterval', type: 'number' },
  PG_MOCK_ENABLE_EXTENDED_PROTOCOL: { key: 'enableExtendedProtocol', type: 'boolean' },
  PG_MOCK_ENABLE_COPY_PROTOCOL: { key: 'enableCopyProtocol', type: 'boolean' },
  PG_MOCK_REQUIRE_AUTHENTICATION: { key: 'requireAuthentication', type: 'boolean' },
};

/**
 * Loads configuration from environment variables and defaults
 * @returns {Object} Complete configuration object
 */
function loadConfig() {
  const config = { ...DEFAULT_CONFIG };

  // Load from environment variables
  for (const [envVar, mapping] of Object.entries(ENV_MAPPING)) {
    const value = process.env[envVar];
    if (value !== undefined) {
      config[mapping.key] = parseConfigValue(value, mapping.type);
    }
  }

  return config;
}

/**
 * Parses a configuration value based on its expected type
 * @param {string} value - Raw value from environment
 * @param {string} type - Expected type (string, number, boolean)
 * @returns {any} Parsed value
 */
function parseConfigValue(value, type) {
  switch (type) {
    case 'number': {
      const num = parseInt(value, 10);
      return isNaN(num) ? null : num;
    }

    case 'boolean':
      return value.toLowerCase() === 'true' || value === '1';

    case 'string':
    default:
      return value;
  }
}

/**
 * Validates configuration values
 * @param {Object} config - Configuration to validate
 * @returns {Object} Validation result with isValid and errors
 */
function validateConfig(config) {
  const errors = [];

  // Validate port
  if (!Number.isInteger(config.port) || config.port < 1 || config.port > 65535) {
    errors.push('Port must be an integer between 1 and 65535');
  }

  // Validate host
  if (!config.host || typeof config.host !== 'string') {
    errors.push('Host must be a non-empty string');
  }

  // Validate max connections
  if (!Number.isInteger(config.maxConnections) || config.maxConnections < 1) {
    errors.push('maxConnections must be a positive integer');
  }

  // Validate connection timeout
  if (!Number.isInteger(config.connectionTimeout) || config.connectionTimeout < 1000) {
    errors.push('connectionTimeout must be at least 1000ms');
  }

  // Validate log level
  const validLogLevels = ['error', 'warn', 'info', 'debug'];
  if (!validLogLevels.includes(config.logLevel)) {
    errors.push(`logLevel must be one of: ${validLogLevels.join(', ')}`);
  }

  // Validate max query length
  if (!Number.isInteger(config.maxQueryLength) || config.maxQueryLength < 1024) {
    errors.push('maxQueryLength must be at least 1024 bytes');
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}

/**
 * Creates PostgreSQL server parameters from configuration
 * @param {Object} config - Server configuration
 * @returns {Object} PostgreSQL server parameters
 */
function createServerParameters(config) {
  return {
    server_version: config.serverVersion,
    server_encoding: config.defaultEncoding,
    client_encoding: config.defaultEncoding,
    application_name: '',
    is_superuser: 'off',
    session_authorization: config.defaultUser,
    DateStyle: 'ISO, MDY',
    IntervalStyle: 'postgres',
    TimeZone: config.defaultTimezone,
    integer_datetimes: 'on',
    standard_conforming_strings: 'on',
  };
}

/**
 * Gets configuration documentation
 * @returns {Array} Array of configuration option descriptions
 */
function getConfigDocumentation() {
  return [
    {
      key: 'port',
      env: 'PG_MOCK_PORT',
      type: 'number',
      default: DEFAULT_CONFIG.port,
      description: 'Port number to listen on',
    },
    {
      key: 'host',
      env: 'PG_MOCK_HOST',
      type: 'string',
      default: DEFAULT_CONFIG.host,
      description: 'Host address to bind to',
    },
    {
      key: 'maxConnections',
      env: 'PG_MOCK_MAX_CONNECTIONS',
      type: 'number',
      default: DEFAULT_CONFIG.maxConnections,
      description: 'Maximum number of concurrent connections',
    },
    {
      key: 'connectionTimeout',
      env: 'PG_MOCK_CONNECTION_TIMEOUT',
      type: 'number',
      default: DEFAULT_CONFIG.connectionTimeout,
      description: 'Connection timeout in milliseconds',
    },
    {
      key: 'enableLogging',
      env: 'PG_MOCK_ENABLE_LOGGING',
      type: 'boolean',
      default: DEFAULT_CONFIG.enableLogging,
      description: 'Enable server logging',
    },
    {
      key: 'logLevel',
      env: 'PG_MOCK_LOG_LEVEL',
      type: 'string',
      default: DEFAULT_CONFIG.logLevel,
      description: 'Log level (error, warn, info, debug)',
    },
    {
      key: 'serverVersion',
      env: 'PG_MOCK_SERVER_VERSION',
      type: 'string',
      default: DEFAULT_CONFIG.serverVersion,
      description: 'PostgreSQL version string to report',
    },
    {
      key: 'defaultDatabase',
      env: 'PG_MOCK_DEFAULT_DATABASE',
      type: 'string',
      default: DEFAULT_CONFIG.defaultDatabase,
      description: 'Default database name',
    },
    {
      key: 'defaultUser',
      env: 'PG_MOCK_DEFAULT_USER',
      type: 'string',
      default: DEFAULT_CONFIG.defaultUser,
      description: 'Default user name',
    },
  ];
}

module.exports = {
  DEFAULT_CONFIG,
  ENV_MAPPING,
  loadConfig,
  parseConfigValue,
  validateConfig,
  createServerParameters,
  getConfigDocumentation,
};
