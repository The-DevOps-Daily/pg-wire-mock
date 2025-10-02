# Graceful Shutdown Documentation

This document describes the comprehensive graceful shutdown behavior implemented in the PostgreSQL Wire Protocol Mock Server.

## Overview

The server implements a multi-phase graceful shutdown process designed to ensure clean connection termination and proper resource cleanup. This is essential for production environments where data integrity and client experience are critical.

## Shutdown Phases

### Phase 1: Shutdown Initiation

When a shutdown is requested (via `server.stop()`, SIGTERM, or SIGINT):

1. **Shutdown Flag Set**: `isShuttingDown` is set to `true`
2. **New Connection Rejection**: Server immediately stops accepting new connections
3. **Duplicate Prevention**: Multiple shutdown attempts return the same promise

### Phase 2: Client Notification

All active connections receive shutdown notifications:

1. **Notice Messages**: Each client receives a "Server is shutting down" notice
2. **Transaction Rollback**: Any active transactions are automatically rolled back
3. **ReadyForQuery**: Clients receive a ReadyForQuery message indicating clean state

### Phase 3: Connection Draining

The server waits for clients to disconnect gracefully:

1. **Drain Timeout**: Configurable timeout (default: 10 seconds)
2. **Periodic Checking**: Server checks connection count every 100ms
3. **Natural Disconnection**: Clients that disconnect are removed from tracking

### Phase 4: Force Closure

After the drain timeout expires:

1. **Remaining Connections**: Any connections still active are force-closed
2. **Transaction Cleanup**: Active transactions are rolled back
3. **Socket Destruction**: TCP sockets are destroyed immediately

### Phase 5: Resource Cleanup

Final cleanup operations:

1. **Connection Map**: All connection tracking is cleared
2. **Intervals**: Cleanup intervals are cleared
3. **State Reset**: Server state is reset to initial values

## Configuration

### Environment Variables

```bash
# Total shutdown timeout (30 seconds default)
export PG_MOCK_SHUTDOWN_TIMEOUT=30000

# Connection drain timeout (10 seconds default)
export PG_MOCK_SHUTDOWN_DRAIN_TIMEOUT=10000
```

### Programmatic Configuration

```javascript
const server = new ServerManager({
  shutdownTimeout: 30000, // Total shutdown timeout
  shutdownDrainTimeout: 10000, // Connection drain timeout
});
```

## API Reference

### ServerManager Methods

#### `stop()`

Initiates graceful shutdown process.

```javascript
await server.stop();
```

**Returns**: `Promise<void>` - Resolves when shutdown is complete

**Behavior**:

- Returns immediately if already stopped
- Returns same promise for multiple calls
- Throws if shutdown encounters errors

#### `isServerShuttingDown()`

Checks if server is currently shutting down.

```javascript
if (server.isServerShuttingDown()) {
  console.log('Server is shutting down');
}
```

**Returns**: `boolean` - `true` if shutting down

#### `getShutdownStatus()`

Gets detailed shutdown status information.

```javascript
const status = server.getShutdownStatus();
console.log(status);
// {
//   isShuttingDown: false,
//   activeConnections: 5,
//   shutdownTimeout: 30000,
//   drainTimeout: 10000
// }
```

**Returns**: `Object` - Shutdown status object

#### `getActiveConnectionCount()`

Gets the number of currently active connections.

```javascript
const count = server.getActiveConnectionCount();
console.log(`Active connections: ${count}`);
```

**Returns**: `number` - Number of active connections

## Signal Handling

The server automatically handles common termination signals:

### SIGTERM

- **Usage**: Process managers (systemd, PM2, Docker)
- **Behavior**: Graceful shutdown with full process
- **Timeout**: Uses configured shutdown timeout

### SIGINT

- **Usage**: Interactive termination (Ctrl+C)
- **Behavior**: Graceful shutdown with full process
- **Timeout**: Uses configured shutdown timeout

### SIGUSR1

- **Usage**: Custom application signals
- **Behavior**: Graceful shutdown with full process
- **Timeout**: Uses configured shutdown timeout

## Error Handling

### Shutdown Errors

If errors occur during shutdown:

1. **Error Logging**: Errors are logged with appropriate severity
2. **Force Cleanup**: All connections are force-closed
3. **Resource Cleanup**: Server resources are cleaned up
4. **Promise Rejection**: Shutdown promise is rejected

### Connection Errors

Individual connection errors during shutdown:

1. **Error Isolation**: Errors don't stop other connections
2. **Force Close**: Failed connections are force-closed
3. **Error Logging**: Errors are logged for debugging

## Best Practices

### For Server Applications

1. **Monitor Shutdown Status**: Check `isServerShuttingDown()` before operations
2. **Handle Shutdown Promise**: Always await the shutdown promise
3. **Configure Timeouts**: Set appropriate timeouts for your use case
4. **Error Handling**: Implement proper error handling for shutdown failures

