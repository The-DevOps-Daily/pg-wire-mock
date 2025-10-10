/**
 * Tests for PostgreSQL Wire Protocol Message Builders
 * Covers all message builder functions and edge cases
 */

const {
  sendAuthenticationOK,
  sendParameterStatus,
  sendBackendKeyData,
  sendReadyForQuery,
  sendRowDescription,
  sendDataRow,
  sendCommandComplete,
  sendEmptyQueryResponse,
  sendErrorResponse,
  sendNoticeResponse,
  sendParseComplete,
  sendBindComplete,
  sendParameterDescription,
  sendNoData,
  sendPortalSuspended,
  sendCopyInResponse,
  sendCopyOutResponse,
  sendCopyData,
  sendAuthenticationMD5Password,
  sendAuthenticationCleartextPassword,
  sendNotificationResponse,
  configureProtocolLogger,
} = require('../../src/protocol/messageBuilders');

const {
  MESSAGE_TYPES,
  DATA_TYPES,
  ERROR_SEVERITY,
  ERROR_CODES,
} = require('../../src/protocol/constants');
const { ConnectionState } = require('../../src/connection/connectionState');

// Mock socket for testing
class MockSocket {
  constructor() {
    this.data = [];
    this.ended = false;
  }

  write(buffer) {
    this.data.push(buffer);
    return true;
  }

  end() {
    this.ended = true;
  }

  getLastMessage() {
    return this.data[this.data.length - 1];
  }

  getAllMessages() {
    return this.data;
  }

  clear() {
    this.data = [];
    this.ended = false;
  }
}

// Helper to parse message type and length from buffer
function parseMessage(buffer) {
  if (buffer.length < 5) return null;
  return {
    type: String.fromCharCode(buffer[0]),
    length: buffer.readInt32BE(1),
    payload: buffer.slice(5),
  };
}

