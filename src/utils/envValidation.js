/**
 * Environment Variable Validation Utility
 * Provides comprehensive validation for environment variable parsing and format validation
 */

/**
 * Validation rules for environment variables
 */
const VALIDATION_RULES = {
  PG_MOCK_PORT: {
    type: 'number',
    min: 1,
    max: 65535,
    description: 'Port number must be between 1 and 65535',
  },
  PG_MOCK_HOST: {
    type: 'string',
    minLength: 1,
    maxLength: 253,
    pattern: /^[a-zA-Z0-9.-]+$/,
    description: 'Host must be a valid hostname or IP address',
  },
  PG_MOCK_MAX_CONNECTIONS: {
    type: 'number',
    min: 1,
    max: 10000,
    recommended: { min: 10, max: 1000 },
    description: 'Maximum connections must be between 1 and 10000',
  },
  PG_MOCK_CONNECTION_TIMEOUT: {
    type: 'number',
    min: 1000,
    max: 3600000, // 1 hour
    recommended: { min: 30000, max: 600000 },
    description: 'Connection timeout must be between 1000ms and 3600000ms (1 hour)',
  },
  PG_MOCK_LOG_LEVEL: {
    type: 'enum',
    values: ['error', 'warn', 'info', 'debug'],
    description: 'Log level must be one of: error, warn, info, debug',
  },
  PG_MOCK_ENABLE_LOGGING: {
    type: 'boolean',
    description: 'Enable logging must be true, false, 1, or 0',
  },
  PG_MOCK_SERVER_VERSION: {
    type: 'string',
    minLength: 1,
    maxLength: 50,
    pattern: /^[\d.]+ \(.+\)$/,
    description: 'Server version must match PostgreSQL version format (e.g., "13.0 (Mock)")',
  },
  PG_MOCK_DEFAULT_DATABASE: {
    type: 'string',
    minLength: 1,
    maxLength: 63,
    pattern: /^[a-zA-Z_][a-zA-Z0-9_$]*$/,
    description: 'Database name must be a valid PostgreSQL identifier',
  },
  PG_MOCK_DEFAULT_USER: {
    type: 'string',
    minLength: 1,
    maxLength: 63,
    pattern: /^[a-zA-Z_][a-zA-Z0-9_$]*$/,
    description: 'Username must be a valid PostgreSQL identifier',
  },
  PG_MOCK_DEFAULT_ENCODING: {
    type: 'enum',
    values: ['UTF8', 'LATIN1', 'SQL_ASCII', 'WIN1252'],
    description: 'Encoding must be a valid PostgreSQL encoding',
  },
  PG_MOCK_DEFAULT_TIMEZONE: {
    type: 'string',
    minLength: 1,
    maxLength: 50,
    description: 'Timezone must be a valid timezone identifier',
  },
  PG_MOCK_MAX_QUERY_LENGTH: {
    type: 'number',
    min: 1024,
    max: 104857600, // 100MB
    recommended: { min: 1024, max: 10485760 },
    description: 'Max query length must be between 1024 bytes and 100MB',
  },
  PG_MOCK_CLEANUP_INTERVAL: {
    type: 'number',
    min: 1000,
    max: 3600000,
    recommended: { min: 30000, max: 300000 },
    description: 'Cleanup interval must be between 1000ms and 3600000ms',
  },
  PG_MOCK_ENABLE_EXTENDED_PROTOCOL: {
    type: 'boolean',
    description: 'Enable extended protocol must be true, false, 1, or 0',
  },
  PG_MOCK_ENABLE_COPY_PROTOCOL: {
    type: 'boolean',
    description: 'Enable COPY protocol must be true, false, 1, or 0',
  },
  PG_MOCK_REQUIRE_AUTHENTICATION: {
    type: 'boolean',
    description: 'Require authentication must be true, false, 1, or 0',
  },
  PG_MOCK_SHUTDOWN_TIMEOUT: {
    type: 'number',
    min: 1000,
    max: 300000,
    description: 'Shutdown timeout must be between 1000ms and 300000ms (5 minutes)',
  },
  PG_MOCK_SHUTDOWN_DRAIN_TIMEOUT: {
    type: 'number',
    min: 1000,
    max: 60000,
    description: 'Shutdown drain timeout must be between 1000ms and 60000ms',
  },
  PG_MOCK_ENABLE_SSL: {
    type: 'boolean',
    description: 'Enable SSL/TLS support must be true, false, 1, or 0',
  },
  PG_MOCK_SSL_PORT: {
    type: 'number',
    min: 1,
    max: 65535,
    description: 'SSL port number must be between 1 and 65535',
  },
  PG_MOCK_SSL_CERT_PATH: {
    type: 'string',
    minLength: 1,
    maxLength: 500,
    description: 'SSL certificate path must be a valid file path',
  },
  PG_MOCK_SSL_KEY_PATH: {
    type: 'string',
    minLength: 1,
    maxLength: 500,
    description: 'SSL private key path must be a valid file path',
  },
  PG_MOCK_SSL_CA_PATH: {
    type: 'string',
    minLength: 1,
    maxLength: 500,
    description: 'SSL CA certificate path must be a valid file path',
  },
  PG_MOCK_SSL_REJECT_UNAUTHORIZED: {
    type: 'boolean',
    description: 'SSL reject unauthorized must be true, false, 1, or 0',
  },
  PG_MOCK_SSL_MIN_VERSION: {
    type: 'enum',
    values: ['TLSv1', 'TLSv1.1', 'TLSv1.2', 'TLSv1.3'],
    description: 'SSL minimum version must be one of: TLSv1, TLSv1.1, TLSv1.2, TLSv1.3',
  },
  PG_MOCK_SSL_MAX_VERSION: {
    type: 'enum',
    values: ['TLSv1', 'TLSv1.1', 'TLSv1.2', 'TLSv1.3'],
    description: 'SSL maximum version must be one of: TLSv1, TLSv1.1, TLSv1.2, TLSv1.3',
  },
  // Authentication method and SCRAM iterations
  PG_MOCK_AUTH_METHOD: {
    type: 'enum',
    values: ['trust', 'scram-sha-256'],
    description: 'Authentication method must be one of: trust, scram-sha-256',
  },
  PG_MOCK_SCRAM_ITERATIONS: {
    type: 'number',
    min: 1000,
    max: 100000,
    recommended: { min: 4096, max: 10000 },
    description: 'SCRAM iterations must be between 1000 and 100000',
  },
  PG_MOCK_USERNAME: {
    type: 'string',
    minLength: 1,
    maxLength: 63,
    pattern: /^[a-zA-Z_][a-zA-Z0-9_$]*$/,
    description: 'Mock username must be a valid PostgreSQL identifier',
  },
  PG_MOCK_PASSWORD: {
    type: 'string',
    minLength: 1,
    maxLength: 255,
    description: 'Mock password must be between 1 and 255 characters',
  },
};