```javascript
// Example: Proper shutdown handling
try {
  await server.stop();
  console.log('Server stopped gracefully');
} catch (error) {
  console.error('Shutdown failed:', error);
  process.exit(1);
}
```

### For Client Applications

1. **Handle Shutdown Notices**: Listen for notice messages
2. **Graceful Disconnection**: Close connections when receiving shutdown notices
3. **Transaction Cleanup**: Ensure transactions are properly handled
4. **Reconnection Logic**: Implement reconnection logic for temporary shutdowns

```javascript
// Example: Client shutdown handling
client.on('notice', notice => {
  if (notice.message.includes('shutting down')) {
    console.log('Server is shutting down, disconnecting...');
    client.end();
  }
});
```

### For Process Managers

1. **Use SIGTERM**: Send SIGTERM for graceful shutdown
2. **Wait for Completion**: Wait for process to exit naturally
3. **SIGKILL as Last Resort**: Only use SIGKILL if SIGTERM fails
4. **Monitor Logs**: Check logs for shutdown progress

```bash
# Example: systemd service configuration
[Service]
Type=simple
ExecStart=/usr/bin/node server.js
ExecStop=/bin/kill -TERM $MAINPID
TimeoutStopSec=30
KillMode=mixed
```

## Monitoring and Debugging

### Debug Logging

Enable debug logging to see detailed shutdown information:

```bash
PG_MOCK_LOG_LEVEL=debug npm start
```

Debug logs show:

- Shutdown phase transitions
- Connection notification attempts
- Drain timeout progress
- Force closure operations
- Resource cleanup steps

### Status Monitoring

Monitor shutdown progress programmatically:

```javascript
// Check shutdown status periodically
const checkShutdown = setInterval(() => {
  const status = server.getShutdownStatus();
  console.log(`Shutdown: ${status.isShuttingDown}, Connections: ${status.activeConnections}`);

  if (!status.isShuttingDown && status.activeConnections === 0) {
    clearInterval(checkShutdown);
  }
}, 1000);
```

## Performance Considerations

### Timeout Configuration

- **Shutdown Timeout**: Should be long enough for all operations to complete
- **Drain Timeout**: Should balance client responsiveness with server availability
- **Default Values**: 30s total, 10s drain are reasonable defaults

### Connection Limits

- **High Connection Count**: Longer drain timeouts may be needed
- **Network Latency**: Consider network conditions when setting timeouts
- **Client Behavior**: Account for client response times

### Resource Usage

- **Memory**: Connections are cleaned up during shutdown
- **CPU**: Minimal CPU usage during drain phase
- **Network**: Only notification messages are sent

## Troubleshooting

### Common Issues

1. **Shutdown Hangs**: Check for unresponsive clients or network issues
2. **Connection Leaks**: Ensure all connections are properly tracked
3. **Transaction Issues**: Verify transaction rollback is working
4. **Resource Leaks**: Check that all resources are cleaned up

### Debug Steps

1. **Enable Debug Logging**: See detailed shutdown progress
2. **Check Connection Count**: Monitor active connections during shutdown
3. **Verify Client Behavior**: Ensure clients respond to shutdown notices
4. **Review Timeouts**: Adjust timeouts if needed

### Recovery

If shutdown fails:

1. **Force Stop**: Use SIGKILL as last resort
2. **Check Logs**: Review logs for error details
3. **Restart Server**: Restart with appropriate configuration
4. **Investigate**: Fix underlying issues before restarting

## Examples

### Basic Shutdown

```javascript
const { ServerManager } = require('./src/server/serverManager');

const server = new ServerManager({
  port: 5432,
  shutdownTimeout: 30000,
  shutdownDrainTimeout: 10000,
});

// Start server
await server.start();

// Later: Graceful shutdown
await server.stop();
```

### Shutdown with Monitoring

```javascript
// Monitor shutdown progress
const monitorShutdown = () => {
  const status = server.getShutdownStatus();
  console.log(`Shutdown: ${status.isShuttingDown}, Connections: ${status.activeConnections}`);

  if (status.isShuttingDown) {
    setTimeout(monitorShutdown, 1000);
  }
};

// Start monitoring
monitorShutdown();

// Initiate shutdown
server.stop();
```

### Error Handling

```javascript
try {
  await server.stop();
  console.log('Server stopped successfully');
} catch (error) {
  console.error('Shutdown failed:', error);

  // Check if server is still running
  if (server.isServerRunning()) {
    console.log('Server is still running, attempting force stop...');
    // Implement force stop logic if needed
  }
}
```

This comprehensive shutdown system ensures that the PostgreSQL Wire Protocol Mock Server can be safely stopped in production environments while maintaining data integrity and providing a good user experience.
