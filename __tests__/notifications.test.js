/**
 * Tests for LISTEN/NOTIFY functionality
 */

jest.mock('../src/protocol/messageBuilders', () => {
  return {
    sendNotificationResponse: jest.fn(),
    // The handlers import other builders too, but we only need this here
  };
});

const { NotificationManager } = require('../src/notification/notificationManager');
const { ConnectionState } = require('../src/connection/connectionState');
const { processQuery } = require('../src/handlers/queryHandlers');

const { sendNotificationResponse } = require('../src/protocol/messageBuilders');

describe('LISTEN/NOTIFY', () => {
  function createMockConn(id, notificationManager) {
    const conn = new ConnectionState();
    conn.connectionId = id;
    conn.setNotificationManager(notificationManager);
    // Minimal mock socket
    const socket = { writable: true, write: jest.fn() };
    conn.setSocket(socket);
    return conn;
  }

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('should deliver NOTIFY to listening client', () => {
    const nm = new NotificationManager({ enableLogging: false });

    const conn1 = createMockConn('c1', nm);
    const conn2 = createMockConn('c2', nm);

    // LISTEN on conn1
    const resListen = processQuery('LISTEN events;', conn1);
    expect(resListen.command).toBe('LISTEN');

    // NOTIFY from conn2
    const resNotify = processQuery("NOTIFY events, 'hello';", conn2);
    expect(resNotify.command).toBe('NOTIFY');

    // Ensure a notification was sent to conn1 via message builders
    expect(sendNotificationResponse).toHaveBeenCalledTimes(1);
    const args = sendNotificationResponse.mock.calls[0];
    // args: (socket, pid, channel, payload)
    expect(args[0]).toBe(conn1.getSocket());
    expect(args[2]).toBe('events');
    expect(args[3]).toBe('hello');
  });

  test('UNLISTEN removes listener and notifications stop', () => {
    const nm = new NotificationManager({ enableLogging: false });

    const conn1 = createMockConn('c1', nm);
    const conn2 = createMockConn('c2', nm);

    processQuery('LISTEN jobs;', conn1);
    expect(conn1.isListeningToChannel('jobs')).toBe(true);

    // Unlisten specific
    const resUnlisten = processQuery('UNLISTEN jobs;', conn1);
    expect(resUnlisten.command).toBe('UNLISTEN');
    expect(conn1.isListeningToChannel('jobs')).toBe(false);

    // Now notify; should not deliver because no listeners
    processQuery("NOTIFY jobs, 'x';", conn2);
    expect(sendNotificationResponse).not.toHaveBeenCalled();
  });

  test('UNLISTEN * removes all listeners', () => {
    const nm = new NotificationManager({ enableLogging: false });

    const conn = createMockConn('c1', nm);
    processQuery('LISTEN a;', conn);
    processQuery('LISTEN b;', conn);
    expect(conn.getListeningChannels().sort()).toEqual(['a', 'b']);

    const res = processQuery('UNLISTEN *;', conn);
    expect(res.command).toBe('UNLISTEN');
    expect(conn.getListeningChannels()).toHaveLength(0);
  });
});
