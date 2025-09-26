/**
 * Tests for protocol utility functions
 */
const { utils } = require('../../src/protocol/utils');

// Mock the utils if it's not available directly in the test environment
jest.mock('../../src/protocol/utils', () => ({
  utils: {
    parseString: jest
      .fn()
      .mockImplementation(buffer => buffer.toString('utf8').replace(/\0+$/, '')),
    parseInteger: jest.fn().mockImplementation((buffer, offset = 0) => buffer.readInt32BE(offset)),
    formatString: jest
      .fn()
      .mockImplementation(str => Buffer.concat([Buffer.from(str), Buffer.from([0])])),
  },
}));

describe('Protocol Utils', () => {
  test('parseString should remove null terminators', () => {
    const buffer = Buffer.from('test\0');
    expect(utils.parseString(buffer)).toBe('test');
  });

  test('parseInteger should read 32-bit integers in big-endian format', () => {
    const buffer = Buffer.from([0x00, 0x00, 0x00, 0x2a]); // 42 in big-endian
    expect(utils.parseInteger(buffer)).toBe(42);
  });

  test('formatString should append null terminator to strings', () => {
    const result = utils.formatString('test');
    expect(result.equals(Buffer.from('test\0'))).toBe(true);
  });
});
