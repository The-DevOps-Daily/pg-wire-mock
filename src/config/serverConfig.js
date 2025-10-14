/**
 * Server Configuration Management
 * Handles configuration loading, validation, and defaults
 */

const {
  validateAllEnvironmentVariables,
  formatValidationErrors,
  formatValidationWarnings,
} = require('../utils/envValidation');

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

  // Error tracking (optional)
  errorTracking: {
    enabled: false,
    project: 'pg-wire-mock',
  },

  // Query logging settings
  queryLogging: {
    enableDetailedLogging: true, // Enable detailed query logging
    logParameters: true, // Log query parameters (with sanitization)
    logExecutionTime: true, // Log query execution times
    maxQueryLength: 500, // Maximum query length to log (truncate longer queries)
    sanitizeParameters: true, // Sanitize sensitive data in parameters
    logSlowQueries: true, // Enable slow query logging
    slowQueryThreshold: 1000, // Slow query threshold in milliseconds
    enableAnalytics: true, // Track query analytics
    enableFileLogging: false, // Enable file-based query logging
    logDirectory: './logs', // Directory for log files
    maxLogFileSize: 10485760, // Max log file size in bytes (10MB)
    maxLogFiles: 5, // Maximum number of log files to keep
    logRotationPattern: 'YYYY-MM-DD', // Log rotation pattern
  },

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

  // Custom data types
  customTypes: {},

  // Security settings
  requireAuthentication: true, // Enable authentication by default when auth method is set
  authMethod: 'trust', // trust, scram-sha-256
  scramIterations: 4096, // SCRAM iteration count
  username: 'postgres', // Mock username for authentication
  password: 'password', // Mock password for authentication

  // SSL/TLS settings
  enableSSL: false,
  sslPort: null, // Use same port as regular connection if null
  sslCertPath: './certs/server.crt',
  sslKeyPath: './certs/server.key',
  sslCaPath: null, // Optional CA certificate path
  sslRejectUnauthorized: false, // For self-signed certificates in development
  sslMinVersion: 'TLSv1.2',
  sslMaxVersion: 'TLSv1.3',
  sslCipherSuites: null, // Use default cipher suites if null

  // Shutdown settings
  shutdownTimeout: 30000,
  shutdownDrainTimeout: 10000,
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
  PG_MOCK_AUTH_METHOD: { key: 'authMethod', type: 'string' },
  PG_MOCK_SCRAM_ITERATIONS: { key: 'scramIterations', type: 'number' },
  PG_MOCK_USERNAME: { key: 'username', type: 'string' },
  PG_MOCK_PASSWORD: { key: 'password', type: 'string' },
  PG_MOCK_ENABLE_SSL: { key: 'enableSSL', type: 'boolean' },
  PG_MOCK_SSL_PORT: { key: 'sslPort', type: 'number' },
  PG_MOCK_SSL_CERT_PATH: { key: 'sslCertPath', type: 'string' },
  PG_MOCK_SSL_KEY_PATH: { key: 'sslKeyPath', type: 'string' },
  PG_MOCK_SSL_CA_PATH: { key: 'sslCaPath', type: 'string' },
  PG_MOCK_SSL_REJECT_UNAUTHORIZED: { key: 'sslRejectUnauthorized', type: 'boolean' },
  PG_MOCK_SSL_MIN_VERSION: { key: 'sslMinVersion', type: 'string' },
  PG_MOCK_SSL_MAX_VERSION: { key: 'sslMaxVersion', type: 'string' },
  PG_MOCK_SHUTDOWN_TIMEOUT: { key: 'shutdownTimeout', type: 'number' },
  PG_MOCK_SHUTDOWN_DRAIN_TIMEOUT: { key: 'shutdownDrainTimeout', type: 'number' },

  // Query logging environment variables
  PG_MOCK_QUERY_DETAILED_LOGGING: { key: 'queryLogging.enableDetailedLogging', type: 'boolean' },
  PG_MOCK_QUERY_LOG_PARAMETERS: { key: 'queryLogging.logParameters', type: 'boolean' },
  PG_MOCK_QUERY_LOG_EXECUTION_TIME: { key: 'queryLogging.logExecutionTime', type: 'boolean' },
  PG_MOCK_QUERY_MAX_LENGTH: { key: 'queryLogging.maxQueryLength', type: 'number' },
  PG_MOCK_QUERY_SANITIZE_PARAMS: { key: 'queryLogging.sanitizeParameters', type: 'boolean' },
  PG_MOCK_QUERY_LOG_SLOW: { key: 'queryLogging.logSlowQueries', type: 'boolean' },
  PG_MOCK_QUERY_SLOW_THRESHOLD: { key: 'queryLogging.slowQueryThreshold', type: 'number' },
  PG_MOCK_QUERY_ANALYTICS: { key: 'queryLogging.enableAnalytics', type: 'boolean' },
  PG_MOCK_QUERY_FILE_LOGGING: { key: 'queryLogging.enableFileLogging', type: 'boolean' },
  PG_MOCK_QUERY_LOG_DIR: { key: 'queryLogging.logDirectory', type: 'string' },
  PG_MOCK_QUERY_MAX_FILE_SIZE: { key: 'queryLogging.maxLogFileSize', type: 'number' },
  PG_MOCK_QUERY_MAX_FILES: { key: 'queryLogging.maxLogFiles', type: 'number' },

  // Error tracking environment variables
  PG_MOCK_ERROR_TRACKING_ENABLED: { key: 'errorTracking.enabled', type: 'boolean' },
  PG_MOCK_ERROR_TRACKING_PROJECT: { key: 'errorTracking.project', type: 'string' },
};

