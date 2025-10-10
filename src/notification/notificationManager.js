/**
 * PostgreSQL Notification Manager
 * Handles LISTEN/NOTIFY functionality for pub-sub style communication between clients
 */

const { createLogger } = require('../utils/logger');

/**
 * Configuration options for the notification manager
 * @typedef {Object} NotificationManagerConfig
 * @property {number} maxChannels - Maximum number of notification channels (default: 1000)
 * @property {number} maxListenersPerChannel - Maximum listeners per channel (default: 100)
 * @property {number} channelNameMaxLength - Maximum length for channel names (default: 63)
 * @property {number} payloadMaxLength - Maximum length for notification payloads (default: 8000)
 * @property {boolean} enableLogging - Enable notification logging (default: true)
 * @property {string} logLevel - Log level for notifications (default: 'info')
 */

/**
 * Represents a notification listener
 * @typedef {Object} NotificationListener
 * @property {string} connectionId - ID of the connection listening
 * @property {string} channel - Channel name being listened to
 * @property {Object} socket - Client socket for sending notifications
 * @property {Object} connState - Connection state object
 * @property {Date} startedAt - When listening started
 * @property {boolean} isActive - Whether listener is still active
 */

/**
 * Represents a notification channel
 * @typedef {Object} NotificationChannel
 * @property {string} name - Channel name
 * @property {Array<NotificationListener>} listeners - Active listeners on this channel
 * @property {Date} createdAt - When channel was created
 * @property {number} notificationCount - Total notifications sent on this channel
 */

/**
 * Represents a notification message
 * @typedef {Object} NotificationMessage
 * @property {string} channel - Channel name
 * @property {string} payload - Notification payload
 * @property {number} senderPid - Process ID of the sender
 * @property {Date} sentAt - When notification was sent
 */

/**
 * Notification Manager for PostgreSQL LISTEN/NOTIFY functionality
 *
 * Manages notification channels and listeners, allowing clients to:
 * - Subscribe to channels using LISTEN command
 * - Unsubscribe from channels using UNLISTEN command
 * - Send notifications to channels using NOTIFY command
 * - Receive notifications asynchronously
 *
 * ## Behavior Overview:
 *
 * ### Channel Management:
 * - Channels are created automatically when first listener subscribes
 * - Channels are removed when no listeners remain (with cleanup delay)
 * - Channel names follow PostgreSQL naming conventions
 *
 * ### Listener Management:
 * - Listeners are tied to specific connections
 * - When connection closes, all its listeners are automatically removed
 * - Multiple listeners can listen to the same channel
 * - Each connection can listen to multiple channels
 *
 * ### Notification Broadcasting:
 * - Notifications are sent to all active listeners on a channel
 * - Notifications include sender PID and payload
 * - Failed deliveries are logged but don't affect other listeners
 *
 * ### Resource Limits:
 * - Maximum number of channels per server instance
 * - Maximum listeners per channel to prevent abuse
 * - Maximum payload size for notifications
 * - Channel name length limits
 */
class NotificationManager {
  /**
   * Creates a new notification manager instance
   * @param {NotificationManagerConfig} config - Configuration options
   */
  constructor(config = {}) {
    this.config = {
      maxChannels: 1000,
      maxListenersPerChannel: 100,
      channelNameMaxLength: 63, // PostgreSQL identifier limit
      payloadMaxLength: 8000, // PostgreSQL payload limit
      enableLogging: true,
      logLevel: 'info',
      ...config,
    };

    // Channel and listener storage
    this.channels = new Map(); // channelName -> NotificationChannel
    this.listeners = new Map(); // connectionId -> Set<channelName>

    // Statistics
    this.stats = {
      totalChannels: 0,
      totalListeners: 0,
      totalNotifications: 0,
      channelsCreated: 0,
      channelsDestroyed: 0,
      listenersAdded: 0,
      listenersRemoved: 0,
      notificationsSent: 0,
      notificationsFailed: 0,
    };

    // Cleanup timer for empty channels
    this.cleanupTimer = null;
    this.cleanupInterval = 60000; // 1 minute
    this.channelsToCleanup = new Set();

    // Logger
    this.logger = createLogger({
      name: 'NotificationManager',
      level: this.config.enableLogging ? this.config.logLevel : 'silent',
    });

    this.log('info', 'Notification manager initialized', {
      maxChannels: this.config.maxChannels,
      maxListenersPerChannel: this.config.maxListenersPerChannel,
    });

    // Start cleanup timer
    this.startCleanupTimer();
  }

  /**
   * Logs a message with the notification manager context
   * @param {string} level - Log level
   * @param {string} message - Log message
   * @param {Object} meta - Additional metadata
   * @private
   */
  log(level, message, meta = {}) {
    this.logger[level](message, {
      component: 'NotificationManager',
      ...meta,
    });
  }

