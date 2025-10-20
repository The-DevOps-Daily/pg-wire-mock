# Transaction Feature Testing Guide - CLI Commands

This guide provides step-by-step CLI commands to test all the enhanced transaction features in pg-wire-mock.

## Prerequisites

1. **Start the server** (in one terminal):

```powershell
cd pg-wire-mock
node .\server.js --port 5433 --log-level info
```

2. **Connect with psql** (in another terminal):

```bash
psql -h localhost -p 5433 -U postgres
```

---

## Test 1: Basic Transaction Control

### BEGIN and COMMIT

```sql
-- Start a transaction
BEGIN;

-- Check transaction status
SELECT 1;

-- Commit the transaction
COMMIT;
```

### BEGIN and ROLLBACK

```sql
-- Start a transaction
BEGIN;

-- Perform some operations
SELECT 'test';

-- Rollback the transaction
ROLLBACK;
```

---

## Test 2: Transaction with Isolation Levels

### Serializable Isolation

```sql
-- Start transaction with SERIALIZABLE isolation
BEGIN ISOLATION LEVEL SERIALIZABLE;
SELECT 1;
COMMIT;
```

### Repeatable Read

```sql
-- Start transaction with REPEATABLE READ
BEGIN ISOLATION LEVEL REPEATABLE READ;
SELECT 1;
COMMIT;
```

### Read Committed (Default)

```sql
-- Start transaction with READ COMMITTED
BEGIN ISOLATION LEVEL READ COMMITTED;
SELECT 1;
COMMIT;
```

### Read Uncommitted

```sql
-- Start transaction with READ UNCOMMITTED
BEGIN ISOLATION LEVEL READ UNCOMMITTED;
SELECT 1;
COMMIT;
```

---

## Test 3: START TRANSACTION (Alternative Syntax)

```sql
-- Use START TRANSACTION instead of BEGIN
START TRANSACTION ISOLATION LEVEL SERIALIZABLE;
SELECT 'using START TRANSACTION';
COMMIT;
```

---

## Test 4: Read-Only Transactions

```sql
-- Start a read-only transaction
BEGIN READ ONLY;
SELECT 'read only transaction';
COMMIT;
```

```sql
-- Combine isolation level with read-only
BEGIN ISOLATION LEVEL SERIALIZABLE READ ONLY;
SELECT 'serializable read-only';
COMMIT;
```

---

## Test 5: Deferrable Transactions

```sql
-- Deferrable transaction (only meaningful with SERIALIZABLE + READ ONLY)
BEGIN ISOLATION LEVEL SERIALIZABLE READ ONLY DEFERRABLE;
SELECT 'deferrable transaction';
COMMIT;
```

---

## Test 6: Savepoints

### Creating and Using Savepoints

```sql
-- Start transaction
BEGIN;

-- First operation
SELECT 'Operation 1';

-- Create first savepoint
SAVEPOINT sp1;

-- Second operation
SELECT 'Operation 2';

-- Create second savepoint
SAVEPOINT sp2;

-- Third operation
SELECT 'Operation 3';

-- Rollback to sp2 (discards Operation 3)
ROLLBACK TO SAVEPOINT sp2;

-- Rollback to sp1 (discards Operation 2)
ROLLBACK TO sp1;

-- Commit (only Operation 1 remains)
COMMIT;
```

### Shorter Savepoint Syntax

```sql
BEGIN;
SAVEPOINT my_savepoint;
SELECT 'test';
ROLLBACK TO my_savepoint;  -- Can omit SAVEPOINT keyword
COMMIT;
```

---

## Test 7: Releasing Savepoints

```sql
BEGIN;

-- Create savepoints
SAVEPOINT sp1;
SELECT 'After sp1';

SAVEPOINT sp2;
SELECT 'After sp2';

SAVEPOINT sp3;
SELECT 'After sp3';

-- Release sp2 (removes sp2 and sp3)
RELEASE SAVEPOINT sp2;

-- Now only sp1 exists
COMMIT;
```

### Release with Shorter Syntax

```sql
BEGIN;
SAVEPOINT my_sp;
SELECT 'test';
RELEASE my_sp;  -- Can omit SAVEPOINT keyword
COMMIT;
```

---

## Test 8: Savepoint Name Reuse (PostgreSQL Behavior)

```sql
BEGIN;

-- Create savepoint
SAVEPOINT sp1;
SELECT 'First sp1';

-- Reuse the same name (destroys old sp1, creates new one)
SAVEPOINT sp1;
SELECT 'Second sp1';

-- Rolling back goes to the second sp1
ROLLBACK TO sp1;

COMMIT;
```

---

## Test 9: Failed Transaction Recovery with Savepoints

```sql
BEGIN;

-- Successful operation
SELECT 1;

-- Create savepoint before risky operation
SAVEPOINT before_risk;

-- This will cause an error (invalid syntax)
SELECT * FROM nonexistent_table;

-- Transaction is now in failed state
-- Normal commands won't work:
SELECT 1;  -- This will fail!

-- But we can recover using the savepoint
ROLLBACK TO SAVEPOINT before_risk;

-- Transaction is active again!
SELECT 2;  -- This works now

COMMIT;
```

---

## Test 10: SET TRANSACTION

### Within a Transaction

```sql
BEGIN;

-- Must be first command after BEGIN
SET TRANSACTION ISOLATION LEVEL SERIALIZABLE;
SET TRANSACTION READ ONLY;

SELECT 'configured transaction';
COMMIT;
```

### Session Defaults

