# Transaction Support in pg-wire-mock

This document describes the transaction handling capabilities of the pg-wire-mock server, which simulates PostgreSQL's transaction behavior for testing and development purposes.

## Overview

pg-wire-mock provides comprehensive transaction support that closely mimics PostgreSQL's ACID transaction properties and SQL commands. This allows you to test transaction-dependent code in a controlled environment without needing a full PostgreSQL installation.

## Features

### 1. Basic Transaction Control

The mock server supports all standard PostgreSQL transaction control commands:

- **BEGIN / START TRANSACTION**: Starts a new transaction
- **COMMIT / END**: Commits the current transaction
- **ROLLBACK / ABORT**: Rolls back the current transaction

```sql
-- Start a transaction
BEGIN;

-- Perform operations
INSERT INTO users (name, email) VALUES ('John', 'john@example.com');
UPDATE accounts SET balance = balance - 100 WHERE user_id = 1;

-- Commit the transaction
COMMIT;
```

### 2. Transaction Options

When beginning a transaction, you can specify various options:

#### Isolation Levels

PostgreSQL supports four isolation levels, all of which are recognized by pg-wire-mock:

- `READ UNCOMMITTED` (treated as READ COMMITTED in PostgreSQL)
- `READ COMMITTED` (default)
- `REPEATABLE READ`
- `SERIALIZABLE`

```sql
-- Start a transaction with a specific isolation level
BEGIN ISOLATION LEVEL SERIALIZABLE;

-- Or use START TRANSACTION syntax
START TRANSACTION ISOLATION LEVEL REPEATABLE READ;
```

#### Read-Only Transactions

```sql
-- Start a read-only transaction
BEGIN READ ONLY;

-- Or combine with isolation level
START TRANSACTION ISOLATION LEVEL SERIALIZABLE READ ONLY;
```

#### Deferrable Transactions

```sql
-- Start a deferrable transaction (only meaningful with SERIALIZABLE + READ ONLY)
BEGIN ISOLATION LEVEL SERIALIZABLE READ ONLY DEFERRABLE;
```

### 3. Savepoints

Savepoints allow you to create nested transaction-like behavior within a transaction:

#### Creating Savepoints

```sql
BEGIN;

INSERT INTO users (name) VALUES ('Alice');

-- Create a savepoint
SAVEPOINT sp1;

INSERT INTO users (name) VALUES ('Bob');

-- Create another savepoint
SAVEPOINT sp2;

INSERT INTO users (name) VALUES ('Charlie');
```

#### Rolling Back to Savepoints

```sql
-- Rollback to sp2 (discards Charlie insert)
ROLLBACK TO SAVEPOINT sp2;

-- Or use shorter syntax
ROLLBACK TO sp2;

-- Rollback to sp1 (discards Bob insert)
ROLLBACK TO sp1;

-- Commit the transaction (only Alice insert remains)
COMMIT;
```

#### Releasing Savepoints

```sql
BEGIN;

SAVEPOINT sp1;
-- ... operations ...

SAVEPOINT sp2;
-- ... operations ...

-- Release sp1 (and all savepoints after it)
RELEASE SAVEPOINT sp1;

COMMIT;
```

### 4. Transaction State Management

The mock server tracks detailed transaction state:

#### Transaction Status

- `IDLE` ('I'): Not in a transaction
- `IN_TRANSACTION` ('T'): Active transaction
- `IN_FAILED_TRANSACTION` ('E'): Transaction failed, awaiting rollback

#### Failed Transaction Behavior

When an error occurs within a transaction, the transaction enters a failed state. In this state:

- All non-transaction control commands are rejected
- Only `ROLLBACK`, `COMMIT`, or `ROLLBACK TO SAVEPOINT` are allowed
- Rolling back to a savepoint recovers the transaction to active state

```sql
BEGIN;

INSERT INTO users (name) VALUES ('Alice');

-- This causes an error
INSERT INTO invalid_table (x) VALUES (1);
-- Transaction is now in failed state

-- This will be rejected
SELECT * FROM users;
-- ERROR: current transaction is aborted, commands ignored until end of transaction block

-- Must rollback to continue
ROLLBACK;
```

#### Recovery with Savepoints

```sql
BEGIN;

INSERT INTO users (name) VALUES ('Alice');

SAVEPOINT sp1;

-- This causes an error
INSERT INTO invalid_table (x) VALUES (1);
-- Transaction is now in failed state

-- Rollback to savepoint recovers the transaction
ROLLBACK TO SAVEPOINT sp1;

-- Transaction is active again
INSERT INTO users (name) VALUES ('Bob');

COMMIT;  -- Both Alice and Bob are inserted
```

