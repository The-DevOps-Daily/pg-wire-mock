# PostgreSQL LISTEN/NOTIFY Support

The PostgreSQL Wire Protocol Mock Server now supports PostgreSQL's asynchronous notification system (LISTEN/NOTIFY), enabling pub-sub style communication between clients. This feature is particularly useful for testing notification-dependent applications and real-time systems.

## Overview

The LISTEN/NOTIFY system allows clients to:

- **LISTEN** to notification channels to receive asynchronous messages
- **NOTIFY** other clients by sending messages to channels
- **UNLISTEN** to stop receiving notifications from specific channels or all channels

## Features

### Core Functionality

- ✅ Full LISTEN/NOTIFY command support
- ✅ Asynchronous notification delivery
- ✅ Channel-based pub-sub messaging
- ✅ Automatic connection cleanup
- ✅ Comprehensive error handling
- ✅ Resource limits and validation
- ✅ Statistics and monitoring

### Channel Management

- Automatic channel creation when first listener subscribes
- Automatic channel cleanup when no listeners remain
- Channel name validation (PostgreSQL identifier rules)
- Maximum channel limits (configurable, default: 1000 channels)

### Listener Management

- Multiple listeners per channel support
- Connection-based listener tracking
- Automatic cleanup when connections close
- Maximum listeners per channel limits (configurable, default: 100 listeners)

### Notification Broadcasting

- Real-time message delivery to all active listeners
- Payload validation and size limits (configurable, default: 8000 characters)
- Failed delivery handling and cleanup
- Sender process ID tracking

## Usage Examples

### Basic LISTEN/NOTIFY Workflow

```sql
-- Client 1: Start listening to a channel
LISTEN my_channel;

-- Client 2: Send a notification to the channel
NOTIFY my_channel, 'Hello from client 2!';

-- Client 1: Receives the notification asynchronously
-- (Notification is delivered immediately to all listeners)

-- Client 1: Stop listening to the channel
UNLISTEN my_channel;
```

### Multiple Channels

```sql
-- Listen to multiple channels
LISTEN user_updates;
LISTEN system_events;
LISTEN notifications;

-- Send notifications to different channels
NOTIFY user_updates, 'User 123 logged in';
NOTIFY system_events, 'Server restart scheduled';
NOTIFY notifications, 'New message received';

-- Stop listening to specific channel
UNLISTEN user_updates;

-- Stop listening to all channels
UNLISTEN;
```

### Notification with Payload

```sql
-- Listen to a channel
LISTEN data_changes;

-- Send notification with payload
NOTIFY data_changes, '{"table": "users", "action": "INSERT", "id": 123}';

-- Listeners receive the JSON payload for processing
```

## Command Reference

### LISTEN

```sql
LISTEN channel_name
```

**Description**: Start listening to a notification channel.

**Parameters**:

- `channel_name`: Valid PostgreSQL identifier (letters, digits, underscores, starting with letter/underscore)

**Examples**:

```sql
LISTEN my_channel;
LISTEN user_events;
LISTEN system_notifications;
```

**Response**: Returns `LISTEN` command completion tag.

### UNLISTEN

```sql
UNLISTEN [channel_name]
```

**Description**: Stop listening to a notification channel or all channels.

**Parameters**:

- `channel_name` (optional): Specific channel to stop listening to. If omitted, stops listening to all channels.

**Examples**:

```sql
UNLISTEN my_channel;    -- Stop listening to specific channel
UNLISTEN;               -- Stop listening to all channels
```

**Response**: Returns `UNLISTEN` command completion tag.

### NOTIFY

```sql
NOTIFY channel_name [, payload]
```

**Description**: Send a notification to all listeners on a channel.

**Parameters**:

- `channel_name`: Valid PostgreSQL identifier
- `payload` (optional): Message payload (string, max 8000 characters)

**Examples**:

```sql
NOTIFY my_channel;                           -- Simple notification
NOTIFY my_channel, 'Hello world!';          -- With payload
NOTIFY events, '{"type": "user_login"}';    -- JSON payload
```

**Response**: Returns `NOTIFY` command completion tag.

## Configuration

The notification system can be configured through the `NotificationManager` constructor:

```javascript
const notificationManager = new NotificationManager({
  maxChannels: 1000, // Maximum number of channels
  maxListenersPerChannel: 100, // Maximum listeners per channel
  channelNameMaxLength: 63, // Maximum channel name length
  payloadMaxLength: 8000, // Maximum payload length
  enableLogging: true, // Enable notification logging
  logLevel: 'info', // Log level
});
```

## Error Handling

### Common Errors

#### Invalid Channel Name

```sql
LISTEN 123invalid;  -- Error: Channel name must start with letter or underscore
```

**Error Code**: `42601` (Syntax Error)

#### Channel Name Too Long

```sql
LISTEN very_long_channel_name_that_exceeds_the_maximum_allowed_length_of_sixty_three_characters;
```

**Error Code**: `42601` (Syntax Error)

#### Payload Too Long

```sql
NOTIFY my_channel, 'very long payload...';  -- If payload exceeds 8000 characters
```

**Error Code**: `22023` (Invalid Parameter Value)

#### Maximum Channels Exceeded

```sql
-- When 1000 channels already exist
LISTEN new_channel;  -- Error: Maximum number of notification channels exceeded
```