/**
 * Validates environment variable values according to defined rules
 * @param {string} envVar - Environment variable name
 * @param {string} value - Raw string value from environment
 * @returns {Object} Validation result with parsed value, errors, and warnings
 */
function validateEnvironmentVariable(envVar, value) {
  const rule = VALIDATION_RULES[envVar];

  if (!rule) {
    return {
      isValid: true,
      parsedValue: value,
      errors: [],
      warnings: [`Unknown environment variable: ${envVar}`],
    };
  }

  const result = {
    isValid: true,
    parsedValue: null,
    errors: [],
    warnings: [],
  };

  try {
    // Parse the value based on type
    switch (rule.type) {
      case 'number':
        result.parsedValue = parseNumber(value, rule, envVar);
        break;
      case 'boolean':
        result.parsedValue = parseBoolean(value, rule, envVar);
        break;
      case 'enum':
        result.parsedValue = parseEnum(value, rule, envVar);
        break;
      case 'string':
      default:
        result.parsedValue = parseString(value, rule, envVar);
        break;
    }

    // Add warnings for values outside recommended ranges
    if (rule.recommended && rule.type === 'number') {
      if (result.parsedValue < rule.recommended.min) {
        result.warnings.push(
          `${envVar}: Value ${result.parsedValue} is below recommended minimum ${rule.recommended.min}`
        );
      } else if (result.parsedValue > rule.recommended.max) {
        result.warnings.push(
          `${envVar}: Value ${result.parsedValue} is above recommended maximum ${rule.recommended.max}`
        );
      }
    }
  } catch (error) {
    result.isValid = false;
    result.errors.push(`${envVar}: ${error.message}`);
  }

  return result;
}

/**
 * Parses and validates a numeric environment variable
 * @param {string} value - Raw value
 * @param {Object} rule - Validation rule
 * @param {string} envVar - Environment variable name
 * @returns {number} Parsed number
 * @throws {Error} If validation fails
 */
function parseNumber(value, rule, _envVar) {
  const num = parseInt(value, 10);

  if (isNaN(num)) {
    throw new Error(`Invalid number format: "${value}". ${rule.description}`);
  }

  if (rule.min !== undefined && num < rule.min) {
    throw new Error(`Value ${num} is below minimum ${rule.min}. ${rule.description}`);
  }

  if (rule.max !== undefined && num > rule.max) {
    throw new Error(`Value ${num} exceeds maximum ${rule.max}. ${rule.description}`);
  }

  return num;
}