  /**
   * Normalizes a channel name to lowercase for case-insensitive handling
   * @param {string} channelName - Channel name to normalize
   * @returns {string} Normalized channel name
   * @private
   */
  normalizeChannelName(channelName) {
    return channelName ? channelName.toLowerCase() : channelName;
  }

  /**
   * Validates a channel name according to PostgreSQL rules
   * @param {string} channelName - Channel name to validate
   * @returns {Object} Validation result with isValid and error message
   * @private
   */
  validateChannelName(channelName) {
    if (!channelName || typeof channelName !== 'string') {
      return { isValid: false, error: 'Channel name must be a non-empty string' };
    }

    if (channelName.length > this.config.channelNameMaxLength) {
      return {
        isValid: false,
        error: `Channel name too long (max ${this.config.channelNameMaxLength} characters)`,
      };
    }

    // PostgreSQL identifier rules (simplified)
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(channelName)) {
      return {
        isValid: false,
        error:
          'Channel name must start with letter or underscore and contain only ' +
          'letters, digits, and underscores',
      };
    }

    return { isValid: true };
  }

  /**
   * Validates notification payload
   * @param {string} payload - Payload to validate
   * @returns {Object} Validation result with isValid and error message
   * @private
   */
  validatePayload(payload) {
    if (payload === null || payload === undefined) {
      return { isValid: true, payload: '' }; // NULL payload is valid (empty string)
    }

    if (typeof payload !== 'string') {
      return { isValid: false, error: 'Notification payload must be a string' };
    }

    if (payload.length > this.config.payloadMaxLength) {
      return {
        isValid: false,
        error: `Notification payload too long (max ${this.config.payloadMaxLength} characters)`,
      };
    }

    return { isValid: true, payload };
  }

  /**
   * Adds a listener for a channel
   * @param {string} connectionId - Connection ID
   * @param {string} channelName - Channel name to listen to
   * @param {Object} socket - Client socket
   * @param {Object} connState - Connection state
   * @returns {Object} Result with success status and message
   */
  addListener(connectionId, channelName, socket, connState) {
    // Normalize channel name to lowercase for case-insensitive handling
    const normalizedChannelName = this.normalizeChannelName(channelName);

    // Validate channel name
    const channelValidation = this.validateChannelName(normalizedChannelName);
    if (!channelValidation.isValid) {
      this.log('warn', 'Invalid channel name', {
        connectionId,
        channelName: normalizedChannelName,
        error: channelValidation.error,
      });
      return { success: false, error: channelValidation.error };
    }

    // Check if we've hit the channel limit
    if (
      this.channels.size >= this.config.maxChannels &&
      !this.channels.has(normalizedChannelName)
    ) {
      this.log('warn', 'Maximum channels limit reached', {
        connectionId,
        channelName: normalizedChannelName,
        maxChannels: this.config.maxChannels,
      });
      return {
        success: false,
        error: `Maximum number of notification channels (${this.config.maxChannels}) exceeded`,
      };
    }

    // Get or create channel
    let channel = this.channels.get(normalizedChannelName);
    if (!channel) {
      channel = {
        name: normalizedChannelName,
        listeners: [],
        createdAt: new Date(),
        notificationCount: 0,
      };
      this.channels.set(normalizedChannelName, channel);
      this.stats.channelsCreated++;
      this.stats.totalChannels = this.channels.size;
      this.log('info', 'Channel created', { channelName: normalizedChannelName });
    }

    // Check if listener already exists
    const existingListener = channel.listeners.find(l => l.connectionId === connectionId);
    if (existingListener) {
      this.log('debug', 'Listener already exists for connection', {
        connectionId,
        channelName: normalizedChannelName,
      });
      return { success: true, message: 'Already listening to channel' };
    }

    // Check listener limit for this channel
    if (channel.listeners.length >= this.config.maxListenersPerChannel) {
      this.log('warn', 'Maximum listeners per channel reached', {
        connectionId,
        channelName: normalizedChannelName,
        maxListeners: this.config.maxListenersPerChannel,
      });
      return {
        success: false,
        error: `Maximum number of listeners per channel (${this.config.maxListenersPerChannel}) exceeded`,
      };
    }

    // Create new listener
    const listener = {
      connectionId,
      channel: normalizedChannelName,
      socket,
      connState,
      startedAt: new Date(),
      isActive: true,
    };

    channel.listeners.push(listener);
    this.stats.listenersAdded++;
    this.stats.totalListeners++;

    // Track listener in connection map
    if (!this.listeners.has(connectionId)) {
      this.listeners.set(connectionId, new Set());
    }
    this.listeners.get(connectionId).add(channelName);

    this.log('info', 'Listener added', {
      connectionId,
      channelName,
      totalListeners: channel.listeners.length,
    });

    return { success: true, message: 'Listening to channel' };
  }

  /**
   * Removes a listener from a channel
   * @param {string} connectionId - Connection ID
   * @param {string} channelName - Channel name to stop listening to
   * @returns {Object} Result with success status and message
   */
  removeListener(connectionId, channelName) {
    const normalizedChannelName = this.normalizeChannelName(channelName);
    const channel = this.channels.get(normalizedChannelName);
    if (!channel) {
      this.log('debug', 'Channel not found for removal', {
        connectionId,
        channelName: normalizedChannelName,
      });
      return { success: true, message: 'Not listening to channel' };
    }

    // Find and remove listener
    const listenerIndex = channel.listeners.findIndex(l => l.connectionId === connectionId);
    if (listenerIndex === -1) {
      this.log('debug', 'Listener not found for removal', {
        connectionId,
        channelName: normalizedChannelName,
      });
      return { success: true, message: 'Not listening to channel' };
    }

    const removedListener = channel.listeners.splice(listenerIndex, 1)[0];
    removedListener.isActive = false;
    this.stats.listenersRemoved++;
    this.stats.totalListeners--;

    // Remove from connection tracking
    const connectionListeners = this.listeners.get(connectionId);
    if (connectionListeners) {
      connectionListeners.delete(normalizedChannelName);
      if (connectionListeners.size === 0) {
        this.listeners.delete(connectionId);
      }
    }

    this.log('info', 'Listener removed', {
      connectionId,
      channelName: normalizedChannelName,
      remainingListeners: channel.listeners.length,
    });

    // Schedule channel for cleanup if no listeners remain
    if (channel.listeners.length === 0) {
      this.channelsToCleanup.add(normalizedChannelName);
    }

    return { success: true, message: 'Stopped listening to channel' };
  }

  /**
   * Removes all listeners for a connection (called when connection closes)
   * @param {string} connectionId - Connection ID
   * @returns {number} Number of listeners removed
   */
  removeAllListenersForConnection(connectionId) {
    const connectionListeners = this.listeners.get(connectionId);
    if (!connectionListeners || connectionListeners.size === 0) {
      return 0;
    }

    let removedCount = 0;
    for (const channelName of connectionListeners) {
      const result = this.removeListener(connectionId, channelName);
      if (result.success) {
        removedCount++;
      }
    }

    this.log('info', 'Removed all listeners for connection', {
      connectionId,
      removedCount,
    });

    return removedCount;
  }

  /**
   * Sends a notification to all listeners on a channel
   * @param {string} channelName - Channel name
   * @param {string} payload - Notification payload
   * @param {number} senderPid - Process ID of sender
   * @returns {Object} Result with success status and delivery stats
   */
  sendNotification(channelName, payload, senderPid) {
    const normalizedChannelName = this.normalizeChannelName(channelName);

    // Validate payload
    const payloadValidation = this.validatePayload(payload);
    if (!payloadValidation.isValid) {
      this.log('warn', 'Invalid notification payload', {
        channelName: normalizedChannelName,
        error: payloadValidation.error,
      });
      return { success: false, error: payloadValidation.error };
    }

    const channel = this.channels.get(normalizedChannelName);
    if (!channel) {
      this.log('debug', 'Channel not found for notification', {
        channelName: normalizedChannelName,
      });
      return {
        success: true,
        message: 'No listeners on channel',
        deliveredTo: 0,
        totalListeners: 0,
      };
    }

    if (channel.listeners.length === 0) {
      this.log('debug', 'No listeners on channel', { channelName: normalizedChannelName });
      return {
        success: true,
        message: 'No listeners on channel',
        deliveredTo: 0,
        totalListeners: 0,
      };
    }

    // Send notifications to all current active listeners
    let deliveredCount = 0;
    let failedCount = 0;
    const activeListeners = channel.listeners.filter(l => l.isActive);

    for (const listener of activeListeners) {
      try {
        // Check if connection is still active
        if (!listener.connState.connected || !listener.socket.writable) {
          listener.isActive = false;
          failedCount++;
          continue;
        }

        // Send notification using message builder
        const { sendNotificationResponse } = require('../protocol/messageBuilders');
        sendNotificationResponse(
          listener.socket,
          senderPid,
          normalizedChannelName,
          payloadValidation.payload
        );

        deliveredCount++;
        this.log('debug', 'Notification delivered', {
          channelName: normalizedChannelName,
          connectionId: listener.connectionId,
          payloadLength: payloadValidation.payload.length,
        });
      } catch (error) {
        this.log('warn', 'Failed to deliver notification', {
          channelName: normalizedChannelName,
          connectionId: listener.connectionId,
          error: error.message,
        });
        listener.isActive = false;
        failedCount++;
      }
    }

    // Update statistics
    channel.notificationCount++;
    this.stats.totalNotifications++;
    this.stats.notificationsSent += deliveredCount;
    this.stats.notificationsFailed += failedCount;

    this.log('info', 'Notification sent', {
      channelName: normalizedChannelName,
      deliveredTo: deliveredCount,
      failedTo: failedCount,
      totalListeners: activeListeners.length,
      payloadLength: payloadValidation.payload.length,
    });

    // Clean up inactive listeners
    if (failedCount > 0) {
      this.cleanupInactiveListeners(channel);
    }

    return {
      success: true,
      message: `Notification sent to ${deliveredCount} listeners`,
      deliveredTo: deliveredCount,
      failedTo: failedCount,
      totalListeners: activeListeners.length,
    };
  }

  /**
   * Gets all channels that a connection is listening to
   * @param {string} connectionId - Connection ID
   * @returns {Array<string>} Array of channel names
   */
  getChannelsForConnection(connectionId) {
    const connectionListeners = this.listeners.get(connectionId);
    return connectionListeners ? Array.from(connectionListeners) : [];
  }

  /**
   * Gets all listeners for a channel
   * @param {string} channelName - Channel name
   * @returns {Array<NotificationListener>} Array of active listeners
   */
  getListenersForChannel(channelName) {
    const normalizedChannelName = this.normalizeChannelName(channelName);
    const channel = this.channels.get(normalizedChannelName);
    return channel ? channel.listeners.filter(l => l.isActive) : [];
  }

  /**
   * Gets all active channels
   * @returns {Array<string>} Array of channel names
   */
  getAllChannels() {
    return Array.from(this.channels.keys());
  }

  /**
   * Cleans up inactive listeners from a channel
   * @param {NotificationChannel} channel - Channel to clean up
   * @private
   */
  cleanupInactiveListeners(channel) {
    const activeListeners = channel.listeners.filter(l => l.isActive);
    const removedCount = channel.listeners.length - activeListeners.length;

    if (removedCount > 0) {
      channel.listeners = activeListeners;
      this.stats.totalListeners -= removedCount;
      this.log('info', 'Cleaned up inactive listeners', {
        channelName: channel.name,
        removedCount,
      });
    }

    // Schedule channel for cleanup if no listeners remain
    if (channel.listeners.length === 0) {
      this.channelsToCleanup.add(channel.name);
    }
  }

  /**
   * Starts the cleanup timer for empty channels
   * @private
   */
  startCleanupTimer() {
    this.cleanupTimer = setInterval(() => {
      this.cleanupEmptyChannels();
    }, this.cleanupInterval);
  }

  /**
   * Cleans up empty channels that have been scheduled for removal
   * @private
   */
  cleanupEmptyChannels() {
    if (this.channelsToCleanup.size === 0) {
      return;
    }

    let cleanedCount = 0;
    for (const channelName of this.channelsToCleanup) {
      const channel = this.channels.get(channelName);
      if (channel && channel.listeners.length === 0) {
        this.channels.delete(channelName);
        this.stats.channelsDestroyed++;
        cleanedCount++;
        this.log('debug', 'Channel cleaned up', { channelName });
      }
    }

    this.channelsToCleanup.clear();
    this.stats.totalChannels = this.channels.size;

    if (cleanedCount > 0) {
      this.log('info', 'Cleaned up empty channels', { cleanedCount });
    }
  }

  /**
   * Gets comprehensive statistics about the notification manager
   * @returns {Object} Statistics object
   */
  getStats() {
    const channels = Array.from(this.channels.values());
    const totalListeners = channels.reduce((sum, channel) => sum + channel.listeners.length, 0);

    return {
      ...this.stats,
      totalChannels: this.channels.size,
      totalListeners,
      activeChannels: channels.filter(c => c.listeners.length > 0).length,
      emptyChannels: channels.filter(c => c.listeners.length === 0).length,
      channelsScheduledForCleanup: this.channelsToCleanup.size,
      averageListenersPerChannel: this.channels.size > 0 ? totalListeners / this.channels.size : 0,
      averageNotificationsPerChannel:
        this.channels.size > 0
          ? channels.reduce((sum, c) => sum + c.notificationCount, 0) / this.channels.size
          : 0,
    };
  }

  /**
   * Shuts down the notification manager and cleans up resources
   */
  shutdown() {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }

    // Clear all channels and listeners
    this.channels.clear();
    this.listeners.clear();
    this.channelsToCleanup.clear();

    this.log('info', 'Notification manager shutdown', {
      finalStats: this.getStats(),
    });
  }
}

module.exports = {
  NotificationManager,
};
