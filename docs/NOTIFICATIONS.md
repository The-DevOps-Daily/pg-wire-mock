### LISTEN/NOTIFY Support

This mock server implements PostgreSQL's asynchronous notifications for pub-sub style testing.

- Supported commands:
  - LISTEN channel_name;
  - UNLISTEN channel_name;
  - UNLISTEN \*;
  - NOTIFY channel_name; or NOTIFY channel_name, 'payload';

Notes and behavior:

- Channel names follow PostgreSQL identifier rules (letters, digits, underscore; must start with letter/underscore).
- Payload is optional and must be a single-quoted string when provided; use doubled quotes to escape (`''`).
- Notifications are broadcast to all connections that executed `LISTEN channel_name`.
- When a connection closes, its listeners are removed automatically.
- `UNLISTEN *` removes all listeners for the connection.

Example session:

```sql
-- Session A
LISTEN events;

-- Session B
NOTIFY events, 'hello';
```

Testing locally with `psql`:

```sql
LISTEN jobs;
-- in another session
NOTIFY jobs, 'run';
```

Implementation details:

- See `src/notification/notificationManager.js` for channel and broadcast logic.
- Query parsing lives in `src/handlers/queryHandlers.js` for LISTEN/UNLISTEN/NOTIFY.
- Protocol notifications are sent via `sendNotificationResponse`.