/**
 * Parses and validates a boolean environment variable
 * @param {string} value - Raw value
 * @param {Object} rule - Validation rule
 * @param {string} envVar - Environment variable name
 * @returns {boolean} Parsed boolean
 * @throws {Error} If validation fails
 */
function parseBoolean(value, rule, _envVar) {
  const lowerValue = value.toLowerCase();

  if (['true', '1', 'yes', 'on'].includes(lowerValue)) {
    return true;
  }

  if (['false', '0', 'no', 'off'].includes(lowerValue)) {
    return false;
  }

  throw new Error(`Invalid boolean value: "${value}". ${rule.description}`);
}

/**
 * Parses and validates an enum environment variable
 * @param {string} value - Raw value
 * @param {Object} rule - Validation rule
 * @param {string} envVar - Environment variable name
 * @returns {string} Validated value
 * @throws {Error} If validation fails
 */
function parseEnum(value, rule, _envVar) {
  if (!rule.values.includes(value)) {
    throw new Error(`Invalid value: "${value}". ${rule.description}`);
  }

  return value;
}

/**
 * Parses and validates a string environment variable
 * @param {string} value - Raw value
 * @param {Object} rule - Validation rule
 * @param {string} envVar - Environment variable name
 * @returns {string} Validated value
 * @throws {Error} If validation fails
 */
function parseString(value, rule, _envVar) {
  if (rule.minLength !== undefined && value.length < rule.minLength) {
    throw new Error(`Value too short (${value.length} chars). ${rule.description}`);
  }

  if (rule.maxLength !== undefined && value.length > rule.maxLength) {
    throw new Error(`Value too long (${value.length} chars). ${rule.description}`);
  }

  if (rule.pattern && !rule.pattern.test(value)) {
    throw new Error(`Value "${value}" does not match required format. ${rule.description}`);
  }

  return value;
}

/**
 * Validates all environment variables at startup
 * @returns {Object} Comprehensive validation result
 */
function validateAllEnvironmentVariables() {
  const result = {
    isValid: true,
    errors: [],
    warnings: [],
    validatedVariables: {},
    skippedVariables: [],
  };

  // Check all known PG_MOCK_ environment variables
  for (const envVar of Object.keys(VALIDATION_RULES)) {
    const value = process.env[envVar];

    if (value !== undefined) {
      const validation = validateEnvironmentVariable(envVar, value);

      result.validatedVariables[envVar] = {
        originalValue: value,
        parsedValue: validation.parsedValue,
        isValid: validation.isValid,
      };

      if (!validation.isValid) {
        result.isValid = false;
        result.errors.push(...validation.errors);
      }

      result.warnings.push(...validation.warnings);
    }
  }

  // Check for unknown PG_MOCK_ variables
  for (const envVar of Object.keys(process.env)) {
    if (envVar.startsWith('PG_MOCK_') && !VALIDATION_RULES[envVar]) {
      result.skippedVariables.push(envVar);
      result.warnings.push(`Unknown environment variable: ${envVar}`);
    }
  }

  return result;
}

/**
 * Gets validation rules for a specific environment variable
 * @param {string} envVar - Environment variable name
 * @returns {Object|null} Validation rule or null if not found
 */
function getValidationRule(envVar) {
  return VALIDATION_RULES[envVar] || null;
}

/**
 * Gets all available validation rules
 * @returns {Object} All validation rules
 */
function getAllValidationRules() {
  return { ...VALIDATION_RULES };
}

/**
 * Formats validation errors for display
 * @param {Array} errors - Array of error messages
 * @returns {string} Formatted error message
 */
function formatValidationErrors(errors) {
  if (errors.length === 0) {
    return '';
  }

  return [
    'Environment Variable Validation Errors:',
    ...errors.map(error => `  - ${error}`),
    '',
    'Please check your environment variables and try again.',
  ].join('\n');
}

/**
 * Formats validation warnings for display
 * @param {Array} warnings - Array of warning messages
 * @returns {string} Formatted warning message
 */
function formatValidationWarnings(warnings) {
  if (warnings.length === 0) {
    return '';
  }

  return [
    'Environment Variable Validation Warnings:',
    ...warnings.map(warning => `  - ${warning}`),
    '',
  ].join('\n');
}

module.exports = {
  validateEnvironmentVariable,
  validateAllEnvironmentVariables,
  getValidationRule,
  getAllValidationRules,
  formatValidationErrors,
  formatValidationWarnings,
  VALIDATION_RULES,
};
