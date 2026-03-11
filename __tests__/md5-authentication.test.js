/**
 * MD5 Authentication Tests
 * Tests for MD5 password authentication implementation
 */

const {
  startMD5Authentication,
  processMD5PasswordResponse,
  handleStartupPacket,
} = require('../src/protocol/messageProcessors');
const { sendAuthenticationMD5Password } = require('../src/protocol/messageBuilders');
const {
  generateMD5Salt,
  computeMD5Password,
  md5,
} = require('../src/protocol/utils');
const { ConnectionState } = require('../src/connection/connectionState');
const { AUTH_METHODS } = require('../src/protocol/constants');

const TEST_CONFIG = {
  port: 0,
  host: 'localhost',
  authMethod: 'md5',
  enableLogging: false,
  username: 'testuser',
  password: 'testpass',
};

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

  destroy() {
    this.destroyed = true;
  }

  getLastWrittenData() {
    return this.data[this.data.length - 1];
  }

  getAllWrittenData() {
    return this.data;
  }

  clearData() {
    this.data = [];
  }
}

function buildPasswordMessage(passwordString) {
  const passwordBuffer = Buffer.from(passwordString + '\0', 'utf8');
  const length = 4 + passwordBuffer.length;
  const header = Buffer.alloc(5);
  header[0] = 0x70; // 'p'
  header.writeInt32BE(length, 1);
  return Buffer.concat([header, passwordBuffer]);
}

