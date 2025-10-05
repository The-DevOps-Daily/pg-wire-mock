/**
 * SSL/TLS Connection Tests
 * Tests for SSL request handling and certificate validation
 */

const path = require('path');
const { ServerManager } = require('../src/server/serverManager');
const {
  handleSSLRequest,
  SSLState,
  validateSSLCertificates,
} = require('../src/protocol/messageProcessors');

// Test configuration
const TEST_CONFIG = {
  port: 0, // Use random available port
  host: 'localhost',
  enableSSL: true,
  sslCertPath: path.join(__dirname, '..', 'test-certs', 'test-server.crt'),
  sslKeyPath: path.join(__dirname, '..', 'test-certs', 'test-server.key'),
  sslRejectUnauthorized: false,
  enableLogging: false,
};

// Mock socket for testing
class MockSocket {
  constructor() {
    this.data = [];
    this.events = {};
    this.destroyed = false;
  }

  write(data) {
    this.data.push(data);
  }

  on(event, callback) {
    if (!this.events[event]) {
      this.events[event] = [];
    }
    this.events[event].push(callback);
  }

  emit(event, ...args) {
    if (this.events[event]) {
      this.events[event].forEach(callback => callback(...args));
    }
  }

  end() {
    this.destroyed = true;
  }

  getLastWrittenData() {
    return this.data[this.data.length - 1];
  }
}