### 5. SET TRANSACTION

You can also set transaction characteristics using `SET TRANSACTION`:

```sql
BEGIN;

-- Must be the first command after BEGIN
SET TRANSACTION ISOLATION LEVEL SERIALIZABLE;
SET TRANSACTION READ ONLY;

-- ... operations ...

COMMIT;
```

Or set session defaults:

```sql
SET SESSION CHARACTERISTICS AS TRANSACTION ISOLATION LEVEL SERIALIZABLE;
```

## Implementation Details

### Connection State Tracking

Each connection maintains:

- Current transaction status (idle, active, or failed)
- Transaction isolation level
- Read-only flag
- Deferrable flag
- Stack of active savepoints
- Transaction start time and duration
- Transaction depth (for tracking nested BEGIN attempts)

### Error Handling

The mock server provides detailed error messages that match PostgreSQL's behavior:

#### Transaction Errors

- **25001** (`ACTIVE_SQL_TRANSACTION`): Attempting to BEGIN while already in a transaction
- **25P01** (`NO_ACTIVE_SQL_TRANSACTION`): Attempting to COMMIT/ROLLBACK without an active transaction
- **25P02** (`IN_FAILED_SQL_TRANSACTION`): Attempting non-transaction commands in a failed transaction

#### Savepoint Errors

- **3B001** (`UNDEFINED_SAVEPOINT`): Savepoint does not exist
- **25P01**: Savepoint commands used outside a transaction

### Automatic Transaction Failure

When a query error occurs within a transaction (except for transaction control errors), the transaction automatically transitions to the failed state. This mirrors PostgreSQL's behavior.

### Nested Transactions

PostgreSQL does not support nested transactions (nested BEGIN commands). The mock server:

- Tracks nested BEGIN attempts with a depth counter
- Throws an error when attempting to BEGIN while in a transaction
- Provides appropriate error messages and hints

## Testing Transaction Behavior

The comprehensive test suite (`__tests__/handlers/transactionHandlers.test.js`) demonstrates all transaction features:

### Basic Operations

```javascript
const { ConnectionState } = require('./src/connection/connectionState');

const connState = new ConnectionState();
connState.beginTransaction();
expect(connState.isInTransaction()).toBe(true);

connState.commitTransaction();
expect(connState.isInTransaction()).toBe(false);
```

### With Options

```javascript
connState.beginTransaction({
  isolationLevel: 'SERIALIZABLE',
  readOnly: true,
  deferrable: true,
});

expect(connState.transactionIsolationLevel).toBe('SERIALIZABLE');
expect(connState.transactionReadOnly).toBe(true);
```

### Savepoints

```javascript
connState.beginTransaction();
connState.createSavepoint('sp1');
connState.createSavepoint('sp2');

connState.rollbackToSavepoint('sp1');
expect(connState.getSavepoints()).toEqual(['sp1']);
```

### Error Recovery

```javascript
connState.beginTransaction();
connState.createSavepoint('sp1');
connState.failTransaction();

expect(connState.isInFailedTransaction()).toBe(true);

connState.rollbackToSavepoint('sp1');
expect(connState.isInTransaction()).toBe(true);
expect(connState.isInFailedTransaction()).toBe(false);
```

## SQL Command Reference

### Transaction Control

| Command    | Aliases             | Description                      |
| ---------- | ------------------- | -------------------------------- |
| `BEGIN`    | `START TRANSACTION` | Start a new transaction          |
| `COMMIT`   | `END`               | Commit the current transaction   |
| `ROLLBACK` | `ABORT`             | Rollback the current transaction |

### Transaction Options

```sql
BEGIN [ WORK | TRANSACTION ] [ transaction_mode [, ...] ]

transaction_mode:
    ISOLATION LEVEL { SERIALIZABLE | REPEATABLE READ | READ COMMITTED | READ UNCOMMITTED }
    | READ WRITE | READ ONLY
    | [ NOT ] DEFERRABLE
```

### Savepoint Commands

| Command                          | Description             |
| -------------------------------- | ----------------------- |
| `SAVEPOINT name`                 | Create a savepoint      |
| `ROLLBACK TO [ SAVEPOINT ] name` | Rollback to a savepoint |
| `RELEASE [ SAVEPOINT ] name`     | Release a savepoint     |

### SET TRANSACTION

