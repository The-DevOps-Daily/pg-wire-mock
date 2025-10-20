/**
 * Tests for transaction handling functionality
 */

const { ConnectionState } = require('../../src/connection/connectionState');
const { TRANSACTION_STATUS, ERROR_CODES } = require('../../src/protocol/constants');

describe('Transaction Handling', () => {
  let connState;

  beforeEach(() => {
    connState = new ConnectionState();
    connState.authenticate();
  });

  describe('Basic Transaction Control', () => {
    test('should begin a transaction', () => {
      expect(connState.transactionStatus).toBe(TRANSACTION_STATUS.IDLE);

      connState.beginTransaction();

      expect(connState.transactionStatus).toBe(TRANSACTION_STATUS.IN_TRANSACTION);
      expect(connState.isInTransaction()).toBe(true);
      expect(connState.transactionStartTime).not.toBeNull();
      expect(connState.transactionDepth).toBe(1);
    });

    test('should commit a transaction', () => {
      connState.beginTransaction();
      expect(connState.isInTransaction()).toBe(true);

      connState.commitTransaction();

      expect(connState.transactionStatus).toBe(TRANSACTION_STATUS.IDLE);
      expect(connState.isInTransaction()).toBe(false);
      expect(connState.transactionStartTime).toBeNull();
      expect(connState.transactionDepth).toBe(0);
    });

    test('should rollback a transaction', () => {
      connState.beginTransaction();
      expect(connState.isInTransaction()).toBe(true);

      connState.rollbackTransaction();

      expect(connState.transactionStatus).toBe(TRANSACTION_STATUS.IDLE);
      expect(connState.isInTransaction()).toBe(false);
      expect(connState.transactionStartTime).toBeNull();
      expect(connState.transactionDepth).toBe(0);
    });

    test('should throw error when beginning transaction while already in one', () => {
      connState.beginTransaction();

      expect(() => {
        connState.beginTransaction();
      }).toThrow('Already in a transaction block');
    });

    test('should throw error when committing without active transaction', () => {
      expect(() => {
        connState.commitTransaction();
      }).toThrow('No transaction is currently active');
    });

    test('should throw error when rolling back without active transaction', () => {
      expect(() => {
        connState.rollbackTransaction();
      }).toThrow('No transaction is currently active');
    });

    test('should mark transaction as failed', () => {
      connState.beginTransaction();
      connState.failTransaction();

      expect(connState.transactionStatus).toBe(TRANSACTION_STATUS.IN_FAILED_TRANSACTION);
      expect(connState.isInFailedTransaction()).toBe(true);
    });

    test('should allow commit from failed transaction state', () => {
      connState.beginTransaction();
      connState.failTransaction();
      expect(connState.isInFailedTransaction()).toBe(true);

      connState.commitTransaction();

      expect(connState.transactionStatus).toBe(TRANSACTION_STATUS.IDLE);
    });

    test('should allow rollback from failed transaction state', () => {
      connState.beginTransaction();
      connState.failTransaction();
      expect(connState.isInFailedTransaction()).toBe(true);

      connState.rollbackTransaction();

      expect(connState.transactionStatus).toBe(TRANSACTION_STATUS.IDLE);
    });
  });

  describe('Transaction Options', () => {
    test('should begin transaction with custom isolation level', () => {
      connState.beginTransaction({ isolationLevel: 'SERIALIZABLE' });

      expect(connState.transactionIsolationLevel).toBe('SERIALIZABLE');
    });

    test('should begin transaction as read-only', () => {
      connState.beginTransaction({ readOnly: true });

      expect(connState.transactionReadOnly).toBe(true);
    });

    test('should begin transaction as deferrable', () => {
      connState.beginTransaction({ deferrable: true });

      expect(connState.transactionDeferrable).toBe(true);
    });

    test('should begin transaction with multiple options', () => {
      connState.beginTransaction({
        isolationLevel: 'REPEATABLE READ',
        readOnly: true,
        deferrable: true,
      });

      expect(connState.transactionIsolationLevel).toBe('REPEATABLE READ');
      expect(connState.transactionReadOnly).toBe(true);
      expect(connState.transactionDeferrable).toBe(true);
    });

    test('should reset transaction options on commit', () => {
      connState.beginTransaction({
        isolationLevel: 'SERIALIZABLE',
        readOnly: true,
        deferrable: true,
      });

      connState.commitTransaction();

      expect(connState.transactionIsolationLevel).toBe('READ COMMITTED');
      expect(connState.transactionReadOnly).toBe(false);
      expect(connState.transactionDeferrable).toBe(false);
    });

    test('should reset transaction options on rollback', () => {
      connState.beginTransaction({
        isolationLevel: 'SERIALIZABLE',
        readOnly: true,
      });

      connState.rollbackTransaction();

      expect(connState.transactionIsolationLevel).toBe('READ COMMITTED');
      expect(connState.transactionReadOnly).toBe(false);
    });
  });

  describe('Transaction Isolation Levels', () => {
    test('should set transaction isolation level', () => {
      connState.setTransactionIsolationLevel('SERIALIZABLE');
      expect(connState.getTransactionIsolationLevel()).toBe('SERIALIZABLE');
    });

    test('should accept all valid isolation levels', () => {
      const validLevels = ['READ UNCOMMITTED', 'READ COMMITTED', 'REPEATABLE READ', 'SERIALIZABLE'];

      validLevels.forEach(level => {
        connState.setTransactionIsolationLevel(level);
        expect(connState.getTransactionIsolationLevel()).toBe(level);
      });
    });

    test('should throw error for invalid isolation level', () => {
      expect(() => {
        connState.setTransactionIsolationLevel('INVALID LEVEL');
      }).toThrow('Invalid isolation level');
    });

    test('should default to READ COMMITTED', () => {
      expect(connState.getTransactionIsolationLevel()).toBe('READ COMMITTED');
    });
  });

  describe('Savepoint Management', () => {
    beforeEach(() => {
      connState.beginTransaction();
    });

    test('should create a savepoint', () => {
      connState.createSavepoint('sp1');

      expect(connState.hasSavepoint('sp1')).toBe(true);
      expect(connState.getSavepoints()).toEqual(['sp1']);
      expect(connState.savepoints.length).toBe(1);
    });

    test('should create multiple savepoints', () => {
      connState.createSavepoint('sp1');
      connState.createSavepoint('sp2');
      connState.createSavepoint('sp3');

      expect(connState.getSavepoints()).toEqual(['sp1', 'sp2', 'sp3']);
      expect(connState.savepoints.length).toBe(3);
    });

    test('should throw error when creating savepoint outside transaction', () => {
      connState.rollbackTransaction();

      expect(() => {
        connState.createSavepoint('sp1');
      }).toThrow('SAVEPOINT can only be used in transaction blocks');
    });

    test('should allow reusing savepoint names (overwrites)', () => {
      connState.createSavepoint('sp1');
      connState.createSavepoint('sp2');
      connState.createSavepoint('sp1'); // Reuse sp1

      // Should have sp2 and the new sp1
      expect(connState.savepoints.length).toBe(2);
      expect(connState.hasSavepoint('sp1')).toBe(true);
      expect(connState.hasSavepoint('sp2')).toBe(true);
    });

    test('should rollback to savepoint', () => {
      connState.createSavepoint('sp1');
      connState.createSavepoint('sp2');
      connState.createSavepoint('sp3');

      connState.rollbackToSavepoint('sp2');

      // sp3 should be removed, sp1 and sp2 should remain
      expect(connState.getSavepoints()).toEqual(['sp1', 'sp2']);
    });

    test('should throw error when rolling back to non-existent savepoint', () => {
      connState.createSavepoint('sp1');

      expect(() => {
        connState.rollbackToSavepoint('sp_nonexistent');
      }).toThrow('Savepoint "sp_nonexistent" does not exist');
    });

    test('should throw error when rolling back to savepoint outside transaction', () => {
      connState.rollbackTransaction();

      expect(() => {
        connState.rollbackToSavepoint('sp1');
      }).toThrow('ROLLBACK TO SAVEPOINT can only be used in transaction blocks');
    });

    test('should recover from failed transaction when rolling back to savepoint', () => {
      connState.createSavepoint('sp1');
      connState.failTransaction();

      expect(connState.isInFailedTransaction()).toBe(true);

      connState.rollbackToSavepoint('sp1');

      expect(connState.isInTransaction()).toBe(true);
      expect(connState.isInFailedTransaction()).toBe(false);
    });

    test('should release a savepoint', () => {
      connState.createSavepoint('sp1');
      connState.createSavepoint('sp2');
      connState.createSavepoint('sp3');

      connState.releaseSavepoint('sp2');

      // sp2 and sp3 should be removed
      expect(connState.getSavepoints()).toEqual(['sp1']);
    });

    test('should throw error when releasing non-existent savepoint', () => {
      expect(() => {
        connState.releaseSavepoint('sp_nonexistent');
      }).toThrow('Savepoint "sp_nonexistent" does not exist');
    });

    test('should throw error when releasing savepoint outside transaction', () => {
      connState.rollbackTransaction();

      expect(() => {
        connState.releaseSavepoint('sp1');
      }).toThrow('RELEASE SAVEPOINT can only be used in transaction blocks');
    });

    test('should clear all savepoints on commit', () => {
      connState.createSavepoint('sp1');
      connState.createSavepoint('sp2');

      connState.commitTransaction();

      expect(connState.savepoints.length).toBe(0);
      expect(connState.getSavepoints()).toEqual([]);
    });

    test('should clear all savepoints on rollback', () => {
      connState.createSavepoint('sp1');
      connState.createSavepoint('sp2');

      connState.rollbackTransaction();

      expect(connState.savepoints.length).toBe(0);
      expect(connState.getSavepoints()).toEqual([]);
    });
  });

  describe('Transaction Duration Tracking', () => {
    test('should track transaction duration', done => {
      connState.beginTransaction();

      setTimeout(() => {
        const duration = connState.getTransactionDuration();
        expect(duration).toBeGreaterThanOrEqual(100);
        expect(duration).toBeLessThan(200);
        done();
      }, 100);
    });

    test('should return null for transaction duration when not in transaction', () => {
      expect(connState.getTransactionDuration()).toBeNull();
    });

    test('should reset transaction duration on commit', () => {
      connState.beginTransaction();
      expect(connState.getTransactionDuration()).not.toBeNull();

      connState.commitTransaction();

      expect(connState.getTransactionDuration()).toBeNull();
    });
  });

  describe('Connection State Summary', () => {
    test('should include transaction info in summary', () => {
      connState.beginTransaction({
        isolationLevel: 'SERIALIZABLE',
        readOnly: true,
      });
      connState.createSavepoint('sp1');
      connState.createSavepoint('sp2');

      const summary = connState.getSummary();

      expect(summary.transactionStatus).toBe(TRANSACTION_STATUS.IN_TRANSACTION);
      expect(summary.transactionIsolationLevel).toBe('SERIALIZABLE');
      expect(summary.transactionReadOnly).toBe(true);
      expect(summary.savepoints).toEqual(['sp1', 'sp2']);
      expect(summary.savepointCount).toBe(2);
      expect(summary.transactionDuration).not.toBeNull();
    });
  });

  describe('Connection Reset', () => {
    test('should reset transaction state when resetting connection', () => {
      connState.beginTransaction({
        isolationLevel: 'SERIALIZABLE',
        readOnly: true,
      });
      connState.createSavepoint('sp1');

      const result = connState.resetForReuse();

      expect(result).toBe(true);
      expect(connState.transactionStatus).toBe(TRANSACTION_STATUS.IDLE);
      expect(connState.transactionIsolationLevel).toBe('READ COMMITTED');
      expect(connState.transactionReadOnly).toBe(false);
      expect(connState.transactionDeferrable).toBe(false);
      expect(connState.savepoints.length).toBe(0);
      expect(connState.transactionStartTime).toBeNull();
      expect(connState.transactionDepth).toBe(0);
    });

    test('should not allow reuse of connection in transaction', () => {
      connState.beginTransaction();

      expect(connState.isReusable()).toBe(false);
    });

    test('should not allow reuse of connection in failed transaction', () => {
      connState.beginTransaction();
      connState.failTransaction();

      expect(connState.isReusable()).toBe(false);
    });
  });

  describe('Nested Transaction Attempts', () => {
    test('should track nested BEGIN attempts', () => {
      connState.beginTransaction();
      expect(connState.transactionDepth).toBe(1);

      try {
        connState.beginTransaction();
      } catch (error) {
        // Expected error
      }

      expect(connState.transactionDepth).toBe(2);
    });

    test('should throw error on nested transaction attempt', () => {
      connState.beginTransaction();

      expect(() => {
        connState.beginTransaction();
      }).toThrow('Already in a transaction block');
    });
  });
});