describe('MD5 Authentication Tests', () => {
  describe('MD5 Utility Functions', () => {
    test('md5 should compute correct hash', () => {
      const hash = md5('hello');
      expect(hash).toBe('5d41402abc4b2a76b9719d911017c592');
    });

    test('md5 should be deterministic', () => {
      expect(md5('test')).toBe(md5('test'));
    });

    test('md5 should accept Buffer input', () => {
      const hash = md5(Buffer.from('hello'));
      expect(hash).toBe('5d41402abc4b2a76b9719d911017c592');
    });

    test('generateMD5Salt should return 4-byte buffer', () => {
      const salt = generateMD5Salt();
      expect(Buffer.isBuffer(salt)).toBe(true);
      expect(salt.length).toBe(4);
    });

    test('generateMD5Salt should return different salts', () => {
      const salt1 = generateMD5Salt();
      const salt2 = generateMD5Salt();
      expect(salt1.equals(salt2)).toBe(false);
    });

    test('computeMD5Password should follow PostgreSQL algorithm', () => {
      const username = 'postgres';
      const password = 'password';
      const salt = Buffer.from([0x01, 0x02, 0x03, 0x04]);

      const result = computeMD5Password(username, password, salt);

      expect(result.startsWith('md5')).toBe(true);
      expect(result.length).toBe(35); // "md5" + 32 hex chars

      // Verify the algorithm: md5(md5(password + username) + salt)
      const inner = md5(password + username);
      const outer = md5(Buffer.concat([Buffer.from(inner, 'utf8'), salt]));
      expect(result).toBe('md5' + outer);
    });

    test('computeMD5Password should be deterministic for same inputs', () => {
      const salt = Buffer.from([0xAA, 0xBB, 0xCC, 0xDD]);
      const result1 = computeMD5Password('user', 'pass', salt);
      const result2 = computeMD5Password('user', 'pass', salt);
      expect(result1).toBe(result2);
    });

    test('computeMD5Password should differ for different salts', () => {
      const salt1 = Buffer.from([0x01, 0x02, 0x03, 0x04]);
      const salt2 = Buffer.from([0x05, 0x06, 0x07, 0x08]);
      const result1 = computeMD5Password('user', 'pass', salt1);
      const result2 = computeMD5Password('user', 'pass', salt2);
      expect(result1).not.toBe(result2);
    });

    test('computeMD5Password should differ for different users', () => {
      const salt = Buffer.from([0x01, 0x02, 0x03, 0x04]);
      const result1 = computeMD5Password('alice', 'pass', salt);
      const result2 = computeMD5Password('bob', 'pass', salt);
      expect(result1).not.toBe(result2);
    });
  });

  describe('MD5 Message Builders', () => {
    let mockSocket;

    beforeEach(() => {
      mockSocket = new MockSocket();
    });

    test('sendAuthenticationMD5Password should send correct message', () => {
      const salt = Buffer.from([0x01, 0x02, 0x03, 0x04]);
      sendAuthenticationMD5Password(mockSocket, salt);

      const data = mockSocket.getLastWrittenData();
      expect(data).toBeDefined();

      // Message type 'R' (0x52)
      expect(data[0]).toBe(0x52);

      // Auth method = 5 (MD5)
      const authMethod = data.readInt32BE(5);
      expect(authMethod).toBe(AUTH_METHODS.MD5_PASSWORD);

      // Salt bytes
      const sentSalt = data.slice(9, 13);
      expect(sentSalt.equals(salt)).toBe(true);

      // Total length: 1 (type) + 4 (length) + 4 (auth method) + 4 (salt) = 13
      expect(data.length).toBe(13);
    });
  });

  describe('MD5 Authentication Flow', () => {
    let mockSocket;
    let connState;

    beforeEach(() => {
      mockSocket = new MockSocket();
      connState = new ConnectionState();
      connState.setParameter('user', 'testuser');
      connState.setParameter('database', 'testdb');
    });

    test('startMD5Authentication should set salt and send challenge', () => {
      startMD5Authentication(mockSocket, connState, TEST_CONFIG);

      expect(connState.md5Salt).toBeDefined();
      expect(Buffer.isBuffer(connState.md5Salt)).toBe(true);
      expect(connState.md5Salt.length).toBe(4);

      const data = mockSocket.getLastWrittenData();
      expect(data[0]).toBe(0x52);
      const authMethod = data.readInt32BE(5);
      expect(authMethod).toBe(AUTH_METHODS.MD5_PASSWORD);
    });

    test('should authenticate with correct password', () => {
      startMD5Authentication(mockSocket, connState, TEST_CONFIG);
      const salt = connState.md5Salt;
      mockSocket.clearData();

      const correctHash = computeMD5Password('testuser', 'testpass', salt);
      const passwordBuffer = buildPasswordMessage(correctHash);

      processMD5PasswordResponse(passwordBuffer, mockSocket, connState, TEST_CONFIG);

      expect(connState.authenticated).toBe(true);
      expect(connState.md5Salt).toBeNull();

      // Should have sent: AuthOK, ParameterStatus(s), BackendKeyData, ReadyForQuery
      const messages = mockSocket.getAllWrittenData();
      expect(messages.length).toBeGreaterThan(1);

      // First message should be AuthenticationOK
      expect(messages[0][0]).toBe(0x52); // 'R'
      const authResult = messages[0].readInt32BE(5);
      expect(authResult).toBe(0); // AuthenticationOK
    });

    test('should reject wrong password', () => {
      startMD5Authentication(mockSocket, connState, TEST_CONFIG);
      const salt = connState.md5Salt;
      mockSocket.clearData();

      const wrongHash = computeMD5Password('testuser', 'wrongpassword', salt);
      const passwordBuffer = buildPasswordMessage(wrongHash);

      processMD5PasswordResponse(passwordBuffer, mockSocket, connState, TEST_CONFIG);

      expect(connState.authenticated).toBe(false);
      expect(connState.md5Salt).toBeNull();
      expect(mockSocket.destroyed).toBe(true);

      // Should have sent an ErrorResponse
      const data = mockSocket.getLastWrittenData();
      expect(data[0]).toBe(0x45); // 'E' - ErrorResponse
    });

    test('should reject garbage password string', () => {
      startMD5Authentication(mockSocket, connState, TEST_CONFIG);
      mockSocket.clearData();

      const passwordBuffer = buildPasswordMessage('not-an-md5-hash');

      processMD5PasswordResponse(passwordBuffer, mockSocket, connState, TEST_CONFIG);

      expect(connState.authenticated).toBe(false);
      expect(mockSocket.destroyed).toBe(true);
    });

    test('should handle complete flow via handleStartupPacket', () => {
      // Build a startup packet with protocol version 3.0
      const params = Buffer.concat([
        Buffer.from('user\0testuser\0'),
        Buffer.from('database\0testdb\0'),
        Buffer.from([0]),
      ]);

      const length = 8 + params.length;
      const startupBuffer = Buffer.alloc(length);
      startupBuffer.writeInt32BE(length, 0);
      startupBuffer.writeInt32BE(196608, 4); // Protocol 3.0
      params.copy(startupBuffer, 8);

      const bytesProcessed = handleStartupPacket(
        startupBuffer,
        mockSocket,
        connState,
        length,
        TEST_CONFIG
      );

      expect(bytesProcessed).toBe(length);
      expect(connState.md5Salt).toBeDefined();
      expect(connState.md5Salt.length).toBe(4);

      // Should have sent AuthenticationMD5Password
      const data = mockSocket.getLastWrittenData();
      expect(data[0]).toBe(0x52);
      expect(data.readInt32BE(5)).toBe(AUTH_METHODS.MD5_PASSWORD);
    });
  });

  describe('Connection State MD5 Support', () => {
    let connState;

    beforeEach(() => {
      connState = new ConnectionState();
    });

    test('should initialize md5Salt as null', () => {
      expect(connState.md5Salt).toBeNull();
    });

    test('should allow setting md5Salt', () => {
      const salt = generateMD5Salt();
      connState.md5Salt = salt;
      expect(connState.md5Salt).toBe(salt);
    });

    test('should clear md5Salt after authentication', () => {
      connState.md5Salt = generateMD5Salt();
      connState.md5Salt = null;
      expect(connState.md5Salt).toBeNull();
    });
  });
});