```sql
SET TRANSACTION transaction_mode [, ...]
SET SESSION CHARACTERISTICS AS TRANSACTION transaction_mode [, ...]
```

## Differences from Real PostgreSQL

While pg-wire-mock closely mimics PostgreSQL's transaction behavior, there are some differences:

1. **No Actual Data Persistence**: The mock server doesn't store data, so transaction effects are simulated
2. **No True Isolation**: Different isolation levels are tracked but don't affect actual query execution
3. **Simplified Locking**: No row-level or table-level locking is implemented
4. **No Deadlock Detection**: The server doesn't simulate deadlocks or lock timeouts
5. **No Two-Phase Commit**: `PREPARE TRANSACTION` is not supported
6. **No Concurrent Transaction Conflicts**: Serialization failures don't occur

## Best Practices

### 1. Use Transactions for Testing

```javascript
test('user creation with account', async () => {
  await client.query('BEGIN');

  try {
    await client.query('INSERT INTO users ...');
    await client.query('INSERT INTO accounts ...');
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
});
```

### 2. Test Error Recovery

```javascript
test('handles error in transaction', async () => {
  await client.query('BEGIN');
  await client.query('SAVEPOINT sp1');

  try {
    await client.query('INVALID SQL');
  } catch (error) {
    // Transaction is in failed state
    await client.query('ROLLBACK TO SAVEPOINT sp1');
    // Can continue now
  }

  await client.query('COMMIT');
});
```

### 3. Verify Transaction State

```javascript
const state = connState.getSummary();
console.log('Transaction status:', state.transactionStatus);
console.log('Isolation level:', state.transactionIsolationLevel);
console.log('Active savepoints:', state.savepoints);
console.log('Transaction duration:', state.transactionDuration, 'ms');
```

## Connection State API

### Properties

- `transactionStatus`: Current status ('I', 'T', or 'E')
- `transactionIsolationLevel`: Current isolation level
- `transactionReadOnly`: Whether transaction is read-only
- `transactionDeferrable`: Whether transaction is deferrable
- `savepoints`: Array of active savepoint objects
- `transactionStartTime`: When transaction started (or null)
- `transactionDepth`: Depth of nested BEGIN attempts

### Methods

- `beginTransaction(options)`: Start a transaction
- `commitTransaction()`: Commit transaction
- `rollbackTransaction()`: Rollback transaction
- `failTransaction()`: Mark transaction as failed
- `createSavepoint(name)`: Create a savepoint
- `rollbackToSavepoint(name)`: Rollback to savepoint
- `releaseSavepoint(name)`: Release a savepoint
- `isInTransaction()`: Check if in active transaction
- `isInFailedTransaction()`: Check if in failed transaction
- `getSavepoints()`: Get list of savepoint names
- `hasSavepoint(name)`: Check if savepoint exists
- `getTransactionDuration()`: Get transaction duration in ms
- `setTransactionIsolationLevel(level)`: Set isolation level
- `getTransactionIsolationLevel()`: Get current isolation level

## Monitoring and Debugging

### Transaction Duration

```javascript
const duration = connState.getTransactionDuration();
if (duration > 5000) {
  console.warn('Long-running transaction detected:', duration, 'ms');
}
```

### Connection Summary

```javascript
const summary = connState.getSummary();
console.log('Connection state:', {
  status: summary.transactionStatus,
  isolation: summary.transactionIsolationLevel,
  savepoints: summary.savepointCount,
  duration: summary.transactionDuration,
  queries: summary.queriesExecuted,
});
```

### Validation

```javascript
const validation = connState.validateState();
if (!validation.isValid) {
  console.error('Invalid connection state:', validation.errors);
}
```

## Related Documentation

- [ERROR_HANDLING.md](ERROR_HANDLING.md) - Error handling and recovery
- [QUERY_LOGGING.md](QUERY_LOGGING.md) - Query logging and monitoring
- [README.md](../README.md) - General server documentation

## Contributing

When adding new transaction features:

1. Update the `ConnectionState` class for state management
2. Add handler functions in `queryHandlers.js`
3. Include error handling with appropriate SQLSTATE codes
4. Write comprehensive tests in `transactionHandlers.test.js`
5. Update this documentation

## References

- [PostgreSQL Transaction Documentation](https://www.postgresql.org/docs/current/tutorial-transactions.html)
- [PostgreSQL SQLSTATE Codes](https://www.postgresql.org/docs/current/errcodes-appendix.html)
- [PostgreSQL Transaction Isolation](https://www.postgresql.org/docs/current/transaction-iso.html)