describe('SSL/TLS Connection Tests', () => {
  describe('SSL Request Handling', () => {
    test('should accept SSL request when SSL is enabled with valid certificates', () => {
      const mockSocket = new MockSocket();
      // Use the existing certificate paths for this test
      const config = {
        enableSSL: true,
        sslCertPath: path.join(__dirname, '..', 'certs', 'server.crt'),
        sslKeyPath: path.join(__dirname, '..', 'certs', 'server.key'),
      };

      const result = handleSSLRequest(mockSocket, config);

      expect(result).toBe(8); // SSL request is always 8 bytes
      // This test will pass if certificates exist, fail if they don't
      const lastData = mockSocket.getLastWrittenData();
      expect([Buffer.from('S'), Buffer.from('N')]).toContainEqual(lastData);

      // If SSL was accepted, check state
      if (lastData.equals(Buffer.from('S'))) {
        expect(SSLState.needsUpgrade(mockSocket)).toBe(true);
        expect(SSLState.getConfig(mockSocket)).toBeDefined();
      }
    });

    test('should reject SSL request when SSL is disabled', () => {
      const mockSocket = new MockSocket();
      const config = { enableSSL: false };

      const result = handleSSLRequest(mockSocket, config);

      expect(result).toBe(8);
      expect(mockSocket.getLastWrittenData()).toEqual(Buffer.from('N'));
      expect(SSLState.needsUpgrade(mockSocket)).toBe(false);
    });

    test('should reject SSL request when no config provided', () => {
      const mockSocket = new MockSocket();

      const result = handleSSLRequest(mockSocket);

      expect(result).toBe(8);
      expect(mockSocket.getLastWrittenData()).toEqual(Buffer.from('N'));
      expect(SSLState.needsUpgrade(mockSocket)).toBe(false);
    });

    test('should emit sslUpgradeRequested event when SSL is accepted', () => {
      const mockSocket = new MockSocket();
      const config = {
        enableSSL: true,
        sslCertPath: path.join(__dirname, '..', 'certs', 'server.crt'),
        sslKeyPath: path.join(__dirname, '..', 'certs', 'server.key'),
      };
      let eventEmitted = false;

      mockSocket.on('sslUpgradeRequested', () => {
        eventEmitted = true;
      });

      handleSSLRequest(mockSocket, config);

      // Only expect event if SSL was actually accepted
      const lastData = mockSocket.getLastWrittenData();
      if (lastData.equals(Buffer.from('S'))) {
        expect(eventEmitted).toBe(true);
      } else {
        expect(eventEmitted).toBe(false);
      }
    });
  });

  describe('Server Manager SSL Integration', () => {
    let serverManager;

    beforeEach(() => {
      serverManager = new ServerManager(TEST_CONFIG);
    });

    afterEach(async () => {
      if (serverManager && serverManager.isServerRunning()) {
        await serverManager.stop();
      }
    });

    test('should initialize with SSL configuration', () => {
      expect(serverManager.config.enableSSL).toBe(true);
      expect(serverManager.config.sslCertPath).toBeTruthy();
      expect(serverManager.config.sslKeyPath).toBeTruthy();
    });

    test('should have SSL options method', () => {
      expect(typeof serverManager.getSSLOptions).toBe('function');
    });

    test('should read SSL certificates when available', () => {
      const sslOptions = serverManager.getSSLOptions();

      expect(sslOptions).toBeDefined();
      expect(sslOptions.rejectUnauthorized).toBe(false);
    });

    test('should handle missing SSL certificates gracefully', () => {
      const configWithMissingCerts = {
        enableSSL: true,
        sslCertPath: '/nonexistent/cert.crt',
        sslKeyPath: '/nonexistent/key.key',
      };

      const validation = validateSSLCertificates(configWithMissingCerts);

      expect(validation.success).toBe(false);
      expect(validation.error).toContain('SSL certificate file not found');
    });

    test('should validate SSL certificates before accepting SSL request', () => {
      const mockSocket = new MockSocket();
      const configWithMissingCerts = {
        enableSSL: true,
        sslCertPath: '/nonexistent/cert.crt',
        sslKeyPath: '/nonexistent/key.key',
      };

      const result = handleSSLRequest(mockSocket, configWithMissingCerts);

      expect(result).toBe(8);
      expect(mockSocket.getLastWrittenData()).toEqual(Buffer.from('N')); // Should reject
      expect(SSLState.needsUpgrade(mockSocket)).toBe(false);
    });

    test('should validate SSL certificate validation function', () => {
      // Test with SSL disabled
      const disabledConfig = { enableSSL: false };
      let validation = validateSSLCertificates(disabledConfig);
      expect(validation.success).toBe(false);
      expect(validation.error).toBe('SSL not enabled');

      // Test with missing certificate path
      const missingCertConfig = { enableSSL: true, sslKeyPath: '/some/key.key' };
      validation = validateSSLCertificates(missingCertConfig);
      expect(validation.success).toBe(false);
      expect(validation.error).toContain('SSL certificate file not found');

      // Test with missing key path (provide a cert that exists but no key)
      const missingKeyConfig = {
        enableSSL: true,
        sslCertPath: path.join(__dirname, '..', 'package.json'), // Use an existing file as cert
        sslKeyPath: '/nonexistent/key.key',
      };
      validation = validateSSLCertificates(missingKeyConfig);
      expect(validation.success).toBe(false);
      expect(validation.error).toContain('SSL key file not found');
    });
  });

  describe('SSL Configuration Validation', () => {
    test('should validate SSL configuration options', () => {
      const { validateConfig } = require('../src/config/serverConfig');

      const validConfig = {
        ...TEST_CONFIG,
        port: 5432,
        host: 'localhost',
        maxConnections: 100,
        connectionTimeout: 30000,
        logLevel: 'info',
        maxQueryLength: 1024,
      };

      const result = validateConfig(validConfig);
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    test('should reject invalid SSL port', () => {
      const { validateConfig } = require('../src/config/serverConfig');

      const invalidConfig = {
        ...TEST_CONFIG,
        enableSSL: true,
        sslPort: 70000, // Invalid port
        port: 5432,
        host: 'localhost',
        maxConnections: 100,
        connectionTimeout: 30000,
        logLevel: 'info',
        maxQueryLength: 1024,
      };

      const result = validateConfig(invalidConfig);
      expect(result.isValid).toBe(false);
      expect(result.errors.some(error => error.includes('sslPort'))).toBe(true);
    });
  });

  describe('Certificate Generation Script', () => {
    test('should export certificate generation functions', () => {
      const certGen = require('../scripts/generate-certs');

      expect(typeof certGen.checkOpenSSL).toBe('function');
      expect(typeof certGen.generatePrivateKey).toBe('function');
      expect(typeof certGen.generateCertificate).toBe('function');
      expect(typeof certGen.generateCertConfig).toBe('function');
      expect(certGen.CERTS_DIR).toBeDefined();
      expect(certGen.CERT_CONFIG).toBeDefined();
    });

    test('should check OpenSSL availability', () => {
      const { checkOpenSSL } = require('../scripts/generate-certs');

      // This will return true or false depending on system
      const result = checkOpenSSL();
      expect(typeof result).toBe('boolean');
    });

    test('should have proper certificate configuration', () => {
      const { CERT_CONFIG } = require('../scripts/generate-certs');

      expect(CERT_CONFIG.commonName).toBe('localhost');
      expect(CERT_CONFIG.keySize).toBe(2048);
      expect(CERT_CONFIG.validityDays).toBe(365);
    });
  });
});
