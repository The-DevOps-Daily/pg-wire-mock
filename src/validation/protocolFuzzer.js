/**
 * PostgreSQL Wire Protocol Fuzzer
 * Generates malformed messages for testing robustness
 */

const { MESSAGE_TYPES, AUTH_METHODS, ERROR_CODES } = require('../protocol/constants');

/**
 * Protocol fuzzer class
 */
class ProtocolFuzzer {
  constructor() {
    this.fuzzingStrategies = this.initializeFuzzingStrategies();
    this.random = this.createSeededRandom();
  }

  /**
   * Initialize fuzzing strategies
   * @returns {Object} Fuzzing strategies
   */
  initializeFuzzingStrategies() {
    return {
      messageCorruption: [
        'bitFlip',
        'byteSwap',
        'lengthCorruption',
        'typeCorruption',
        'payloadTruncation',
        'payloadExpansion'
      ],
      boundaryTesting: [
        'minimumLength',
        'maximumLength',
        'zeroLength',
        'negativeLength',
        'overflowLength'
      ],
      encodingIssues: [
        'invalidUTF8',
        'nullByteInjection',
        'unicodeOverflow',
        'encodingMismatch'
      ],
      protocolViolations: [
        'invalidMessageSequence',
        'missingRequiredFields',
        'extraFields',
        'wrongFieldTypes'
      ]
    };
  }

  /**
   * Create seeded random number generator
   * @returns {Object} Random number generator
   */
  createSeededRandom() {
    let seed = Date.now();
    return {
      next() {
        seed = (seed * 9301 + 49297) % 233280;
        return seed / 233280;
      },
      nextInt(max) {
        return Math.floor(this.next() * max);
      },
      nextBool() {
        return this.next() > 0.5;
      }
    };
  }

  /**
   * Run fuzzing tests
   * @param {Object} options - Fuzzing options
   * @returns {Promise<Object>} Fuzzing results
   */
  async runFuzzingTests(options = {}) {
    const config = {
      iterations: options.iterations || 1000,
      strategies: options.strategies || Object.keys(this.fuzzingStrategies),
      messageTypes: options.messageTypes || Object.values(MESSAGE_TYPES),
      ...options
    };

    const results = {
      total: 0,
      passed: 0,
      failed: 0,
      warnings: 0,
      strategies: {},
      crashes: [],
      timeouts: [],
      details: {}
    };

    for (const strategy of config.strategies) {
      results.strategies[strategy] = {
        total: 0,
        passed: 0,
        failed: 0,
        warnings: 0,
        crashes: 0,
        timeouts: 0
      };

      const strategyResults = await this.runFuzzingStrategy(strategy, config);
      results.strategies[strategy] = { ...results.strategies[strategy], ...strategyResults };
      
      results.total += strategyResults.total;
      results.passed += strategyResults.passed;
      results.failed += strategyResults.failed;
      results.warnings += strategyResults.warnings;
      results.crashes.push(...strategyResults.crashes || []);
      results.timeouts.push(...strategyResults.timeouts || []);
    }

    return results;
  }

  /**
   * Run fuzzing for a specific strategy
   * @param {string} strategy - Fuzzing strategy
   * @param {Object} config - Fuzzing configuration
   * @returns {Promise<Object>} Strategy results
   */
  async runFuzzingStrategy(strategy, config) {
    const results = {
      total: 0,
      passed: 0,
      failed: 0,
      warnings: 0,
      crashes: [],
      timeouts: [],
      details: {}
    };

    const fuzzingMethods = this.fuzzingStrategies[strategy] || [];
    
    for (const method of fuzzingMethods) {
      for (let i = 0; i < config.iterations; i++) {
        try {
          results.total++;
          
          // Generate fuzzed message
          const fuzzedMessage = this.generateFuzzedMessage(strategy, method, config);
          
          // Test the fuzzed message
          const testResult = await this.testFuzzedMessage(fuzzedMessage, strategy, method);
          
          if (testResult.passed) {
            results.passed++;
          } else {
            results.failed++;
          }
          
          if (testResult.warnings && testResult.warnings.length > 0) {
            results.warnings += testResult.warnings.length;
          }
          
          if (testResult.crashed) {
            results.crashes.push({
              strategy,
              method,
              iteration: i,
              message: fuzzedMessage,
              error: testResult.error
            });
          }
          
          if (testResult.timedOut) {
            results.timeouts.push({
              strategy,
              method,
              iteration: i,
              message: fuzzedMessage
            });
          }
          
        } catch (error) {
          results.failed++;
          results.crashes.push({
            strategy,
            method,
            iteration: i,
            error: error.message
          });
        }
      }
    }

    return results;
  }