/**
 * Loads configuration from environment variables and defaults
 * @returns {Object} Complete configuration object with validation
 */
function loadConfig() {
  // First validate all environment variables
  const envValidation = validateAllEnvironmentVariables();

  if (!envValidation.isValid) {
    const errorMsg = formatValidationErrors(envValidation.errors);
    throw new Error(`Environment variable validation failed:\n${errorMsg}`);
  }

  // Log warnings if any
  if (envValidation.warnings.length > 0) {
    const warningMsg = formatValidationWarnings(envValidation.warnings);
    console.warn(warningMsg);
  }

  const config = { ...DEFAULT_CONFIG };

  // Load from validated environment variables
  for (const [envVar, mapping] of Object.entries(ENV_MAPPING)) {
    const validatedVar = envValidation.validatedVariables[envVar];
    if (validatedVar && validatedVar.isValid) {
      config[mapping.key] = validatedVar.parsedValue;
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

  // Validate SSL settings if SSL is enabled
  if (config.enableSSL) {
    if (config.sslCertPath && typeof config.sslCertPath !== 'string') {
      errors.push('sslCertPath must be a string');
    }
    if (config.sslKeyPath && typeof config.sslKeyPath !== 'string') {
      errors.push('sslKeyPath must be a string');
    }
    if (
      config.sslPort &&
      (!Number.isInteger(config.sslPort) || config.sslPort < 1 || config.sslPort > 65535)
    ) {
      errors.push('sslPort must be an integer between 1 and 65535');
    }
    const validTlsVersions = ['TLSv1', 'TLSv1.1', 'TLSv1.2', 'TLSv1.3'];
    if (config.sslMinVersion && !validTlsVersions.includes(config.sslMinVersion)) {
      errors.push(`sslMinVersion must be one of: ${validTlsVersions.join(', ')}`);
    }
    if (config.sslMaxVersion && !validTlsVersions.includes(config.sslMaxVersion)) {
      errors.push(`sslMaxVersion must be one of: ${validTlsVersions.join(', ')}`);
    }
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
    {
      key: 'enableSSL',
      env: 'PG_MOCK_ENABLE_SSL',
      type: 'boolean',
      default: DEFAULT_CONFIG.enableSSL,
      description: 'Enable SSL/TLS support',
    },
    {
      key: 'sslCertPath',
      env: 'PG_MOCK_SSL_CERT_PATH',
      type: 'string',
      default: DEFAULT_CONFIG.sslCertPath,
      description: 'Path to SSL certificate file',
    },
    {
      key: 'sslKeyPath',
      env: 'PG_MOCK_SSL_KEY_PATH',
      type: 'string',
      default: DEFAULT_CONFIG.sslKeyPath,
      description: 'Path to SSL private key file',
    },
  ];
}

/**
 * Loads and validates configuration with enhanced error reporting
 * @returns {Object} Configuration with validation results
 */
function loadConfigWithValidation() {
  const envValidation = validateAllEnvironmentVariables();

  const result = {
    config: null,
    isValid: envValidation.isValid,
    errors: envValidation.errors,
    warnings: envValidation.warnings,
    validatedVariables: envValidation.validatedVariables,
  };

  if (envValidation.isValid) {
    try {
      result.config = loadConfig();
    } catch (error) {
      result.isValid = false;
      result.errors.push(error.message);
    }
  }

  return result;
}

/**
 * Gets environment variable validation summary
 * @returns {Object} Validation summary with statistics
 */
function getValidationSummary() {
  const envValidation = validateAllEnvironmentVariables();

  return {
    totalVariables: Object.keys(envValidation.validatedVariables).length,
    validVariables: Object.values(envValidation.validatedVariables).filter(v => v.isValid).length,
    invalidVariables: Object.values(envValidation.validatedVariables).filter(v => !v.isValid)
      .length,
    unknownVariables: envValidation.skippedVariables.length,
    warningCount: envValidation.warnings.length,
    errorCount: envValidation.errors.length,
    isValid: envValidation.isValid,
  };
}

/**
 * Registers a custom data type
 * @param {Object} typeConfig - Custom type configuration
 * @param {string} typeConfig.name - Type name
 * @param {number} typeConfig.oid - PostgreSQL type OID (must be unique and > 100000)
 * @param {Function} typeConfig.encode - Function to encode values to text format
 * @param {Function} typeConfig.decode - Function to decode values from text format
 * @param {number} [typeConfig.typlen] - Type length (-1 for variable length, default: -1)
 * @param {string} [typeConfig.typtype] - Type category ('b' for base type, default: 'b')
 * @param {Object} config - Server configuration object to register type in
 * @returns {void}
 */
function registerCustomType(typeConfig, config = DEFAULT_CONFIG) {
  // Validate type configuration
  if (!typeConfig || typeof typeConfig !== 'object') {
    throw new Error('Custom type configuration must be an object');
  }

  if (!typeConfig.name || typeof typeConfig.name !== 'string') {
    throw new Error('Custom type must have a name (string)');
  }

  if (!typeConfig.oid || typeof typeConfig.oid !== 'number' || typeConfig.oid < 100000) {
    throw new Error('Custom type must have a unique OID >= 100000');
  }

  if (!typeConfig.encode || typeof typeConfig.encode !== 'function') {
    throw new Error('Custom type must have an encode function');
  }

  if (!typeConfig.decode || typeof typeConfig.decode !== 'function') {
    throw new Error('Custom type must have a decode function');
  }

  // Check for OID conflicts
  if (config.customTypes[typeConfig.oid]) {
    throw new Error(`Custom type OID ${typeConfig.oid} is already registered`);
  }

  // Check for name conflicts
  const existingType = Object.values(config.customTypes).find(
    type => type.name.toLowerCase() === typeConfig.name.toLowerCase()
  );
  if (existingType) {
    throw new Error(`Custom type name '${typeConfig.name}' is already registered`);
  }

  // Register the type
  config.customTypes[typeConfig.oid] = {
    name: typeConfig.name.toLowerCase(),
    oid: typeConfig.oid,
    encode: typeConfig.encode,
    decode: typeConfig.decode,
    typlen: typeConfig.typlen || -1,
    typtype: typeConfig.typtype || 'b',
  };
}

/**
 * Gets a custom type by OID
 * @param {number} oid - Type OID
 * @param {Object} config - Server configuration object
 * @returns {Object|null} Custom type configuration or null if not found
 */
function getCustomType(oid, config = DEFAULT_CONFIG) {
  if (!config || !config.customTypes) {
    return null;
  }
  return config.customTypes[oid] || null;
}

/**
 * Gets a custom type by name
 * @param {string} name - Type name
 * @param {Object} config - Server configuration object
 * @returns {Object|null} Custom type configuration or null if not found
 */
function getCustomTypeByName(name, config = DEFAULT_CONFIG) {
  if (!name || typeof name !== 'string' || !config || !config.customTypes) {
    return null;
  }

  return (
    Object.values(config.customTypes).find(
      type => type.name.toLowerCase() === name.toLowerCase()
    ) || null
  );
}

/**
 * Gets all registered custom types
 * @param {Object} config - Server configuration object
 * @returns {Array} Array of custom type configurations
 */
function getAllCustomTypes(config = DEFAULT_CONFIG) {
  if (!config || !config.customTypes) {
    return [];
  }
  return Object.values(config.customTypes);
}

module.exports = {
  DEFAULT_CONFIG,
  ENV_MAPPING,
  loadConfig,
  loadConfigWithValidation,
  parseConfigValue,
  validateConfig,
  createServerParameters,
  getConfigDocumentation,
  getValidationSummary,
  registerCustomType,
  getCustomType,
  getCustomTypeByName,
  getAllCustomTypes,
};