**Error Code**: `22023` (Invalid Parameter Value)

#### Maximum Listeners Per Channel Exceeded

```sql
-- When 100 listeners already exist on a channel
LISTEN existing_channel;  -- Error: Maximum number of listeners per channel exceeded
```

**Error Code**: `22023` (Invalid Parameter Value)

## Integration with Applications

### Node.js with `pg` Library

```javascript
const { Client } = require('pg');

const client = new Client({
  host: 'localhost',
  port: 5432,
  user: 'postgres',
  database: 'postgres',
});

await client.connect();

// Listen for notifications
client.on('notification', msg => {
  console.log('Received notification:', msg.channel, msg.payload);
});

// Start listening
await client.query('LISTEN my_channel');

// In another client or process:
await client.query("NOTIFY my_channel, 'Hello from another process!'");
```

### Python with `psycopg2`

```python
import psycopg2
from psycopg2.extensions import ISOLATION_LEVEL_AUTOCOMMIT

conn = psycopg2.connect(
    host='localhost',
    port=5432,
    user='postgres',
    database='postgres'
)

conn.set_isolation_level(ISOLATION_LEVEL_AUTOCOMMIT)

cursor = conn.cursor()

# Listen for notifications
def notification_handler(notify):
    print(f"Received notification: {notify.channel} - {notify.payload}")

# Register notification handler
conn.set_notice_handler(notification_handler)

# Start listening
cursor.execute('LISTEN my_channel')

# In another process:
cursor.execute("NOTIFY my_channel, 'Hello from Python!'")
```

## Testing

The notification system includes comprehensive tests covering:

- Channel creation and management
- Listener addition and removal
- Notification broadcasting
- Error handling and validation
- Connection cleanup
- Resource limits
- Integration workflows

Run tests with:

```bash
npm test -- notification-system.test.js
```

## Architecture

### Components

1. **NotificationManager**: Core notification system managing channels and listeners
2. **ConnectionState**: Extended to track listening channels and notification manager reference
3. **Query Handlers**: LISTEN/NOTIFY/UNLISTEN command processors
4. **Message Builders**: Notification response message construction
5. **Server Integration**: Automatic cleanup on connection close

### Message Flow

1. **LISTEN**: Client sends LISTEN command → Query handler → NotificationManager adds listener → CommandComplete response
2. **NOTIFY**: Client sends NOTIFY command → Query handler → NotificationManager broadcasts to listeners → NotificationResponse to each listener → CommandComplete response
3. **UNLISTEN**: Client sends UNLISTEN command → Query handler → NotificationManager removes listener → CommandComplete response

### Connection Lifecycle

1. **Connection Open**: Notification manager reference set in connection state
2. **LISTEN Commands**: Listeners added to notification manager and connection state
3. **NOTIFY Commands**: Messages broadcast to active listeners
4. **Connection Close**: All listeners automatically removed from notification manager

## Performance Considerations

### Resource Limits

- Maximum 1000 channels per server instance
- Maximum 100 listeners per channel
- Maximum 8000 character payload size
- Automatic cleanup of inactive listeners and empty channels

### Memory Usage

- Channels and listeners stored in memory maps
- Automatic cleanup prevents memory leaks
- Statistics tracking for monitoring

### Network Efficiency

- Notifications sent only to active listeners
- Failed deliveries detected and cleaned up
- Connection state validation before sending

## Monitoring and Statistics

The notification system provides comprehensive statistics:

```javascript
const stats = notificationManager.getStats();
console.log(stats);
// {
//   totalChannels: 5,
//   totalListeners: 12,
//   totalNotifications: 150,
//   notificationsSent: 145,
//   notificationsFailed: 5,
//   channelsCreated: 8,
//   channelsDestroyed: 3,
//   // ... more statistics
// }
```

## Limitations

1. **In-Memory Only**: Notifications are not persisted across server restarts
2. **Single Server**: No clustering or replication support
3. **No Message Queuing**: Messages are delivered immediately or lost
4. **No Message History**: Past notifications are not stored
5. **No Authentication**: All authenticated clients can listen/notify to any channel

## Future Enhancements

Potential improvements for future versions:

1. **Message Persistence**: Store notifications in database
2. **Message Queuing**: Queue notifications for offline clients
3. **Channel Permissions**: Access control for channels
4. **Message History**: Store and replay past notifications
5. **Clustering Support**: Multi-server notification distribution
6. **WebSocket Integration**: Real-time web client support

## Troubleshooting

### Common Issues

1. **Notifications Not Received**
   - Check channel name spelling
   - Verify LISTEN command was successful
   - Check connection is still active

2. **"Notification system not available" Error**
   - Ensure notification manager is properly initialized
   - Check server configuration

3. **Channel Limits Exceeded**
   - Clean up unused channels
   - Increase maxChannels configuration
   - Check for channel leaks in application code

4. **Listener Limits Exceeded**
   - Clean up unused listeners
   - Increase maxListenersPerChannel configuration
   - Check for listener leaks in application code

### Debug Logging

Enable debug logging to troubleshoot notification issues:

```javascript
const notificationManager = new NotificationManager({
  enableLogging: true,
  logLevel: 'debug',
});
```

This will log all notification operations including channel creation, listener management, and message delivery.