  /**
   * Generate fuzzed message
   * @param {string} strategy - Fuzzing strategy
   * @param {string} method - Fuzzing method
   * @param {Object} config - Fuzzing configuration
   * @returns {Buffer} Fuzzed message
   */
  generateFuzzedMessage(strategy, method, config) {
    const messageType = config.messageTypes[this.random.nextInt(config.messageTypes.length)];
    const baseMessage = this.createBaseMessage(messageType);
    
    switch (strategy) {
      case 'messageCorruption':
        return this.corruptMessage(baseMessage, method);
      case 'boundaryTesting':
        return this.testBoundaries(baseMessage, method);
      case 'encodingIssues':
        return this.introduceEncodingIssues(baseMessage, method);
      case 'protocolViolations':
        return this.introduceProtocolViolations(baseMessage, method);
      default:
        return baseMessage;
    }
  }

  /**
   * Test fuzzed message
   * @param {Buffer} message - Fuzzed message
   * @param {string} strategy - Fuzzing strategy
   * @param {string} method - Fuzzing method
   * @returns {Promise<Object>} Test result
   */
  async testFuzzedMessage(message, strategy, method) {
    const result = {
      passed: false,
      warnings: [],
      crashed: false,
      timedOut: false,
      error: null
    };

    try {
      // Set timeout for testing
      const timeout = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Test timeout')), 5000);
      });

      const testPromise = this.performFuzzingTest(message);
      
      await Promise.race([testPromise, timeout]);
      
