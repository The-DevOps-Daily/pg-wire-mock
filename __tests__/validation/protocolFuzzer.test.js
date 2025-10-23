/**
 * Tests for Protocol Fuzzer
 */

const ProtocolFuzzer = require('../../src/validation/protocolFuzzer');
const { MESSAGE_TYPES, AUTH_METHODS } = require('../../src/protocol/constants');

describe('Protocol Fuzzer', () => {
  let fuzzer;

  beforeEach(() => {
    fuzzer = new ProtocolFuzzer();
  });

  describe('Initialization', () => {
    test('should initialize fuzzing strategies', () => {
      expect(fuzzer.fuzzingStrategies).toHaveProperty('messageCorruption');
      expect(fuzzer.fuzzingStrategies).toHaveProperty('boundaryTesting');
      expect(fuzzer.fuzzingStrategies).toHaveProperty('encodingIssues');
      expect(fuzzer.fuzzingStrategies).toHaveProperty('protocolViolations');

      expect(fuzzer.fuzzingStrategies.messageCorruption).toHaveLength(6);
      expect(fuzzer.fuzzingStrategies.boundaryTesting).toHaveLength(5);
      expect(fuzzer.fuzzingStrategies.encodingIssues).toHaveLength(4);
      expect(fuzzer.fuzzingStrategies.protocolViolations).toHaveLength(4);
    });

    test('should initialize random number generator', () => {
      expect(fuzzer.random).toHaveProperty('next');
      expect(fuzzer.random).toHaveProperty('nextInt');
      expect(fuzzer.random).toHaveProperty('nextBool');
      expect(typeof fuzzer.random.next).toBe('function');
      expect(typeof fuzzer.random.nextInt).toBe('function');
      expect(typeof fuzzer.random.nextBool).toBe('function');
    });
  });

  describe('Fuzzing Test Execution', () => {
    test('should run fuzzing tests', async () => {
      const results = await fuzzer.runFuzzingTests({
        iterations: 10,
        strategies: ['messageCorruption'],
        messageTypes: [MESSAGE_TYPES.QUERY],
      });

      expect(results).toHaveProperty('total');
      expect(results).toHaveProperty('passed');
      expect(results).toHaveProperty('failed');
      expect(results).toHaveProperty('warnings');
      expect(results).toHaveProperty('strategies');
      expect(results).toHaveProperty('crashes');
      expect(results).toHaveProperty('timeouts');
      expect(results).toHaveProperty('details');

      expect(results.total).toBeGreaterThan(0);
    });

    test('should run fuzzing strategy', async () => {
      const results = await fuzzer.runFuzzingStrategy('messageCorruption', {
        iterations: 5,
        strategies: ['messageCorruption'],
        messageTypes: [MESSAGE_TYPES.QUERY],
      });

      expect(results).toHaveProperty('total');
      expect(results).toHaveProperty('passed');
      expect(results).toHaveProperty('failed');
      expect(results).toHaveProperty('warnings');
      expect(results).toHaveProperty('crashes');
      expect(results).toHaveProperty('timeouts');
      expect(results).toHaveProperty('details');
    });
  });

  describe('Fuzzed Message Generation', () => {
    test('should generate fuzzed message', () => {
      const config = {
        messageTypes: [MESSAGE_TYPES.QUERY],
      };

      const fuzzedMessage = fuzzer.generateFuzzedMessage('messageCorruption', 'bitFlip', config);

      expect(fuzzedMessage).toBeInstanceOf(Buffer);
      expect(fuzzedMessage.length).toBeGreaterThan(0);
    });

    test('should generate fuzzed message for different strategies', () => {
      const config = {
        messageTypes: [MESSAGE_TYPES.QUERY],
      };

      const strategies = [
        'messageCorruption',
        'boundaryTesting',
        'encodingIssues',
        'protocolViolations',
      ];

      for (const strategy of strategies) {
        const fuzzedMessage = fuzzer.generateFuzzedMessage(strategy, 'bitFlip', config);
        expect(fuzzedMessage).toBeInstanceOf(Buffer);
      }
    });
  });

  describe('Message Corruption', () => {
    test('should corrupt message with bit flip', () => {
      const original = Buffer.from('test message');
      const corrupted = fuzzer.corruptMessage(original, 'bitFlip');

      expect(corrupted).toBeInstanceOf(Buffer);
      expect(corrupted.length).toBe(original.length);
    });

    test('should corrupt message with byte swap', () => {
      const original = Buffer.from('test message');
      const corrupted = fuzzer.corruptMessage(original, 'byteSwap');

      expect(corrupted).toBeInstanceOf(Buffer);
      expect(corrupted.length).toBe(original.length);
    });

    test('should corrupt message with length corruption', () => {
      const original = Buffer.from('test message');
      const corrupted = fuzzer.corruptMessage(original, 'lengthCorruption');

      expect(corrupted).toBeInstanceOf(Buffer);
      expect(corrupted.length).toBe(original.length);
    });

    test('should corrupt message with type corruption', () => {
      const original = Buffer.from('test message');
      const corrupted = fuzzer.corruptMessage(original, 'typeCorruption');

      expect(corrupted).toBeInstanceOf(Buffer);
      expect(corrupted.length).toBe(original.length);
    });

    test('should corrupt message with payload truncation', () => {
      const original = Buffer.from('test message');
      const corrupted = fuzzer.corruptMessage(original, 'payloadTruncation');

      expect(corrupted).toBeInstanceOf(Buffer);
      expect(corrupted.length).toBeLessThanOrEqual(original.length);
    });

    test('should corrupt message with payload expansion', () => {
      const original = Buffer.from('test message');
      const corrupted = fuzzer.corruptMessage(original, 'payloadExpansion');

      expect(corrupted).toBeInstanceOf(Buffer);
      expect(corrupted.length).toBeGreaterThan(original.length);
    });
  });

  describe('Boundary Testing', () => {
    test('should test minimum length boundary', () => {
      const original = Buffer.from('test message');
      const boundary = fuzzer.testBoundaries(original, 'minimumLength');

      expect(boundary).toBeInstanceOf(Buffer);
      expect(boundary.length).toBe(1);
    });

    test('should test maximum length boundary', () => {
      const original = Buffer.from('test message');
      const boundary = fuzzer.testBoundaries(original, 'maximumLength');

      expect(boundary).toBeInstanceOf(Buffer);
      expect(boundary.length).toBe(1024 * 1024);
    });

    test('should test zero length boundary', () => {
      const original = Buffer.from('test message');
      const boundary = fuzzer.testBoundaries(original, 'zeroLength');

      expect(boundary).toBeInstanceOf(Buffer);
      expect(boundary.length).toBe(original.length);
    });

    test('should test negative length boundary', () => {
      const original = Buffer.from('test message');
      const boundary = fuzzer.testBoundaries(original, 'negativeLength');

      expect(boundary).toBeInstanceOf(Buffer);
      expect(boundary.length).toBe(original.length);
    });

    test('should test overflow length boundary', () => {
      const original = Buffer.from('test message');
      const boundary = fuzzer.testBoundaries(original, 'overflowLength');

      expect(boundary).toBeInstanceOf(Buffer);
      expect(boundary.length).toBe(original.length);
    });
  });

  describe('Encoding Issues', () => {
    test('should introduce invalid UTF8', () => {
      const original = Buffer.from('test message');
      const corrupted = fuzzer.introduceEncodingIssues(original, 'invalidUTF8');

      expect(corrupted).toBeInstanceOf(Buffer);
      expect(corrupted.length).toBe(original.length);
    });

    test('should inject null bytes', () => {
      const original = Buffer.from('test message');
      const corrupted = fuzzer.introduceEncodingIssues(original, 'nullByteInjection');

      expect(corrupted).toBeInstanceOf(Buffer);
      expect(corrupted.length).toBe(original.length);
    });

    test('should introduce unicode overflow', () => {
      const original = Buffer.from('test message');
      const corrupted = fuzzer.introduceEncodingIssues(original, 'unicodeOverflow');

      expect(corrupted).toBeInstanceOf(Buffer);
      expect(corrupted.length).toBe(original.length);
    });

    test('should introduce encoding mismatch', () => {
      const original = Buffer.from('test message');
      const corrupted = fuzzer.introduceEncodingIssues(original, 'encodingMismatch');

      expect(corrupted).toBeInstanceOf(Buffer);
      expect(corrupted.length).toBe(original.length);
    });
  });

  describe('Protocol Violations', () => {
    test('should create invalid sequence', () => {
      const original = Buffer.from('test message');
      const corrupted = fuzzer.introduceProtocolViolations(original, 'invalidMessageSequence');

      expect(corrupted).toBeInstanceOf(Buffer);
      expect(corrupted.length).toBe(original.length);
    });

    test('should remove required fields', () => {
      const original = Buffer.from('test message');
      const corrupted = fuzzer.introduceProtocolViolations(original, 'missingRequiredFields');

      expect(corrupted).toBeInstanceOf(Buffer);
      expect(corrupted.length).toBeLessThanOrEqual(original.length);
    });

    test('should add extra fields', () => {
      const original = Buffer.from('test message');
      const corrupted = fuzzer.introduceProtocolViolations(original, 'extraFields');

      expect(corrupted).toBeInstanceOf(Buffer);
      expect(corrupted.length).toBeGreaterThan(original.length);
    });

    test('should change field types', () => {
      const original = Buffer.from('test message');
      const corrupted = fuzzer.introduceProtocolViolations(original, 'wrongFieldTypes');

      expect(corrupted).toBeInstanceOf(Buffer);
      expect(corrupted.length).toBe(original.length);
    });
  });

  describe('Base Message Creation', () => {
    test('should create base message for query', () => {
      const message = fuzzer.createBaseMessage(MESSAGE_TYPES.QUERY);

      expect(message).toBeInstanceOf(Buffer);
      expect(message.length).toBeGreaterThan(5);
    });

    test('should create base message for sync', () => {
      const message = fuzzer.createBaseMessage(MESSAGE_TYPES.SYNC);

      expect(message).toBeInstanceOf(Buffer);
      expect(message.length).toBe(5);
    });

    test('should create base message for terminate', () => {
      const message = fuzzer.createBaseMessage(MESSAGE_TYPES.TERMINATE);

      expect(message).toBeInstanceOf(Buffer);
      expect(message.length).toBe(5);
    });

    test('should create base message for authentication', () => {
      const message = fuzzer.createBaseMessage(MESSAGE_TYPES.AUTHENTICATION);

      expect(message).toBeInstanceOf(Buffer);
      expect(message.length).toBe(9);
    });

    test('should create base message for ready for query', () => {
      const message = fuzzer.createBaseMessage(MESSAGE_TYPES.READY_FOR_QUERY);

      expect(message).toBeInstanceOf(Buffer);
      expect(message.length).toBe(6);
    });
  });

  describe('Message Creation Helpers', () => {
    test('should create query message', () => {
      const message = fuzzer.createQueryMessage('SELECT 1');

      expect(message).toBeInstanceOf(Buffer);
      expect(message.length).toBeGreaterThan(5);
    });

    test('should create sync message', () => {
      const message = fuzzer.createSyncMessage();

      expect(message).toBeInstanceOf(Buffer);
      expect(message.length).toBe(5);
    });

    test('should create terminate message', () => {
      const message = fuzzer.createTerminateMessage();

      expect(message).toBeInstanceOf(Buffer);
      expect(message.length).toBe(5);
    });

    test('should create authentication message', () => {
      const message = fuzzer.createAuthenticationMessage(AUTH_METHODS.OK);

      expect(message).toBeInstanceOf(Buffer);
      expect(message.length).toBe(9);
    });

    test('should create ready for query message', () => {
      const message = fuzzer.createReadyForQueryMessage('I');

      expect(message).toBeInstanceOf(Buffer);
      expect(message.length).toBe(6);
    });

    test('should create basic message', () => {
      const message = fuzzer.createBasicMessage(MESSAGE_TYPES.QUERY);

      expect(message).toBeInstanceOf(Buffer);
      expect(message.length).toBe(5);
    });
  });

  describe('Fuzzing Test Execution', () => {
    test('should test fuzzed message', async () => {
      const message = fuzzer.createQueryMessage('SELECT 1');
      const result = await fuzzer.testFuzzedMessage(message, 'messageCorruption', 'bitFlip');

      expect(result).toHaveProperty('passed');
      expect(result).toHaveProperty('warnings');
      expect(result).toHaveProperty('crashed');
      expect(result).toHaveProperty('timedOut');
      expect(result).toHaveProperty('error');
    });

    test('should perform fuzzing test', async () => {
      const message = fuzzer.createQueryMessage('SELECT 1');

      await expect(fuzzer.performFuzzingTest(message)).resolves.not.toThrow();
    });

    test('should handle invalid message in fuzzing test', async () => {
      const invalidMessage = Buffer.alloc(0);

      await expect(fuzzer.performFuzzingTest(invalidMessage)).rejects.toThrow('Message too short');
    });

    test('should handle oversized message in fuzzing test', async () => {
      const oversizedMessage = Buffer.alloc(1024 * 1024 + 1);

      await expect(fuzzer.performFuzzingTest(oversizedMessage)).rejects.toThrow('Message too long');
    });

    test('should handle invalid message type in fuzzing test', async () => {
      const invalidTypeMessage = Buffer.alloc(5);
      invalidTypeMessage[0] = 0xff; // Invalid type
      invalidTypeMessage.writeInt32BE(4, 1);

      await expect(fuzzer.performFuzzingTest(invalidTypeMessage)).rejects.toThrow(
        'Invalid message type'
      );
    });
  });

  describe('Random Number Generator', () => {
    test('should generate random numbers', () => {
      const random1 = fuzzer.random.next();
      const random2 = fuzzer.random.next();

      expect(typeof random1).toBe('number');
      expect(typeof random2).toBe('number');
      expect(random1).toBeGreaterThanOrEqual(0);
      expect(random1).toBeLessThan(1);
      expect(random2).toBeGreaterThanOrEqual(0);
      expect(random2).toBeLessThan(1);
    });

    test('should generate random integers', () => {
      const randomInt = fuzzer.random.nextInt(10);

      expect(typeof randomInt).toBe('number');
      expect(randomInt).toBeGreaterThanOrEqual(0);
      expect(randomInt).toBeLessThan(10);
    });

    test('should generate random booleans', () => {
      const randomBool = fuzzer.random.nextBool();

      expect(typeof randomBool).toBe('boolean');
    });
  });
});