describe('Transaction Query Handlers', () => {
  const {
    handleTransactionQuery,
    parseTransactionOptions,
  } = require('../../src/handlers/queryHandlers');

  let connState;

  beforeEach(() => {
    connState = new ConnectionState();
    connState.authenticate();
  });

  describe('parseTransactionOptions', () => {
    test('should parse isolation level', () => {
      const query = 'BEGIN ISOLATION LEVEL SERIALIZABLE';
      const options = parseTransactionOptions(query);

      expect(options.isolationLevel).toBe('SERIALIZABLE');
    });

    test('should parse read only mode', () => {
      const query = 'BEGIN READ ONLY';
      const options = parseTransactionOptions(query);

      expect(options.readOnly).toBe(true);
    });

    test('should parse read write mode', () => {
      const query = 'BEGIN READ WRITE';
      const options = parseTransactionOptions(query);

      expect(options.readOnly).toBe(false);
    });

    test('should parse deferrable mode', () => {
      const query = 'BEGIN DEFERRABLE';
      const options = parseTransactionOptions(query);

      expect(options.deferrable).toBe(true);
    });

    test('should parse multiple options', () => {
      const query = 'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY DEFERRABLE';
      const options = parseTransactionOptions(query);

      expect(options.isolationLevel).toBe('REPEATABLE READ');
      expect(options.readOnly).toBe(true);
      expect(options.deferrable).toBe(true);
    });

    test('should return empty object for simple BEGIN', () => {
      const query = 'BEGIN';
      const options = parseTransactionOptions(query);

      expect(options).toEqual({});
    });
  });

  describe('BEGIN command variations', () => {
    test('should handle BEGIN', () => {
      const result = handleTransactionQuery('BEGIN', connState, 'BEGIN');

      expect(result.command).toBe('BEGIN');
      expect(result.rowCount).toBe(0);
      expect(connState.isInTransaction()).toBe(true);
    });

    test('should handle START TRANSACTION', () => {
      const result = handleTransactionQuery('BEGIN', connState, 'START TRANSACTION');

      expect(result.command).toBe('BEGIN');
      expect(connState.isInTransaction()).toBe(true);
    });

    test('should handle BEGIN with options', () => {
      const result = handleTransactionQuery(
        'BEGIN',
        connState,
        'BEGIN ISOLATION LEVEL SERIALIZABLE READ ONLY'
      );

      expect(result.command).toBe('BEGIN');
      expect(connState.transactionIsolationLevel).toBe('SERIALIZABLE');
      expect(connState.transactionReadOnly).toBe(true);
    });

    test('should return error for nested BEGIN', () => {
      connState.beginTransaction();
      const result = handleTransactionQuery('BEGIN', connState, 'BEGIN');

      expect(result.error).toBeDefined();
      expect(result.error.code).toBe(ERROR_CODES.ACTIVE_SQL_TRANSACTION);
    });
  });

  describe('COMMIT command variations', () => {
    beforeEach(() => {
      connState.beginTransaction();
    });

    test('should handle COMMIT', () => {
      const result = handleTransactionQuery('COMMIT', connState, 'COMMIT');

      expect(result.command).toBe('COMMIT');
      expect(result.rowCount).toBe(0);
      expect(connState.isInTransaction()).toBe(false);
    });

    test('should handle END', () => {
      const result = handleTransactionQuery('COMMIT', connState, 'END');

      expect(result.command).toBe('COMMIT');
      expect(connState.isInTransaction()).toBe(false);
    });

    test('should return error for COMMIT without transaction', () => {
      connState.commitTransaction();
      const result = handleTransactionQuery('COMMIT', connState, 'COMMIT');

      expect(result.error).toBeDefined();
      expect(result.error.code).toBe(ERROR_CODES.NO_ACTIVE_SQL_TRANSACTION);
    });
  });

  describe('ROLLBACK command variations', () => {
    beforeEach(() => {
      connState.beginTransaction();
    });

    test('should handle ROLLBACK', () => {
      const result = handleTransactionQuery('ROLLBACK', connState, 'ROLLBACK');

      expect(result.command).toBe('ROLLBACK');
      expect(result.rowCount).toBe(0);
      expect(connState.isInTransaction()).toBe(false);
    });

    test('should handle ABORT', () => {
      const result = handleTransactionQuery('ROLLBACK', connState, 'ABORT');

      expect(result.command).toBe('ROLLBACK');
      expect(connState.isInTransaction()).toBe(false);
    });

    test('should return error for ROLLBACK without transaction', () => {
      connState.rollbackTransaction();
      const result = handleTransactionQuery('ROLLBACK', connState, 'ROLLBACK');

      expect(result.error).toBeDefined();
      expect(result.error.code).toBe(ERROR_CODES.NO_ACTIVE_SQL_TRANSACTION);
    });
  });

  describe('SAVEPOINT commands', () => {
    beforeEach(() => {
      connState.beginTransaction();
    });

    test('should handle SAVEPOINT', () => {
      const result = handleTransactionQuery('SAVEPOINT', connState, 'SAVEPOINT sp1');

      expect(result.command).toBe('SAVEPOINT');
      expect(result.rowCount).toBe(0);
      expect(connState.hasSavepoint('sp1')).toBe(true);
    });

    test('should return error for SAVEPOINT without name', () => {
      const result = handleTransactionQuery('SAVEPOINT', connState, 'SAVEPOINT');

      expect(result.error).toBeDefined();
    });

    test('should return error for SAVEPOINT outside transaction', () => {
      connState.rollbackTransaction();
      const result = handleTransactionQuery('SAVEPOINT', connState, 'SAVEPOINT sp1');

      expect(result.error).toBeDefined();
      expect(result.error.code).toBe(ERROR_CODES.NO_ACTIVE_SQL_TRANSACTION);
    });
  });

  describe('ROLLBACK TO SAVEPOINT commands', () => {
    beforeEach(() => {
      connState.beginTransaction();
      connState.createSavepoint('sp1');
      connState.createSavepoint('sp2');
    });

    test('should handle ROLLBACK TO SAVEPOINT', () => {
      const result = handleTransactionQuery('ROLLBACK', connState, 'ROLLBACK TO SAVEPOINT sp1');

      expect(result.command).toBe('ROLLBACK TO SAVEPOINT');
      expect(result.rowCount).toBe(0);
      expect(connState.hasSavepoint('sp1')).toBe(true);
      expect(connState.hasSavepoint('sp2')).toBe(false);
    });

    test('should handle ROLLBACK TO sp1', () => {
      const result = handleTransactionQuery('ROLLBACK', connState, 'ROLLBACK TO sp1');

      expect(result.command).toBe('ROLLBACK TO SAVEPOINT');
      expect(connState.hasSavepoint('sp1')).toBe(true);
    });

    test('should return error for non-existent savepoint', () => {
      const result = handleTransactionQuery(
        'ROLLBACK',
        connState,
        'ROLLBACK TO SAVEPOINT sp_nonexistent'
      );

      expect(result.error).toBeDefined();
      expect(result.error.code).toBe(ERROR_CODES.UNDEFINED_SAVEPOINT);
    });

    test('should return error when outside transaction', () => {
      connState.rollbackTransaction();
      const result = handleTransactionQuery('ROLLBACK', connState, 'ROLLBACK TO SAVEPOINT sp1');

      expect(result.error).toBeDefined();
      expect(result.error.code).toBe(ERROR_CODES.NO_ACTIVE_SQL_TRANSACTION);
    });

    test('should recover from failed transaction', () => {
      connState.failTransaction();
      expect(connState.isInFailedTransaction()).toBe(true);

      const result = handleTransactionQuery('ROLLBACK', connState, 'ROLLBACK TO SAVEPOINT sp1');

      expect(result.command).toBe('ROLLBACK TO SAVEPOINT');
      expect(connState.isInTransaction()).toBe(true);
      expect(connState.isInFailedTransaction()).toBe(false);
    });
  });

  describe('RELEASE SAVEPOINT commands', () => {
    beforeEach(() => {
      connState.beginTransaction();
      connState.createSavepoint('sp1');
      connState.createSavepoint('sp2');
    });

    test('should handle RELEASE SAVEPOINT', () => {
      const result = handleTransactionQuery('RELEASE', connState, 'RELEASE SAVEPOINT sp1');

      expect(result.command).toBe('RELEASE SAVEPOINT');
      expect(result.rowCount).toBe(0);
      expect(connState.hasSavepoint('sp1')).toBe(false);
      expect(connState.hasSavepoint('sp2')).toBe(false);
    });

    test('should handle RELEASE sp1', () => {
      const result = handleTransactionQuery('RELEASE', connState, 'RELEASE sp1');

      expect(result.command).toBe('RELEASE SAVEPOINT');
      expect(connState.hasSavepoint('sp1')).toBe(false);
    });

    test('should return error for non-existent savepoint', () => {
      const result = handleTransactionQuery(
        'RELEASE',
        connState,
        'RELEASE SAVEPOINT sp_nonexistent'
      );

      expect(result.error).toBeDefined();
      expect(result.error.code).toBe(ERROR_CODES.UNDEFINED_SAVEPOINT);
    });

    test('should return error when outside transaction', () => {
      connState.rollbackTransaction();
      const result = handleTransactionQuery('RELEASE', connState, 'RELEASE SAVEPOINT sp1');

      expect(result.error).toBeDefined();
      expect(result.error.code).toBe(ERROR_CODES.NO_ACTIVE_SQL_TRANSACTION);
    });
  });
});