describe('Message Builders', () => {
  let socket;
  let connState;

  beforeEach(() => {
    socket = new MockSocket();
    connState = new ConnectionState();
    connState.setParameter('user', 'testuser');
    connState.setParameter('database', 'testdb');
    connState.authenticate(196608);

    // Configure logger to suppress output during tests
    configureProtocolLogger({ enabled: false });
  });

  describe('Authentication and Connection Messages', () => {
    test('sendAuthenticationOK should send correct message', () => {
      sendAuthenticationOK(socket);

      const msg = parseMessage(socket.getLastMessage());
      expect(msg.type).toBe(MESSAGE_TYPES.AUTHENTICATION);
      expect(msg.payload.readInt32BE(0)).toBe(0); // Auth OK method = 0
    });

    test.skip('sendAuthenticationMD5Password should send correct message with salt', () => {
      // MD5 authentication not implemented yet
      const salt = Buffer.from([0x01, 0x02, 0x03, 0x04]);
      sendAuthenticationMD5Password(socket, salt);

      const msg = parseMessage(socket.getLastMessage());
      expect(msg.type).toBe(MESSAGE_TYPES.AUTHENTICATION);
      expect(msg.payload.readInt32BE(0)).toBe(5); // MD5 method = 5
      expect(msg.payload.slice(4, 8)).toEqual(salt);
    });

    test.skip('sendAuthenticationCleartextPassword should send correct message', () => {
      // Cleartext password authentication not implemented yet
      sendAuthenticationCleartextPassword(socket);

      const msg = parseMessage(socket.getLastMessage());
      expect(msg.type).toBe(MESSAGE_TYPES.AUTHENTICATION);
      expect(msg.payload.readInt32BE(0)).toBe(3); // Cleartext method = 3
    });

    test('sendParameterStatus should send multiple parameter messages', () => {
      sendParameterStatus(socket, connState);

      const messages = socket.getAllMessages();
      expect(messages.length).toBeGreaterThan(0);

      // Check first message is ParameterStatus
      const firstMsg = parseMessage(messages[0]);
      expect(firstMsg.type).toBe(MESSAGE_TYPES.PARAMETER_STATUS);
    });

    test('sendBackendKeyData should send process ID and secret key', () => {
      sendBackendKeyData(socket, connState);

      const msg = parseMessage(socket.getLastMessage());
      expect(msg.type).toBe(MESSAGE_TYPES.BACKEND_KEY_DATA);
      expect(msg.payload.length).toBe(8); // 4 bytes PID + 4 bytes secret

      const pid = msg.payload.readInt32BE(0);
      const secret = msg.payload.readInt32BE(4);
      expect(pid).toBeGreaterThan(0);
      expect(secret).toBeGreaterThan(0);
    });

    test('sendReadyForQuery should send transaction status', () => {
      connState.transactionStatus = 'I'; // Idle
      sendReadyForQuery(socket, connState);

      const msg = parseMessage(socket.getLastMessage());
      expect(msg.type).toBe(MESSAGE_TYPES.READY_FOR_QUERY);
      expect(msg.payload.length).toBe(1);
      expect(String.fromCharCode(msg.payload[0])).toBe('I');
    });

    test('sendReadyForQuery should handle transaction status', () => {
      connState.transactionStatus = 'T'; // In transaction
      sendReadyForQuery(socket, connState);

      const msg = parseMessage(socket.getLastMessage());
      expect(String.fromCharCode(msg.payload[0])).toBe('T');
    });
  });

  describe('Query Result Messages', () => {
    test('sendRowDescription should send correct column information', () => {
      const columns = [
        { name: 'id', dataTypeOID: DATA_TYPES.INT4, dataTypeSize: 4 },
        { name: 'name', dataTypeOID: DATA_TYPES.TEXT, dataTypeSize: -1 },
      ];

      sendRowDescription(socket, columns);

      const msg = parseMessage(socket.getLastMessage());
      expect(msg.type).toBe(MESSAGE_TYPES.ROW_DESCRIPTION);

      // First 2 bytes are column count
      const colCount = msg.payload.readInt16BE(0);
      expect(colCount).toBe(2);
    });

    test('sendRowDescription should handle empty columns', () => {
      sendRowDescription(socket, []);

      const msg = parseMessage(socket.getLastMessage());
      expect(msg.type).toBe(MESSAGE_TYPES.ROW_DESCRIPTION);

      const colCount = msg.payload.readInt16BE(0);
      expect(colCount).toBe(0);
    });

    test('sendDataRow should send row data', () => {
      const values = ['123', 'test'];
      sendDataRow(socket, values);

      const msg = parseMessage(socket.getLastMessage());
      expect(msg.type).toBe(MESSAGE_TYPES.DATA_ROW);

      // First 2 bytes are field count
      const fieldCount = msg.payload.readInt16BE(0);
      expect(fieldCount).toBe(2);
    });

    test('sendDataRow should handle NULL values', () => {
      const values = ['123', null, 'test'];
      sendDataRow(socket, values);

      const msg = parseMessage(socket.getLastMessage());
      expect(msg.type).toBe(MESSAGE_TYPES.DATA_ROW);

      const fieldCount = msg.payload.readInt16BE(0);
      expect(fieldCount).toBe(3);
    });

    test('sendDataRow should handle empty row', () => {
      sendDataRow(socket, []);

      const msg = parseMessage(socket.getLastMessage());
      expect(msg.type).toBe(MESSAGE_TYPES.DATA_ROW);

      const fieldCount = msg.payload.readInt16BE(0);
      expect(fieldCount).toBe(0);
    });

    test('sendCommandComplete should send command tag', () => {
      sendCommandComplete(socket, 'SELECT 5');

      const msg = parseMessage(socket.getLastMessage());
      expect(msg.type).toBe(MESSAGE_TYPES.COMMAND_COMPLETE);

      // Payload is null-terminated string
      const tag = msg.payload.toString('utf8', 0, msg.payload.length - 1);
      expect(tag).toBe('SELECT 5');
    });

    test('sendCommandComplete should handle commands without row count', () => {
      sendCommandComplete(socket, 'BEGIN');

      const msg = parseMessage(socket.getLastMessage());
      const tag = msg.payload.toString('utf8', 0, msg.payload.length - 1);
      expect(tag).toBe('BEGIN');
    });

    test('sendEmptyQueryResponse should send correct message', () => {
      sendEmptyQueryResponse(socket);

      const msg = parseMessage(socket.getLastMessage());
      expect(msg.type).toBe(MESSAGE_TYPES.EMPTY_QUERY_RESPONSE);
    });
  });

  describe('Error and Notice Messages', () => {
    test('sendErrorResponse should send error with all required fields', () => {
      sendErrorResponse(socket, ERROR_CODES.SYNTAX_ERROR, 'Test error');

      const msg = parseMessage(socket.getLastMessage());
      expect(msg.type).toBe(MESSAGE_TYPES.ERROR_RESPONSE);

      // Parse error fields
      const fields = parseErrorFields(msg.payload);
      expect(fields.S).toBe(ERROR_SEVERITY.ERROR);
      expect(fields.C).toBe(ERROR_CODES.SYNTAX_ERROR);
      expect(fields.M).toBe('Test error');
    });

    test('sendErrorResponse should include optional fields', () => {
      sendErrorResponse(
        socket,
        ERROR_CODES.SYNTAX_ERROR,
        'Test error',
        {},
        {
          detail: 'Detailed explanation',
          hint: 'Try this instead',
          position: '10',
        }
      );

      const msg = parseMessage(socket.getLastMessage());
      const fields = parseErrorFields(msg.payload);

      expect(fields.D).toBe('Detailed explanation');
      expect(fields.H).toBe('Try this instead');
      expect(fields.P).toBe('10');
    });

    test('sendErrorResponse should handle custom severity', () => {
      sendErrorResponse(
        socket,
        ERROR_CODES.WARNING,
        'Warning message',
        {},
        { severity: ERROR_SEVERITY.WARNING }
      );

      const msg = parseMessage(socket.getLastMessage());
      const fields = parseErrorFields(msg.payload);

      expect(fields.S).toBe(ERROR_SEVERITY.WARNING);
    });

    test('sendNoticeResponse should send notice message', () => {
      sendNoticeResponse(socket, 'Test notice');

      const msg = parseMessage(socket.getLastMessage());
      expect(msg.type).toBe(MESSAGE_TYPES.NOTICE_RESPONSE);

      const fields = parseErrorFields(msg.payload);
      expect(fields.S).toBe(ERROR_SEVERITY.NOTICE);
      expect(fields.M).toBe('Test notice');
    });

    test('sendNoticeResponse should include additional fields', () => {
      sendNoticeResponse(socket, 'Test notice', { H: 'Helpful hint' });

      const msg = parseMessage(socket.getLastMessage());
      const fields = parseErrorFields(msg.payload);

      expect(fields.H).toBe('Helpful hint');
    });
  });

  describe('Extended Query Protocol Messages', () => {
    test('sendParseComplete should send correct message', () => {
      sendParseComplete(socket);

      const msg = parseMessage(socket.getLastMessage());
      expect(msg.type).toBe(MESSAGE_TYPES.PARSE_COMPLETE);
    });

    test('sendBindComplete should send correct message', () => {
      sendBindComplete(socket);

      const msg = parseMessage(socket.getLastMessage());
      expect(msg.type).toBe(MESSAGE_TYPES.BIND_COMPLETE);
    });

    test('sendParameterDescription should send parameter types', () => {
      const paramTypes = [DATA_TYPES.INT4, DATA_TYPES.TEXT];
      sendParameterDescription(socket, paramTypes);

      const msg = parseMessage(socket.getLastMessage());
      expect(msg.type).toBe(MESSAGE_TYPES.PARAMETER_DESCRIPTION);

      // First 2 bytes are parameter count
      const paramCount = msg.payload.readInt16BE(0);
      expect(paramCount).toBe(2);
    });

    test('sendParameterDescription should handle no parameters', () => {
      sendParameterDescription(socket, []);

      const msg = parseMessage(socket.getLastMessage());
      const paramCount = msg.payload.readInt16BE(0);
      expect(paramCount).toBe(0);
    });

    test('sendNoData should send correct message', () => {
      sendNoData(socket);

      const msg = parseMessage(socket.getLastMessage());
      expect(msg.type).toBe(MESSAGE_TYPES.NO_DATA);
    });

    test('sendPortalSuspended should send correct message', () => {
      sendPortalSuspended(socket);

      const msg = parseMessage(socket.getLastMessage());
      expect(msg.type).toBe(MESSAGE_TYPES.PORTAL_SUSPENDED);
    });
  });

  describe('COPY Protocol Messages', () => {
    test('sendCopyInResponse should send copy format and columns', () => {
      sendCopyInResponse(socket, 0, [0, 0, 0]);

      const msg = parseMessage(socket.getLastMessage());
      expect(msg.type).toBe(MESSAGE_TYPES.COPY_IN_RESPONSE);

      const format = msg.payload.readInt8(0);
      const colCount = msg.payload.readInt16BE(1);
      expect(format).toBe(0); // Text format
      expect(colCount).toBe(3);
    });

    test('sendCopyOutResponse should send copy format and columns', () => {
      sendCopyOutResponse(socket, 1, [1, 1]);

      const msg = parseMessage(socket.getLastMessage());
      expect(msg.type).toBe(MESSAGE_TYPES.COPY_OUT_RESPONSE);

      const format = msg.payload.readInt8(0);
      const colCount = msg.payload.readInt16BE(1);
      expect(format).toBe(1); // Binary format
      expect(colCount).toBe(2);
    });

    test('sendCopyData should send copy data', () => {
      const data = Buffer.from('test data');
      sendCopyData(socket, data);

      const msg = parseMessage(socket.getLastMessage());
      expect(msg.type).toBe(MESSAGE_TYPES.COPY_DATA);
      expect(msg.payload).toEqual(data);
    });
  });

  describe('Notification Messages', () => {
    test('sendNotificationResponse should send notification', () => {
      sendNotificationResponse(socket, 12345, 'test_channel', 'test payload');

      const msg = parseMessage(socket.getLastMessage());
      expect(msg.type).toBe(MESSAGE_TYPES.NOTIFICATION_RESPONSE);

      // PID is first 4 bytes
      const pid = msg.payload.readInt32BE(0);
      expect(pid).toBe(12345);
    });

    test('sendNotificationResponse should handle empty payload', () => {
      sendNotificationResponse(socket, 12345, 'test_channel');

      const msg = parseMessage(socket.getLastMessage());
      expect(msg.type).toBe(MESSAGE_TYPES.NOTIFICATION_RESPONSE);
    });
  });

  describe('Edge Cases and Error Handling', () => {
    test('should handle very long error messages', () => {
      const longMessage = 'A'.repeat(10000);
      sendErrorResponse(socket, ERROR_CODES.INTERNAL_ERROR, longMessage);

      const msg = parseMessage(socket.getLastMessage());
      expect(msg.type).toBe(MESSAGE_TYPES.ERROR_RESPONSE);
    });

    test('should handle special characters in error messages', () => {
      const specialMessage = 'Error with \'quotes\' and "double quotes" and \n newlines';
      sendErrorResponse(socket, ERROR_CODES.SYNTAX_ERROR, specialMessage);

      const msg = parseMessage(socket.getLastMessage());
      const fields = parseErrorFields(msg.payload);
      expect(fields.M).toBe(specialMessage);
    });

    test('should handle unicode in messages', () => {
      const unicodeMessage = 'Error: 你好世界 🚀';
      sendErrorResponse(socket, ERROR_CODES.SYNTAX_ERROR, unicodeMessage);

      const msg = parseMessage(socket.getLastMessage());
      const fields = parseErrorFields(msg.payload);
      expect(fields.M).toBe(unicodeMessage);
    });

    test('should handle large row data', () => {
      const largeValues = Array(100).fill('x'.repeat(1000));
      sendDataRow(socket, largeValues);

      const msg = parseMessage(socket.getLastMessage());
      expect(msg.type).toBe(MESSAGE_TYPES.DATA_ROW);
    });

    test('should handle many columns in RowDescription', () => {
      const manyColumns = Array(100)
        .fill(null)
        .map((_, i) => ({
          name: `col${i}`,
          dataTypeOID: DATA_TYPES.TEXT,
          dataTypeSize: -1,
        }));

      sendRowDescription(socket, manyColumns);

      const msg = parseMessage(socket.getLastMessage());
      const colCount = msg.payload.readInt16BE(0);
      expect(colCount).toBe(100);
    });
  });
});

// Helper function to parse error/notice fields
function parseErrorFields(payload) {
  const fields = {};
  let offset = 0;

  while (offset < payload.length) {
    const fieldType = String.fromCharCode(payload[offset]);
    if (fieldType === '\0') break;

    offset++;
    const endIndex = payload.indexOf(0, offset);
    if (endIndex === -1) break;

    const value = payload.toString('utf8', offset, endIndex);
    fields[fieldType] = value;
    offset = endIndex + 1;
  }

  return fields;
}
