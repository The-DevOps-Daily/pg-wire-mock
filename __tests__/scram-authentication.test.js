/**
 * SCRAM-SHA-256 Authentication Tests
 * Tests for SCRAM-SHA-256 authentication implementation
 */

const {
  startScramAuthentication,
  processSASLInitialResponse,
  processSASLResponse,
} = require('../src/protocol/messageProcessors');
const {
  sendAuthenticationSASL,
  sendAuthenticationSASLContinue,
  sendAuthenticationSASLFinal,
} = require('../src/protocol/messageBuilders');
const {
  generateScramNonce,
  pbkdf2ScramSha256,
  hmacSha256,
  sha256,
  normalizeScramUsername,
  normalizeScramPassword,
  generateScramCredentials,
  verifyScramClientProof,
  generateScramServerSignature,
  parseScramClientInitial,
  parseScramClientFinal,
  buildScramServerFirst,
  buildScramServerFinal,
  buildScramAuthMessage,
} = require('../src/protocol/utils');
const { ConnectionState } = require('../src/connection/connectionState');
const { SCRAM_STATES, SASL_MECHANISMS } = require('../src/protocol/constants');

// Test configuration
const TEST_CONFIG = {
  port: 0, // Use random available port
  host: 'localhost',
  authMethod: 'scram-sha-256',
  scramIterations: 4096,
  enableLogging: false,
  username: 'testuser',
  password: 'testpass',
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

// Helper function to create SCRAM client initial message
function createClientInitialMessage(username, clientNonce = null) {
  const nonce = clientNonce || generateScramNonce();
  const gs2Header = 'n,,';
  const clientInitialBare = `n=${username},r=${nonce}`;
  return {
    fullMessage: gs2Header + clientInitialBare,
    clientInitialBare,
    clientNonce: nonce,
  };
}

// Helper function to create SCRAM client final message
function createClientFinalMessage(
  clientNonce,
  serverNonce,
  username,
  password,
  salt,
  iterations,
  serverFirst
) {
  const channelBinding = 'biws'; // "n,," base64 encoded
  const clientFinalWithoutProof = `c=${channelBinding},r=${clientNonce}${serverNonce}`;

  // Calculate client proof
  const normalizedPassword = normalizeScramPassword(password);
  const saltBuffer = Buffer.from(salt, 'base64');
  const saltedPassword = pbkdf2ScramSha256(normalizedPassword, saltBuffer, iterations);
  const clientKey = hmacSha256(saltedPassword, 'Client Key');
  const storedKey = sha256(clientKey);

  const authMessage = buildScramAuthMessage(
    'n=' + username + ',r=' + clientNonce,
    serverFirst,
    clientFinalWithoutProof
  );
  const clientSignature = hmacSha256(storedKey, Buffer.from(authMessage, 'utf8'));

  const clientProof = Buffer.alloc(clientKey.length);
  for (let i = 0; i < clientKey.length; i++) {
    clientProof[i] = clientKey[i] ^ clientSignature[i];
  }

  return {
    message: clientFinalWithoutProof + ',p=' + clientProof.toString('base64'),
    clientProof: clientProof.toString('base64'),
    authMessage,
  };
}

describe('SCRAM-SHA-256 Authentication Tests', () => {
  describe('SCRAM Utility Functions', () => {
    test('generateScramNonce should generate unique nonces', () => {
      const nonce1 = generateScramNonce();
      const nonce2 = generateScramNonce();

      expect(nonce1).not.toBe(nonce2);
      expect(typeof nonce1).toBe('string');
      expect(nonce1.length).toBeGreaterThan(0);
    });

    test('pbkdf2ScramSha256 should derive consistent keys', () => {
      const password = 'testpassword';
      const salt = Buffer.from('testsalt');
      const iterations = 4096;

      const key1 = pbkdf2ScramSha256(password, salt, iterations);
      const key2 = pbkdf2ScramSha256(password, salt, iterations);

      expect(key1.equals(key2)).toBe(true);
      expect(key1.length).toBe(32); // SHA-256 output length
    });

    test('hmacSha256 should compute correct HMAC', () => {
      const key = Buffer.from('testkey');
      const data = 'testdata';

      const hmac1 = hmacSha256(key, data);
      const hmac2 = hmacSha256(key, data);

      expect(hmac1.equals(hmac2)).toBe(true);
      expect(hmac1.length).toBe(32); // SHA-256 output length
    });

    test('sha256 should compute correct hash', () => {
      const data = 'testdata';

      const hash1 = sha256(data);
      const hash2 = sha256(data);

      expect(hash1.equals(hash2)).toBe(true);
      expect(hash1.length).toBe(32); // SHA-256 output length
    });

    test('normalizeScramUsername should handle basic normalization', () => {
      expect(normalizeScramUsername('testuser')).toBe('testuser');
      expect(normalizeScramUsername('TestUser')).toBe('TestUser'); // Case-sensitive
    });

    test('normalizeScramPassword should handle basic normalization', () => {
      expect(normalizeScramPassword('testpass')).toBe('testpass');
      expect(normalizeScramPassword('TestPass')).toBe('TestPass'); // Case-sensitive
    });

    test('generateScramCredentials should create valid server credentials', () => {
      const password = 'testpassword';
      const iterations = 4096;

      const credentials = generateScramCredentials(password, iterations);

      expect(credentials).toHaveProperty('salt');
      expect(credentials).toHaveProperty('iterations', iterations);
      expect(credentials).toHaveProperty('storedKey');
      expect(credentials).toHaveProperty('serverKey');

      expect(typeof credentials.salt).toBe('string');
      expect(typeof credentials.storedKey).toBe('string');
      expect(typeof credentials.serverKey).toBe('string');
    });

    test('verifyScramClientProof should validate correct proofs', () => {
      const password = 'testpassword';
      const username = 'testuser';
      const clientNonce = 'clientnonce123';
      const serverNonce = 'servernonce456';

      // Generate server credentials
      const credentials = generateScramCredentials(password);

      // Create authentication message components
      const clientInitialBare = `n=${username},r=${clientNonce}`;
      const serverFirst = `r=${clientNonce}${serverNonce},s=${credentials.salt},i=${credentials.iterations}`;
      const clientFinalWithoutProof = `c=biws,r=${clientNonce}${serverNonce}`;
      const authMessage = buildScramAuthMessage(
        clientInitialBare,
        serverFirst,
        clientFinalWithoutProof
      );

      // Calculate client proof
      const normalizedPassword = normalizeScramPassword(password);
      const saltBuffer = Buffer.from(credentials.salt, 'base64');
      const saltedPassword = pbkdf2ScramSha256(
        normalizedPassword,
        saltBuffer,
        credentials.iterations
      );
      const clientKey = hmacSha256(saltedPassword, 'Client Key');
      const storedKey = sha256(clientKey);
      const clientSignature = hmacSha256(storedKey, Buffer.from(authMessage, 'utf8'));

      const clientProof = Buffer.alloc(clientKey.length);
      for (let i = 0; i < clientKey.length; i++) {
        clientProof[i] = clientKey[i] ^ clientSignature[i];
      }

      const isValid = verifyScramClientProof(
        clientProof.toString('base64'),
        credentials.storedKey,
        authMessage
      );

      expect(isValid).toBe(true);
    });

    test('verifyScramClientProof should reject invalid proofs', () => {
      const credentials = generateScramCredentials('testpassword');
      const invalidProof = 'invalidproof123';
      const authMessage = 'test,auth,message';

      const isValid = verifyScramClientProof(invalidProof, credentials.storedKey, authMessage);

      expect(isValid).toBe(false);
    });

    test('generateScramServerSignature should create valid signature', () => {
      const credentials = generateScramCredentials('testpassword');
      const authMessage = 'test,auth,message';

      const signature = generateScramServerSignature(credentials.serverKey, authMessage);

      expect(typeof signature).toBe('string');
      expect(signature.length).toBeGreaterThan(0);
    });

    test('parseScramClientInitial should parse client initial message', () => {
      const username = 'testuser';
      const clientNonce = 'testnonce123';
      const message = `n,,n=${username},r=${clientNonce}`;

      const parsed = parseScramClientInitial(message);

      expect(parsed.username).toBe(username);
      expect(parsed.nonce).toBe(clientNonce);
      expect(parsed.channelBinding).toBe('n');
    });
    test('parseScramClientFinal should parse client final message', () => {
      const clientNonce = 'clientnonce';
      const serverNonce = 'servernonce';
      const clientProof = 'dGVzdHByb29m'; // 'testproof' in base64
      const message = `c=biws,r=${clientNonce}${serverNonce},p=${clientProof}`;

      const parsed = parseScramClientFinal(message);

      expect(parsed.channelBinding).toBe('biws');
      expect(parsed.nonce).toBe(clientNonce + serverNonce);
      expect(parsed.proof).toBe(clientProof);
    });
    test('buildScramServerFirst should create valid server first message', () => {
      const clientNonce = 'clientnonce';
      const serverNonce = 'servernonce';
      const salt = 'dGVzdHNhbHQ='; // 'testsalt' in base64
      const iterations = 4096;

      const serverFirst = buildScramServerFirst(clientNonce, serverNonce, salt, iterations);

      expect(serverFirst).toBe(`r=${clientNonce}${serverNonce},s=${salt},i=${iterations}`);
    });

    test('buildScramServerFinal should create valid server final message', () => {
      const serverSignature = 'dGVzdHNpZ25hdHVyZQ=='; // 'testsignature' in base64

      const serverFinal = buildScramServerFinal(serverSignature);

      expect(serverFinal).toBe(`v=${serverSignature}`);
    });

    test('buildScramAuthMessage should create valid auth message', () => {
      const clientInitialBare = 'n=testuser,r=clientnonce';
      const serverFirst = 'r=clientnonceservernonce,s=salt,i=4096';
      const clientFinalWithoutProof = 'c=biws,r=clientnonceservernonce';

      const authMessage = buildScramAuthMessage(
        clientInitialBare,
        serverFirst,
        clientFinalWithoutProof
      );

      expect(authMessage).toBe(`${clientInitialBare},${serverFirst},${clientFinalWithoutProof}`);
    });
  });

  describe('SCRAM Message Builders', () => {
    let mockSocket;

    beforeEach(() => {
      mockSocket = new MockSocket();
    });

    test('sendAuthenticationSASL should send correct SASL message', () => {
      sendAuthenticationSASL(mockSocket);

      const data = mockSocket.getLastWrittenData();
      expect(data).toBeDefined();
      expect(data.length).toBeGreaterThan(0);

      // Verify message type and authentication method
      expect(data[0]).toBe(0x52); // 'R' - Authentication message type
      const authMethod = data.readInt32BE(5);
      expect(authMethod).toBe(10); // SASL authentication method
    });

    test('sendAuthenticationSASLContinue should send continue message', () => {
      const serverData = 'test server challenge';

      sendAuthenticationSASLContinue(mockSocket, serverData);

      const data = mockSocket.getLastWrittenData();
      expect(data).toBeDefined();
      expect(data.length).toBeGreaterThan(0);

      // Verify message type and authentication method
      expect(data[0]).toBe(0x52); // 'R' - Authentication message type
      const authMethod = data.readInt32BE(5);
      expect(authMethod).toBe(11); // SASL continue method
    });

    test('sendAuthenticationSASLFinal should send final message', () => {
      const serverData = 'test server final';

      sendAuthenticationSASLFinal(mockSocket, serverData);

      const data = mockSocket.getLastWrittenData();
      expect(data).toBeDefined();
      expect(data.length).toBeGreaterThan(0);

      // Verify message type and authentication method
      expect(data[0]).toBe(0x52); // 'R' - Authentication message type
      const authMethod = data.readInt32BE(5);
      expect(authMethod).toBe(12); // SASL final method
    });
  });

  describe('SCRAM Authentication Flow', () => {
    let mockSocket;
    let connState;

    beforeEach(() => {
      mockSocket = new MockSocket();
      connState = new ConnectionState();
      connState.setParameter('user', 'testuser');
      connState.setParameter('database', 'testdb');
    });

    test('startScramAuthentication should initiate SCRAM flow', () => {
      startScramAuthentication(mockSocket, connState, TEST_CONFIG);

      // Verify SCRAM state is set
      expect(connState.scramState).toBe(SCRAM_STATES.INITIAL);
      expect(connState.scramMechanism).toBe(SASL_MECHANISMS.SCRAM_SHA_256);

      // Verify SASL message was sent
      const data = mockSocket.getLastWrittenData();
      expect(data).toBeDefined();
      expect(data[0]).toBe(0x52); // 'R' - Authentication message type
    });

    test('should handle complete SCRAM authentication flow', () => {
      const username = 'testuser';
      const password = 'testpass'; // Use the same password as in TEST_CONFIG

      // Store user credentials (in real implementation, this would be in a database)
      const userCredentials = generateScramCredentials(password); // Step 1: Start SCRAM authentication
      startScramAuthentication(mockSocket, connState, TEST_CONFIG);
      mockSocket.clearData();

      // Step 2: Process client initial message
      const clientInitial = createClientInitialMessage(username);
      const clientInitialBuffer = Buffer.concat([
        Buffer.from([0x70]), // 'p' - Password message type
        Buffer.alloc(4), // Length placeholder
        Buffer.from('SCRAM-SHA-256'),
        Buffer.from([0]), // Mechanism
        Buffer.alloc(4), // SASL data length placeholder
        Buffer.from(clientInitial.fullMessage),
      ]);

      // Set proper lengths
      clientInitialBuffer.writeInt32BE(clientInitialBuffer.length - 1, 1);
      clientInitialBuffer.writeInt32BE(clientInitial.fullMessage.length, 18);

      // Mock credentials retrieval
      connState.scramCredentials = userCredentials;

      const bytesProcessed = processSASLInitialResponse(
        clientInitialBuffer,
        mockSocket,
        connState,
        TEST_CONFIG
      );
      expect(bytesProcessed).toBeGreaterThan(0);
      expect(connState.scramState).toBe(SCRAM_STATES.FIRST_SENT);

      // Verify server first message was sent
      const serverFirstData = mockSocket.getLastWrittenData();
      expect(serverFirstData).toBeDefined();
      expect(serverFirstData[0]).toBe(0x52); // 'R' - Authentication message type

      mockSocket.clearData();

      // Step 3: Process client final message
      // Parse server first to get server nonce and salt
      const serverFirstPayload = serverFirstData.slice(9); // Skip message header
      const serverFirstStr = serverFirstPayload.toString('utf8');
      const serverFirstMatch = serverFirstStr.match(/r=([^,]+),s=([^,]+),i=(\d+)/);

      if (serverFirstMatch) {
        const serverNonce = serverFirstMatch[1].substring(clientInitial.clientNonce.length);
        const salt = serverFirstMatch[2];
        const iterations = parseInt(serverFirstMatch[3]);

        const clientFinal = createClientFinalMessage(
          clientInitial.clientNonce,
          serverNonce,
          username,
          password,
          salt,
          iterations,
          serverFirstStr
        );

        const clientFinalBuffer = Buffer.concat([
          Buffer.from([0x70]), // 'p' - Password message type
          Buffer.alloc(4), // Length placeholder
          Buffer.from(clientFinal.message),
        ]);

        clientFinalBuffer.writeInt32BE(clientFinalBuffer.length - 1, 1);

        const bytesProcessed2 = processSASLResponse(clientFinalBuffer, mockSocket, connState);
        expect(bytesProcessed2).toBeGreaterThan(0);
        expect(connState.scramState).toBe(SCRAM_STATES.ENDED);
        expect(connState.authenticated).toBe(true);

        // Verify messages were sent (SASL final, AuthOK, ParameterStatus, BackendKeyData, ReadyForQuery)
        const allMessages = mockSocket.getAllWrittenData();
        expect(allMessages.length).toBeGreaterThan(0);
      }
    });

    test('should reject authentication with invalid password', () => {
      const username = 'testuser';
      const correctPassword = 'correctpassword';
      const wrongPassword = 'wrongpassword';

      // Store user credentials with correct password
      const userCredentials = generateScramCredentials(correctPassword);

      // Start SCRAM authentication
      startScramAuthentication(mockSocket, connState, TEST_CONFIG);
      mockSocket.clearData();

      // Process client initial message
      const clientInitial = createClientInitialMessage(username);
      const clientInitialBuffer = Buffer.concat([
        Buffer.from([0x70]), // 'p' - Password message type
        Buffer.alloc(4), // Length placeholder
        Buffer.from('SCRAM-SHA-256'),
        Buffer.from([0]), // Mechanism
        Buffer.alloc(4), // SASL data length placeholder
        Buffer.from(clientInitial.fullMessage),
      ]);

      clientInitialBuffer.writeInt32BE(clientInitialBuffer.length - 1, 1);
      clientInitialBuffer.writeInt32BE(clientInitial.fullMessage.length, 18);

      connState.scramCredentials = userCredentials;

      processSASLInitialResponse(clientInitialBuffer, mockSocket, connState, TEST_CONFIG);

      const serverFirstData = mockSocket.getLastWrittenData();
      const serverFirstPayload = serverFirstData.slice(9);
      const serverFirstStr = serverFirstPayload.toString('utf8');
      const serverFirstMatch = serverFirstStr.match(/r=([^,]+),s=([^,]+),i=(\d+)/);

      mockSocket.clearData();

      if (serverFirstMatch) {
        const serverNonce = serverFirstMatch[1].substring(clientInitial.clientNonce.length);
        const salt = serverFirstMatch[2];
        const iterations = parseInt(serverFirstMatch[3]);

        // Create client final with wrong password
        const clientFinal = createClientFinalMessage(
          clientInitial.clientNonce,
          serverNonce,
          username,
          wrongPassword, // Using wrong password
          salt,
          iterations,
          serverFirstStr
        );

        const clientFinalBuffer = Buffer.concat([
          Buffer.from([0x70]), // 'p' - Password message type
          Buffer.alloc(4), // Length placeholder
          Buffer.from(clientFinal.message),
        ]);

        clientFinalBuffer.writeInt32BE(clientFinalBuffer.length - 1, 1);

        processSASLResponse(clientFinalBuffer, mockSocket, connState);

        // Should not be authenticated
        expect(connState.authenticated).toBe(false);
        expect(connState.scramState).toBe(SCRAM_STATES.ERROR);
      }
    });

    test('should handle malformed client initial message', () => {
      const malformedMessage = 'invalid,message,format';
      const clientInitialBuffer = Buffer.concat([
        Buffer.from([0x70]), // 'p' - Password message type
        Buffer.alloc(4), // Length placeholder
        Buffer.from('SCRAM-SHA-256'),
        Buffer.from([0]), // Mechanism
        Buffer.alloc(4), // SASL data length placeholder
        Buffer.from(malformedMessage),
      ]);

      clientInitialBuffer.writeInt32BE(clientInitialBuffer.length - 1, 1);
      clientInitialBuffer.writeInt32BE(malformedMessage.length, 18);

      const bytesProcessed = processSASLInitialResponse(
        clientInitialBuffer,
        mockSocket,
        connState,
        TEST_CONFIG
      );

      expect(bytesProcessed).toBeGreaterThan(0);
      expect(connState.scramState).toBe(SCRAM_STATES.ERROR);
      expect(connState.authenticated).toBe(false);
    });

    test('should handle malformed client final message', () => {
      // Start with valid initial
      startScramAuthentication(mockSocket, connState, TEST_CONFIG);
      connState.scramState = SCRAM_STATES.FIRST_SENT;
      connState.scramClientNonce = 'testnonce';
      connState.scramServerNonce = 'servernonce';

      const malformedFinalMessage = 'invalid,final,message';
      const clientFinalBuffer = Buffer.concat([
        Buffer.from([0x70]), // 'p' - Password message type
        Buffer.alloc(4), // Length placeholder
        Buffer.from(malformedFinalMessage),
      ]);

      clientFinalBuffer.writeInt32BE(clientFinalBuffer.length - 1, 1);

      const bytesProcessed = processSASLResponse(clientFinalBuffer, mockSocket, connState);

      expect(bytesProcessed).toBeGreaterThan(0);
      expect(connState.scramState).toBe(SCRAM_STATES.ERROR);
      expect(connState.authenticated).toBe(false);
    });
  });

  describe('SCRAM Configuration', () => {
    test('should use default iteration count when not specified', () => {
      const password = 'testpassword';
      const credentials = generateScramCredentials(password);

      expect(credentials.iterations).toBe(4096); // Default iteration count
    });

    test('should use custom iteration count when specified', () => {
      const password = 'testpassword';
      const customIterations = 8192;
      const credentials = generateScramCredentials(password, customIterations);

      expect(credentials.iterations).toBe(customIterations);
    });

    test('should support different SCRAM mechanisms', () => {
      expect(SASL_MECHANISMS.SCRAM_SHA_256).toBe('SCRAM-SHA-256');
    });

    test('should track SCRAM states correctly', () => {
      expect(SCRAM_STATES.INITIAL).toBe('initial');
      expect(SCRAM_STATES.FIRST_SENT).toBe('first-sent');
      expect(SCRAM_STATES.ENDED).toBe('ended');
      expect(SCRAM_STATES.ERROR).toBe('error');
    });
  });

  describe('Connection State SCRAM Support', () => {
    let connState;

    beforeEach(() => {
      connState = new ConnectionState();
    });

    test('should initialize SCRAM state fields', () => {
      expect(connState.scramState).toBeNull();
      expect(connState.scramMechanism).toBeNull();
      expect(connState.scramClientNonce).toBeNull();
      expect(connState.scramServerNonce).toBeNull();
      expect(connState.scramCredentials).toBeNull();
    });

    test('should allow setting SCRAM state', () => {
      connState.scramState = SCRAM_STATES.INITIAL;
      connState.scramMechanism = SASL_MECHANISMS.SCRAM_SHA_256;
      connState.scramClientNonce = 'testnonce';

      expect(connState.scramState).toBe(SCRAM_STATES.INITIAL);
      expect(connState.scramMechanism).toBe(SASL_MECHANISMS.SCRAM_SHA_256);
      expect(connState.scramClientNonce).toBe('testnonce');
    });
  });
});