```sql
-- Set session characteristics
SET SESSION CHARACTERISTICS AS TRANSACTION ISOLATION LEVEL SERIALIZABLE;

-- Future transactions will use these settings
BEGIN;
SELECT 'uses session defaults';
COMMIT;
```

---

## Test 11: Error Handling - Nested BEGIN

```sql
-- Start a transaction
BEGIN;

-- Try to start another (should fail)
BEGIN;  -- ERROR: there is already a transaction in progress

-- Must commit or rollback first
COMMIT;
```

---

## Test 12: Error Handling - No Active Transaction

```sql
-- Try to commit without BEGIN
COMMIT;  -- ERROR: there is no transaction in progress

-- Try to rollback without BEGIN
ROLLBACK;  -- ERROR: there is no transaction in progress
```

---

## Test 13: Error Handling - Savepoints Outside Transaction

```sql
-- Try savepoint without transaction
SAVEPOINT sp1;  -- ERROR: SAVEPOINT can only be used in transaction blocks

-- Try rollback to savepoint without transaction
ROLLBACK TO sp1;  -- ERROR: ROLLBACK TO SAVEPOINT can only be used in transaction blocks

-- Try release without transaction
RELEASE sp1;  -- ERROR: RELEASE SAVEPOINT can only be used in transaction blocks
```

---

## Test 14: Error Handling - Non-existent Savepoint

```sql
BEGIN;

SAVEPOINT sp1;

-- Try to rollback to non-existent savepoint
ROLLBACK TO sp_nonexistent;  -- ERROR: savepoint "sp_nonexistent" does not exist

-- Try to release non-existent savepoint
RELEASE sp_nonexistent;  -- ERROR: savepoint "sp_nonexistent" does not exist

COMMIT;
```

---

## Test 15: Transaction Aliases (COMMIT/END, ROLLBACK/ABORT)

```sql
-- BEGIN and END (same as COMMIT)
BEGIN;
SELECT 'test';
END;

-- BEGIN and ABORT (same as ROLLBACK)
BEGIN;
SELECT 'test';
ABORT;
```

---

## Test 16: Complex Savepoint Scenario

```sql
BEGIN ISOLATION LEVEL SERIALIZABLE READ ONLY;

-- Create nested savepoints
SAVEPOINT level1;
SELECT 'Level 1';

SAVEPOINT level2;
SELECT 'Level 2';

SAVEPOINT level3;
SELECT 'Level 3';

-- Rollback to level2 (removes level3)
ROLLBACK TO level2;

-- Create new level3
SAVEPOINT level3;
SELECT 'New Level 3';

-- Release level2 (removes level2 and level3)
RELEASE level2;

-- Only level1 remains
COMMIT;
```

---

## Test 17: Monitoring Transaction State

While connected, you can check transaction state with:

```sql
-- Show current transaction isolation level
SHOW transaction_isolation;

-- Show if transaction is read-only
SHOW transaction_read_only;
```

---

## Test 18: Stress Testing with Multiple Operations

```sql
BEGIN ISOLATION LEVEL REPEATABLE READ;

-- Create multiple savepoints
SAVEPOINT sp1;
SELECT 1;

SAVEPOINT sp2;
SELECT 2;

SAVEPOINT sp3;
SELECT 3;

SAVEPOINT sp4;
SELECT 4;

SAVEPOINT sp5;
SELECT 5;

-- Rollback to middle
ROLLBACK TO sp3;

-- Continue with new operations
SELECT 'continuing';

COMMIT;
```

---

## Expected Behaviors

### ✅ Should Work:

- Multiple savepoints in a transaction
- Rolling back to any savepoint
- Releasing savepoints
- Reusing savepoint names
- All isolation levels
- Read-only transactions
- Transaction recovery via savepoints

### ❌ Should Fail:

- Nested BEGIN (already in transaction)
- COMMIT/ROLLBACK without active transaction
- Savepoint operations outside transaction
- Rolling back to non-existent savepoint
- SET TRANSACTION after first query in transaction

---

## Observing Server Logs

With `--log-level info` or `--log-level debug`, you'll see:

- Transaction start/commit/rollback messages
- Savepoint creation and operations
- Transaction state changes
- Error messages for invalid operations

Example log output:

```
Transaction started: isolation=SERIALIZABLE, readOnly=true
Savepoint created: sp1 (total: 1)
Rolled back to savepoint: sp1 (remaining: 1)
Transaction committed
```

---

## Tips for Testing

1. **Use `\set AUTOCOMMIT off`** in psql for explicit transaction control
2. **Check server logs** in the other terminal to see what's happening
3. **Try error cases** to ensure proper error messages
4. **Test recovery** with savepoints after errors
5. **Mix different commands** to test edge cases

---

## Quick Reference

| Command               | Purpose                            |
| --------------------- | ---------------------------------- |
| `BEGIN`               | Start transaction                  |
| `START TRANSACTION`   | Start transaction (alternative)    |
| `COMMIT`              | Commit transaction                 |
| `END`                 | Commit transaction (alternative)   |
| `ROLLBACK`            | Rollback transaction               |
| `ABORT`               | Rollback transaction (alternative) |
| `SAVEPOINT name`      | Create savepoint                   |
| `ROLLBACK TO name`    | Rollback to savepoint              |
| `RELEASE name`        | Release savepoint                  |
| `SET TRANSACTION ...` | Set transaction options            |

---

## Next Steps

After testing these commands, you can:

1. Write automated tests using these patterns
2. Test your application's transaction handling
3. Verify ORM transaction behavior
4. Debug transaction-related issues

For more details, see [docs/TRANSACTION_SUPPORT.md](docs/TRANSACTION_SUPPORT.md)
