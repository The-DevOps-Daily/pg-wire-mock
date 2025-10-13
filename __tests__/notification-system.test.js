/**
 * Tests for PostgreSQL LISTEN/NOTIFY notification system
 */

const { NotificationManager } = require('../src/notification/notificationManager');
const { ConnectionState } = require('../src/connection/connectionState');
const {
  handleListenQuery,
  handleUnlistenQuery,
  handleNotifyQuery,
} = require('../src/handlers/queryHandlers');

describe('Notification System', () => {
  let notificationManager;
  let mockSocket;
  let mockConnState;

  beforeEach(() => {
    notificationManager = new NotificationManager({
      enableLogging: false,
      logLevel: 'silent',
    });

    mockSocket = {
      write: jest.fn(),
      writable: true,
      destroyed: false,
    };

    mockConnState = new ConnectionState();
    mockConnState.connectionId = 'test_conn_1';
    mockConnState.backendPid = 12345;
    mockConnState.setNotificationManager(notificationManager);
    mockConnState.setSocket(mockSocket);
  });

  afterEach(() => {
    notificationManager.shutdown();
  });

  describe('NotificationManager', () => {
    describe('Channel Management', () => {
      test('should create channels automatically when first listener subscribes', () => {
        const result = notificationManager.addListener(
          'conn1',
          'test_channel',
          mockSocket,
          mockConnState
        );

        expect(result.success).toBe(true);
        expect(notificationManager.getAllChannels()).toContain('test_channel');
        expect(notificationManager.getListenersForChannel('test_channel')).toHaveLength(1);
      });

      test('should validate channel names', () => {
        const invalidChannels = ['', '123invalid', 'invalid-name', 'invalid name', 'invalid.name'];

        for (const channel of invalidChannels) {
          const result = notificationManager.addListener(
            'conn1',
            channel,
            mockSocket,
            mockConnState
          );
          expect(result.success).toBe(false);
          expect(result.error).toContain('Channel name must');
        }
      });

      test('should enforce channel name length limit', () => {
        const longChannelName = 'a'.repeat(64); // Exceeds 63 character limit

        const result = notificationManager.addListener(
          'conn1',
          longChannelName,
          mockSocket,
          mockConnState
        );
        expect(result.success).toBe(false);
        expect(result.error).toContain('Channel name too long');
      });

      test('should enforce maximum channels limit', () => {
        // Create max channels
        for (let i = 0; i < 1000; i++) {
          const result = notificationManager.addListener(
            `conn${i}`,
            `channel${i}`,
            mockSocket,
            mockConnState
          );
          expect(result.success).toBe(true);
        }

        // Try to create one more
        const result = notificationManager.addListener(
          'conn1000',
          'channel1000',
          mockSocket,
          mockConnState
        );
        expect(result.success).toBe(false);
        expect(result.error).toContain('Maximum number of notification channels');
      });

      test('should enforce maximum listeners per channel limit', () => {
        // Add max listeners to a channel
        for (let i = 0; i < 100; i++) {
          const result = notificationManager.addListener(
            `conn${i}`,
            'test_channel',
            mockSocket,
            mockConnState
          );
          expect(result.success).toBe(true);
        }

        // Try to add one more
        const result = notificationManager.addListener(
          'conn100',
          'test_channel',
          mockSocket,
          mockConnState
        );
        expect(result.success).toBe(false);
        expect(result.error).toContain('Maximum number of listeners per channel');
      });
    });

    describe('Listener Management', () => {
      test('should add and remove listeners correctly', () => {
        // Add listener
        let result = notificationManager.addListener(
          'conn1',
          'test_channel',
          mockSocket,
          mockConnState
        );
        expect(result.success).toBe(true);

        // Check listener exists
        const listeners = notificationManager.getListenersForChannel('test_channel');
        expect(listeners).toHaveLength(1);
        expect(listeners[0].connectionId).toBe('conn1');

        // Remove listener
        result = notificationManager.removeListener('conn1', 'test_channel');
        expect(result.success).toBe(true);

        // Check listener removed
        expect(notificationManager.getListenersForChannel('test_channel')).toHaveLength(0);
      });

      test('should handle duplicate listeners gracefully', () => {
        // Add listener twice
        notificationManager.addListener('conn1', 'test_channel', mockSocket, mockConnState);
        const result = notificationManager.addListener(
          'conn1',
          'test_channel',
          mockSocket,
          mockConnState
        );

        expect(result.success).toBe(true);
        expect(result.message).toBe('Already listening to channel');
        expect(notificationManager.getListenersForChannel('test_channel')).toHaveLength(1);
      });

      test('should remove all listeners for a connection', () => {
        // Add listeners to multiple channels
        notificationManager.addListener('conn1', 'channel1', mockSocket, mockConnState);
        notificationManager.addListener('conn1', 'channel2', mockSocket, mockConnState);
        notificationManager.addListener('conn1', 'channel3', mockSocket, mockConnState);

        expect(notificationManager.getChannelsForConnection('conn1')).toHaveLength(3);

        // Remove all listeners
        const removedCount = notificationManager.removeAllListenersForConnection('conn1');
        expect(removedCount).toBe(3);
        expect(notificationManager.getChannelsForConnection('conn1')).toHaveLength(0);
      });

      test('should handle removing non-existent listeners gracefully', () => {
        const result = notificationManager.removeListener('conn1', 'non_existent_channel');
        expect(result.success).toBe(true);
        expect(result.message).toBe('Not listening to channel');
      });
    });

    describe('Notification Broadcasting', () => {
      test('should send notifications to all listeners on a channel', () => {
        // Add multiple listeners
        const socket1 = { write: jest.fn(), writable: true, destroyed: false };
        const socket2 = { write: jest.fn(), writable: true, destroyed: false };
        const socket3 = { write: jest.fn(), writable: true, destroyed: false };

        notificationManager.addListener('conn1', 'test_channel', socket1, mockConnState);
        notificationManager.addListener('conn2', 'test_channel', socket2, mockConnState);
        notificationManager.addListener('conn3', 'test_channel', socket3, mockConnState);

        // Send notification
        const result = notificationManager.sendNotification('test_channel', 'test payload', 12345);

        expect(result.success).toBe(true);
        expect(result.deliveredTo).toBe(3);
        expect(result.failedTo).toBe(0);

        // Check that all sockets received the notification
        expect(socket1.write).toHaveBeenCalled();
        expect(socket2.write).toHaveBeenCalled();
        expect(socket3.write).toHaveBeenCalled();
      });

      test('should validate notification payloads', () => {
        // Test null payload (should be converted to empty string)
        let result = notificationManager.sendNotification('test_channel', null, 12345);
        expect(result.success).toBe(true);

        // Test undefined payload (should be converted to empty string)
        result = notificationManager.sendNotification('test_channel', undefined, 12345);
        expect(result.success).toBe(true);

        // Test non-string payload
        result = notificationManager.sendNotification('test_channel', 123, 12345);
        expect(result.success).toBe(false);
        expect(result.error).toContain('Notification payload must be a string');

        // Test payload too long
        const longPayload = 'a'.repeat(8001); // Exceeds 8000 character limit
        result = notificationManager.sendNotification('test_channel', longPayload, 12345);
        expect(result.success).toBe(false);
        expect(result.error).toContain('Notification payload too long');
      });

      test('should handle notifications to non-existent channels', () => {
        const result = notificationManager.sendNotification('non_existent_channel', 'test', 12345);

        expect(result.success).toBe(true);
        expect(result.message).toBe('No listeners on channel');
        expect(result.deliveredTo).toBe(0);
      });

      test('should handle failed deliveries gracefully', () => {
        // Add listener with broken socket
        const brokenSocket = {
          write: jest.fn().mockImplementation(() => {
            throw new Error('Socket error');
          }),
          writable: true,
          destroyed: false,
        };

        const workingSocket = { write: jest.fn(), writable: true, destroyed: false };

        notificationManager.addListener('conn1', 'test_channel', brokenSocket, mockConnState);
        notificationManager.addListener('conn2', 'test_channel', workingSocket, mockConnState);

        // Send notification
        const result = notificationManager.sendNotification('test_channel', 'test', 12345);

        expect(result.success).toBe(true);
        expect(result.deliveredTo).toBe(1);
        expect(result.failedTo).toBe(1);
        expect(workingSocket.write).toHaveBeenCalled();
      });

      test('should skip inactive listeners', () => {
        const socket1 = { write: jest.fn(), writable: false, destroyed: false };
        const socket2 = { write: jest.fn(), writable: true, destroyed: false };

        notificationManager.addListener('conn1', 'test_channel', socket1, mockConnState);
        notificationManager.addListener('conn2', 'test_channel', socket2, mockConnState);

        // Send notification
        const result = notificationManager.sendNotification('test_channel', 'test', 12345);

        expect(result.success).toBe(true);
        expect(result.deliveredTo).toBe(1);
        expect(result.failedTo).toBe(1);
        expect(socket2.write).toHaveBeenCalled();
        expect(socket1.write).not.toHaveBeenCalled();
      });
    });

    describe('Statistics', () => {
      test('should track statistics correctly', () => {
        const initialStats = notificationManager.getStats();
        expect(initialStats.totalChannels).toBe(0);
        expect(initialStats.totalListeners).toBe(0);
        expect(initialStats.totalNotifications).toBe(0);

        // Add listeners
        notificationManager.addListener('conn1', 'channel1', mockSocket, mockConnState);
        notificationManager.addListener('conn2', 'channel1', mockSocket, mockConnState);
        notificationManager.addListener('conn3', 'channel2', mockSocket, mockConnState);

        let stats = notificationManager.getStats();
        expect(stats.totalChannels).toBe(2);
        expect(stats.totalListeners).toBe(3);

        // Send notifications
        notificationManager.sendNotification('channel1', 'test1', 12345);
        notificationManager.sendNotification('channel2', 'test2', 12345);

        stats = notificationManager.getStats();
        expect(stats.totalNotifications).toBe(2);
        expect(stats.notificationsSent).toBe(3); // 2 listeners on channel1, 1 on channel2
      });
    });

    describe('Cleanup', () => {
      test('should clean up empty channels after delay', done => {
        // Add and remove listener
        notificationManager.addListener('conn1', 'test_channel', mockSocket, mockConnState);
        notificationManager.removeListener('conn1', 'test_channel');

        // Channel should still exist initially
        expect(notificationManager.getAllChannels()).toContain('test_channel');

        // Wait for cleanup (default is 60 seconds, but we'll test the mechanism)
        setTimeout(() => {
          // Manually trigger cleanup
          notificationManager.cleanupEmptyChannels();
          expect(notificationManager.getAllChannels()).not.toContain('test_channel');
          done();
        }, 100);
      });
    });
  });

  describe('LISTEN Query Handler', () => {
    test('should handle valid LISTEN commands', () => {
      const result = handleListenQuery('LISTEN test_channel', mockConnState);

      expect(result.error).toBeUndefined();
      expect(result.command).toBe('LISTEN');
      expect(result.rowCount).toBe(0);
      expect(mockConnState.isListeningToChannel('test_channel')).toBe(true);
    });

    test('should reject invalid LISTEN syntax', () => {
      const result = handleListenQuery('LISTEN', mockConnState);

      expect(result.error).toBeDefined();
      expect(result.error.code).toBe('42601'); // Syntax error
    });

    test('should reject invalid channel names', () => {
      const result = handleListenQuery('LISTEN 123invalid', mockConnState);

      expect(result.error).toBeDefined();
      expect(result.error.code).toBe('42601'); // Syntax error
    });

    test('should handle missing notification manager', () => {
      mockConnState.setNotificationManager(null);
      const result = handleListenQuery('LISTEN test_channel', mockConnState);

      expect(result.error).toBeDefined();
      expect(result.error.code).toBe('XX000'); // Internal error
    });

    test('should handle notification manager errors', () => {
      // Mock notification manager that throws an error
      const errorManager = {
        addListener: jest.fn().mockImplementation(() => {
          throw new Error('Manager error');
        }),
      };
      mockConnState.setNotificationManager(errorManager);

      const result = handleListenQuery('LISTEN test_channel', mockConnState);

      expect(result.error).toBeDefined();
      expect(result.error.code).toBe('XX000'); // Internal error
    });
  });

  describe('UNLISTEN Query Handler', () => {
    beforeEach(() => {
      // Set up a listener first
      notificationManager.addListener('test_conn_1', 'test_channel', mockSocket, mockConnState);
      mockConnState.addListeningChannel('test_channel');
    });

    test('should handle valid UNLISTEN commands', () => {
      const result = handleUnlistenQuery('UNLISTEN test_channel', mockConnState);

      expect(result.error).toBeUndefined();
      expect(result.command).toBe('UNLISTEN');
      expect(result.rowCount).toBe(0);
      expect(mockConnState.isListeningToChannel('test_channel')).toBe(false);
    });

    test('should handle UNLISTEN without channel name', () => {
      // Add another channel
      notificationManager.addListener('test_conn_1', 'test_channel2', mockSocket, mockConnState);
      mockConnState.addListeningChannel('test_channel2');

      const result = handleUnlistenQuery('UNLISTEN', mockConnState);

      expect(result.error).toBeUndefined();
      expect(result.command).toBe('UNLISTEN');
      expect(mockConnState.getListeningChannels()).toHaveLength(0);
    });

    test('should handle UNLISTEN for non-existent channel', () => {
      const result = handleUnlistenQuery('UNLISTEN non_existent', mockConnState);

      expect(result.error).toBeUndefined();
      expect(result.command).toBe('UNLISTEN');
    });

    test('should handle missing notification manager', () => {
      mockConnState.setNotificationManager(null);
      const result = handleUnlistenQuery('UNLISTEN test_channel', mockConnState);

      expect(result.error).toBeDefined();
      expect(result.error.code).toBe('XX000'); // Internal error
    });
  });

  describe('NOTIFY Query Handler', () => {
    test('should handle valid NOTIFY commands', () => {
      const result = handleNotifyQuery("NOTIFY test_channel, 'test payload'", mockConnState);

      expect(result.error).toBeUndefined();
      expect(result.command).toBe('NOTIFY');
      expect(result.rowCount).toBe(0);
    });

    test('should handle NOTIFY without payload', () => {
      const result = handleNotifyQuery('NOTIFY test_channel', mockConnState);

      expect(result.error).toBeUndefined();
      expect(result.command).toBe('NOTIFY');
      expect(result.rowCount).toBe(0);
    });

    test('should reject invalid NOTIFY syntax', () => {
      const result = handleNotifyQuery('NOTIFY', mockConnState);

      expect(result.error).toBeDefined();
      expect(result.error.code).toBe('42601'); // Syntax error
    });

    test('should handle missing notification manager', () => {
      mockConnState.setNotificationManager(null);
      const result = handleNotifyQuery('NOTIFY test_channel', mockConnState);

      expect(result.error).toBeDefined();
      expect(result.error.code).toBe('XX000'); // Internal error
    });

    test('should handle notification manager errors', () => {
      // Mock notification manager that throws an error
      const errorManager = {
        sendNotification: jest.fn().mockImplementation(() => {
          throw new Error('Manager error');
        }),
      };
      mockConnState.setNotificationManager(errorManager);

      const result = handleNotifyQuery('NOTIFY test_channel', mockConnState);

      expect(result.error).toBeDefined();
      expect(result.error.code).toBe('XX000'); // Internal error
    });
  });

  describe('Integration Tests', () => {
    test('should handle complete LISTEN/NOTIFY workflow', () => {
      // Set up listener
      const listenResult = handleListenQuery('LISTEN test_channel', mockConnState);
      expect(listenResult.error).toBeUndefined();

      // Add another listener
      const mockConnState2 = new ConnectionState();
      mockConnState2.connectionId = 'test_conn_2';
      mockConnState2.setNotificationManager(notificationManager);
      mockConnState2.setSocket(mockSocket);

      const listenResult2 = handleListenQuery('LISTEN test_channel', mockConnState2);
      expect(listenResult2.error).toBeUndefined();

      // Send notification
      const notifyResult = handleNotifyQuery("NOTIFY test_channel, 'test message'", mockConnState);
      expect(notifyResult.error).toBeUndefined();

      // Check that both listeners received the notification
      expect(mockSocket.write).toHaveBeenCalledTimes(2); // Called for each listener

      // Stop listening
      const unlistenResult = handleUnlistenQuery('UNLISTEN test_channel', mockConnState);
      expect(unlistenResult.error).toBeUndefined();
      expect(mockConnState.isListeningToChannel('test_channel')).toBe(false);
    });

    test('should handle multiple channels per connection', () => {
      // Listen to multiple channels
      handleListenQuery('LISTEN channel1', mockConnState);
      handleListenQuery('LISTEN channel2', mockConnState);
      handleListenQuery('LISTEN channel3', mockConnState);

      expect(mockConnState.getListeningChannels()).toHaveLength(3);
      expect(mockConnState.getListeningChannels()).toContain('channel1');
      expect(mockConnState.getListeningChannels()).toContain('channel2');
      expect(mockConnState.getListeningChannels()).toContain('channel3');

      // Send notifications to different channels
      handleNotifyQuery("NOTIFY channel1, 'message1'", mockConnState);
      handleNotifyQuery("NOTIFY channel2, 'message2'", mockConnState);

      // Should receive 2 notifications
      expect(mockSocket.write).toHaveBeenCalledTimes(2);
    });

    test('should handle connection cleanup', () => {
      // Set up multiple listeners
      handleListenQuery('LISTEN channel1', mockConnState);
      handleListenQuery('LISTEN channel2', mockConnState);

      expect(notificationManager.getChannelsForConnection('test_conn_1')).toHaveLength(2);

      // Simulate connection cleanup
      const removedCount = notificationManager.removeAllListenersForConnection('test_conn_1');
      expect(removedCount).toBe(2);
      expect(notificationManager.getChannelsForConnection('test_conn_1')).toHaveLength(0);

      // Also clear connection state (this would normally be done by the server)
      mockConnState.clearAllListeningChannels();
      expect(mockConnState.getListeningChannels()).toHaveLength(0);
    });
  });
});