      // If we get here, the message was handled without crashing
      result.passed = true;
      
    } catch (error) {
      if (error.message === 'Test timeout') {
        result.timedOut = true;
        result.warnings.push('Test timed out');
      } else {
        result.crashed = true;
        result.error = error.message;
      }
    }

    return result;
  }

  /**
   * Perform actual fuzzing test
   * @param {Buffer} message - Message to test
   * @returns {Promise<void>}
   */
  async performFuzzingTest(message) {
    // Simulate message processing
    // In a real implementation, this would call the actual message processor
    
    // Basic validation
    if (message.length < 1) {
      throw new Error('Message too short');
    }
    
    if (message.length > 1024 * 1024) {
      throw new Error('Message too long');
    }
    
    // Check message type
    const messageType = String.fromCharCode(message[0]);
    if (!Object.values(MESSAGE_TYPES).includes(messageType)) {
      throw new Error(`Invalid message type: ${messageType}`);
    }
    
    // Check length field
    if (message.length >= 5) {
      const length = message.readInt32BE(1);
      if (length < 0) {
        throw new Error('Negative length');
      }
      if (length > message.length - 1) {
        throw new Error('Length exceeds message size');
      }
    }
    
    // Simulate processing delay
    await new Promise(resolve => setTimeout(resolve, Math.random() * 10));
  }

  /**
   * Create base message for fuzzing
   * @param {string} messageType - Message type
   * @returns {Buffer} Base message
   */
  createBaseMessage(messageType) {
    switch (messageType) {
      case MESSAGE_TYPES.QUERY:
        return this.createQueryMessage('SELECT 1');
      case MESSAGE_TYPES.SYNC:
        return this.createSyncMessage();
      case MESSAGE_TYPES.TERMINATE:
        return this.createTerminateMessage();
      case MESSAGE_TYPES.AUTHENTICATION:
        return this.createAuthenticationMessage(AUTH_METHODS.OK);
      case MESSAGE_TYPES.READY_FOR_QUERY:
        return this.createReadyForQueryMessage('I');
      default:
        return this.createBasicMessage(messageType);
    }
  }

  /**
   * Corrupt message using specified method
   * @param {Buffer} message - Original message
   * @param {string} method - Corruption method
   * @returns {Buffer} Corrupted message
   */
  corruptMessage(message, method) {
    const corrupted = Buffer.from(message);
    
    switch (method) {
      case 'bitFlip':
        return this.flipRandomBits(corrupted);
      case 'byteSwap':
        return this.swapRandomBytes(corrupted);
      case 'lengthCorruption':
        return this.corruptLength(corrupted);
      case 'typeCorruption':
        return this.corruptType(corrupted);
      case 'payloadTruncation':
        return this.truncatePayload(corrupted);
      case 'payloadExpansion':
        return this.expandPayload(corrupted);
      default:
        return corrupted;
    }
  }

  /**
   * Test boundary conditions
   * @param {Buffer} message - Original message
   * @param {string} method - Boundary test method
   * @returns {Buffer} Modified message
   */
  testBoundaries(message, method) {
    switch (method) {
      case 'minimumLength':
        return Buffer.alloc(1); // Minimum possible message
      case 'maximumLength':
        return Buffer.alloc(1024 * 1024); // Maximum reasonable length
      case 'zeroLength':
        const zeroLength = Buffer.from(message);
        if (zeroLength.length >= 5) {
          zeroLength.writeInt32BE(0, 1);
        }
        return zeroLength;
      case 'negativeLength':
        const negativeLength = Buffer.from(message);
        if (negativeLength.length >= 5) {
          negativeLength.writeInt32BE(-1, 1);
        }
        return negativeLength;
      case 'overflowLength':
        const overflowLength = Buffer.from(message);
        if (overflowLength.length >= 5) {
          overflowLength.writeInt32BE(0x7FFFFFFF, 1);
        }
        return overflowLength;
      default:
        return message;
    }
  }

  /**
   * Introduce encoding issues
   * @param {Buffer} message - Original message
   * @param {string} method - Encoding issue method
   * @returns {Buffer} Modified message
   */
  introduceEncodingIssues(message, method) {
    switch (method) {
      case 'invalidUTF8':
        return this.introduceInvalidUTF8(message);
      case 'nullByteInjection':
        return this.injectNullBytes(message);
      case 'unicodeOverflow':
        return this.introduceUnicodeOverflow(message);
      case 'encodingMismatch':
        return this.introduceEncodingMismatch(message);
      default:
        return message;
    }
  }

  /**
   * Introduce protocol violations
   * @param {Buffer} message - Original message
   * @param {string} method - Protocol violation method
   * @returns {Buffer} Modified message
   */
  introduceProtocolViolations(message, method) {
    switch (method) {
      case 'invalidMessageSequence':
        return this.createInvalidSequence(message);
      case 'missingRequiredFields':
        return this.removeRequiredFields(message);
      case 'extraFields':
        return this.addExtraFields(message);
      case 'wrongFieldTypes':
        return this.changeFieldTypes(message);
      default:
        return message;
    }
  }

  // Corruption methods
  flipRandomBits(buffer) {
    const corrupted = Buffer.from(buffer);
    const bitCount = Math.max(1, Math.floor(this.random.next() * 8));
    
    for (let i = 0; i < bitCount; i++) {
      const byteIndex = this.random.nextInt(corrupted.length);
      const bitIndex = this.random.nextInt(8);
      corrupted[byteIndex] ^= (1 << bitIndex);
    }
    
    return corrupted;
  }

  swapRandomBytes(buffer) {
    const corrupted = Buffer.from(buffer);
    const swapCount = Math.max(1, Math.floor(this.random.next() * 4));
    
    for (let i = 0; i < swapCount; i++) {
      const index1 = this.random.nextInt(corrupted.length);
      const index2 = this.random.nextInt(corrupted.length);
      const temp = corrupted[index1];
      corrupted[index1] = corrupted[index2];
      corrupted[index2] = temp;
    }
    
    return corrupted;
  }

  corruptLength(buffer) {
    const corrupted = Buffer.from(buffer);
    if (corrupted.length >= 5) {
      const corruptions = [
        () => corrupted.writeInt32BE(0, 1), // Zero length
        () => corrupted.writeInt32BE(-1, 1), // Negative length
        () => corrupted.writeInt32BE(0x7FFFFFFF, 1), // Max int
        () => corrupted.writeInt32BE(corrupted.length + 1000, 1), // Too long
        () => corrupted.writeInt32BE(corrupted.length - 10, 1) // Too short
      ];
      
      const corruption = corruptions[this.random.nextInt(corruptions.length)];
      corruption();
    }
    
    return corrupted;
  }

  corruptType(buffer) {
    const corrupted = Buffer.from(buffer);
    if (corrupted.length > 0) {
      corrupted[0] = this.random.nextInt(256); // Random byte
    }
    return corrupted;
  }

  truncatePayload(buffer) {
    if (buffer.length <= 5) return buffer;
    
    const truncated = Buffer.from(buffer);
    const newLength = Math.max(5, Math.floor(this.random.next() * buffer.length));
    return truncated.slice(0, newLength);
  }

  expandPayload(buffer) {
    const expanded = Buffer.alloc(buffer.length + 1000);
    buffer.copy(expanded);
    
    // Fill with random data
    for (let i = buffer.length; i < expanded.length; i++) {
      expanded[i] = this.random.nextInt(256);
    }
    
    // Update length field
    if (expanded.length >= 5) {
      expanded.writeInt32BE(expanded.length - 1, 1);
    }
    
    return expanded;
  }

  // Boundary testing methods
  introduceInvalidUTF8(buffer) {
    const corrupted = Buffer.from(buffer);
    const invalidUTF8 = Buffer.from([0xFF, 0xFE, 0xFD]);
    
    // Insert invalid UTF8 sequences
    for (let i = 0; i < corrupted.length - 3; i += 10) {
      if (this.random.nextBool()) {
        invalidUTF8.copy(corrupted, i);
      }
    }
    
    return corrupted;
  }

  injectNullBytes(buffer) {
    const corrupted = Buffer.from(buffer);
    
    // Inject null bytes at random positions
    for (let i = 0; i < corrupted.length; i++) {
      if (this.random.next() < 0.1) { // 10% chance
        corrupted[i] = 0;
      }
    }
    
    return corrupted;
  }

  introduceUnicodeOverflow(buffer) {
    const corrupted = Buffer.from(buffer);
    const unicodeOverflow = Buffer.from('🚀'.repeat(1000), 'utf8');
    
    // Insert unicode overflow at random positions
    const insertPos = this.random.nextInt(Math.max(1, corrupted.length - unicodeOverflow.length));
    unicodeOverflow.copy(corrupted, insertPos);
    
    return corrupted;
  }

  introduceEncodingMismatch(buffer) {
    // Convert to different encoding and back
    const text = buffer.toString('utf8');
    const latin1 = Buffer.from(text, 'latin1');
    return Buffer.from(latin1.toString('utf8'), 'utf8');
  }

  // Protocol violation methods
  createInvalidSequence(buffer) {
    // Create a message that violates protocol sequence
    const invalid = Buffer.from(buffer);
    if (invalid.length > 0) {
      // Change to a message type that shouldn't appear in this context
      invalid[0] = MESSAGE_TYPES.ERROR_RESPONSE.charCodeAt(0);
    }
    return invalid;
  }

  removeRequiredFields(buffer) {
    // Remove required fields by truncating
    if (buffer.length > 5) {
      return buffer.slice(0, 3); // Too short for any valid message
    }
    return buffer;
  }

  addExtraFields(buffer) {
    // Add extra data to the message
    const extra = Buffer.alloc(buffer.length + 100);
    buffer.copy(extra);
    
    // Fill with random data
    for (let i = buffer.length; i < extra.length; i++) {
      extra[i] = this.random.nextInt(256);
    }
    
    // Update length
    if (extra.length >= 5) {
      extra.writeInt32BE(extra.length - 1, 1);
    }
    
    return extra;
  }

  changeFieldTypes(buffer) {
    const corrupted = Buffer.from(buffer);
    
    // Change field types by swapping bytes
    for (let i = 0; i < corrupted.length - 1; i += 2) {
      if (this.random.nextBool()) {
        const temp = corrupted[i];
        corrupted[i] = corrupted[i + 1];
        corrupted[i + 1] = temp;
      }
    }
    
    return corrupted;
  }

  // Helper methods for creating base messages
  createQueryMessage(query) {
    const queryBuffer = Buffer.from(query + '\0', 'utf8');
    const length = queryBuffer.length + 4;
    const buffer = Buffer.alloc(1 + 4 + queryBuffer.length);
    buffer[0] = MESSAGE_TYPES.QUERY.charCodeAt(0);
    buffer.writeInt32BE(length, 1);
    queryBuffer.copy(buffer, 5);
    return buffer;
  }

  createSyncMessage() {
    const buffer = Buffer.alloc(5);
    buffer[0] = MESSAGE_TYPES.SYNC.charCodeAt(0);
    buffer.writeInt32BE(4, 1);
    return buffer;
  }

  createTerminateMessage() {
    const buffer = Buffer.alloc(5);
    buffer[0] = MESSAGE_TYPES.TERMINATE.charCodeAt(0);
    buffer.writeInt32BE(4, 1);
    return buffer;
  }

  createAuthenticationMessage(authMethod) {
    const buffer = Buffer.alloc(9);
    buffer[0] = MESSAGE_TYPES.AUTHENTICATION.charCodeAt(0);
    buffer.writeInt32BE(8, 1);
    buffer.writeInt32BE(authMethod, 5);
    return buffer;
  }

  createReadyForQueryMessage(status) {
    const buffer = Buffer.alloc(6);
    buffer[0] = MESSAGE_TYPES.READY_FOR_QUERY.charCodeAt(0);
    buffer.writeInt32BE(5, 1);
    buffer[5] = status.charCodeAt(0);
    return buffer;
  }

  createBasicMessage(messageType) {
    const buffer = Buffer.alloc(5);
    buffer[0] = messageType.charCodeAt(0);
    buffer.writeInt32BE(4, 1);
    return buffer;
  }
}

module.exports = ProtocolFuzzer;


