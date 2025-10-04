/**
 * @jest-environment node
 */

const { StatsCollector, RingBuffer } = require('../../src/monitoring/statsCollector');

describe('RingBuffer', () => {
  test('should initialize with correct size', () => {
    const buffer = new RingBuffer(10);
    expect(buffer.size).toBe(10);
    expect(buffer.count).toBe(0);
    expect(buffer.index).toBe(0);
  });

  test('should add values correctly', () => {
    const buffer = new RingBuffer(3);
    buffer.push(1);
    buffer.push(2);
    buffer.push(3);
    
    expect(buffer.count).toBe(3);
    expect(buffer.buffer).toEqual([1, 2, 3]);
  });

  test('should wrap around when full', () => {
    const buffer = new RingBuffer(3);
    buffer.push(1);
    buffer.push(2);
    buffer.push(3);
    buffer.push(4); // Should overwrite first element
    
    expect(buffer.count).toBe(3);
    expect(buffer.buffer).toEqual([4, 2, 3]);
  });

  test('should calculate percentiles correctly', () => {
    const buffer = new RingBuffer(10);
    [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].forEach(v => buffer.push(v));
    
    expect(buffer.getPercentile(50)).toBe(5);
    expect(buffer.getPercentile(90)).toBe(9);
    expect(buffer.getPercentile(100)).toBe(10);
  });

  test('should return 0 for empty buffer percentiles', () => {
    const buffer = new RingBuffer(10);
    expect(buffer.getPercentile(50)).toBe(0);
    expect(buffer.getPercentile(90)).toBe(0);
  });

  test('should return stats object', () => {
    const buffer = new RingBuffer(10);
    [1, 2, 3, 4, 5].forEach(v => buffer.push(v));
    
    const stats = buffer.getStats();
    expect(stats).toHaveProperty('count', 5);
    expect(stats).toHaveProperty('p50', 3);
    expect(stats).toHaveProperty('p90', 5);
    expect(stats).toHaveProperty('p95', 5);
    expect(stats).toHaveProperty('p99', 5);
  });
});

describe('StatsCollector', () => {
  let collector;

  beforeEach(() => {
    collector = new StatsCollector({
      enableMetrics: true,
      slowQueryThreshold: 100,
      retentionPeriod: 1000,
    });
  });

  afterEach(() => {
    if (collector) {
      collector.destroy();
    }
  });

  describe('Connection Metrics', () => {
    test('should record connection creation', () => {
      collector.recordConnectionCreated('conn_1', {
        remoteAddress: '127.0.0.1',
        remotePort: 12345,
      });

      expect(collector.connectionMetrics.totalCreated).toBe(1);
      expect(collector.connectionMetrics.currentActive).toBe(1);
      expect(collector.connectionDetails.has('conn_1')).toBe(true);

      const details = collector.connectionDetails.get('conn_1');
      expect(details).toMatchObject({
        state: 'active',
        queriesExecuted: 0,
        bytesReceived: 0,
        bytesSent: 0,
        remoteAddress: '127.0.0.1',
        remotePort: 12345,
      });
    });

    test('should record connection destruction', () => {
      collector.recordConnectionCreated('conn_1');
      collector.recordConnectionDestroyed('conn_1', 'client_disconnect');

      expect(collector.connectionMetrics.totalDestroyed).toBe(1);
      expect(collector.connectionMetrics.currentActive).toBe(0);
      expect(collector.connectionDetails.has('conn_1')).toBe(false);
    });

    test('should track peak connections', () => {
      collector.recordConnectionCreated('conn_1');
      collector.recordConnectionCreated('conn_2');
      collector.recordConnectionCreated('conn_3');

      expect(collector.connectionMetrics.peakConnections).toBe(3);

      collector.recordConnectionDestroyed('conn_1');
      expect(collector.connectionMetrics.peakConnections).toBe(3); // Should not decrease
    });

    test('should record connection wait times', () => {
      collector.recordConnectionWait(150);
      collector.recordConnectionWait(75);

      const stats = collector.connectionMetrics.connectionWaitTimes.getStats();
      expect(stats.count).toBe(2);
    });

    test('should record connection errors and timeouts', () => {
      collector.recordConnectionError();
      collector.recordConnectionTimeout();

      expect(collector.connectionMetrics.connectionErrors).toBe(1);
      expect(collector.connectionMetrics.connectionTimeouts).toBe(1);
    });

    test('should record connection state changes', () => {
      collector.recordConnectionCreated('conn_1');
      collector.recordConnectionStateChange('conn_1', 'idle');

      const details = collector.connectionDetails.get('conn_1');
      expect(details.state).toBe('idle');
    });

    test('should record data transfer', () => {
      collector.recordConnectionCreated('conn_1');
      collector.recordDataTransfer('conn_1', 100, 200);

      const details = collector.connectionDetails.get('conn_1');
      expect(details.bytesReceived).toBe(100);
      expect(details.bytesSent).toBe(200);
    });
  });

  describe('Query Metrics', () => {
    test('should record successful queries', () => {
      const query = 'SELECT * FROM users';
      collector.recordQuery('conn_1', query, 50, true);

      expect(collector.queryMetrics.totalQueries).toBe(1);
      expect(collector.queryMetrics.queryTypes.SELECT).toBe(1);
      expect(collector.queryMetrics.queryLatencies.count).toBe(1);
    });

    test('should record failed queries', () => {
      const query = 'SELECT * FROM nonexistent';
      const error = new Error('Table does not exist');
      collector.recordQuery('conn_1', query, 25, false, error);

      expect(collector.queryMetrics.totalQueries).toBe(1);
      expect(collector.queryMetrics.failedQueries.RUNTIME_ERROR).toBe(1);
    });

    test('should track slow queries', () => {
      const slowQuery = 'SELECT * FROM large_table';
      collector.recordQuery('conn_1', slowQuery, 150, true); // Above threshold

      expect(collector.queryMetrics.slowQueries).toHaveLength(1);
      expect(collector.queryMetrics.slowQueries[0]).toMatchObject({
        query: slowQuery,
        latency: 150,
        connectionId: 'conn_1',
      });
    });

    test('should extract query types correctly', () => {
      expect(collector.extractQueryType('SELECT * FROM users')).toBe('SELECT');
      expect(collector.extractQueryType('INSERT INTO users VALUES(1)')).toBe('INSERT');
      expect(collector.extractQueryType('UPDATE users SET name = "test"')).toBe('UPDATE');
      expect(collector.extractQueryType('DELETE FROM users WHERE id = 1')).toBe('DELETE');
      expect(collector.extractQueryType('BEGIN TRANSACTION')).toBe('BEGIN');
      expect(collector.extractQueryType('COMMIT')).toBe('COMMIT');
      expect(collector.extractQueryType('ROLLBACK')).toBe('ROLLBACK');
      expect(collector.extractQueryType('SHOW TABLES')).toBe('SHOW');
      expect(collector.extractQueryType('CREATE TABLE test (id INT)')).toBe('OTHER');
    });

    test('should classify errors correctly', () => {
      expect(collector.classifyError(new Error('syntax error at position 5'))).toBe('SYNTAX_ERROR');
      expect(collector.classifyError(new Error('parse error in query'))).toBe('SYNTAX_ERROR');
      expect(collector.classifyError(new Error('connection timeout'))).toBe('TIMEOUT');
      expect(collector.classifyError(new Error('table not found'))).toBe('RUNTIME_ERROR');
    });

    test('should clean up old slow queries', (done) => {
      // Use a very short retention period for testing
      const shortCollector = new StatsCollector({
        enableMetrics: true,
        slowQueryThreshold: 50,
        retentionPeriod: 100, // 100ms
      });

      shortCollector.recordQuery('conn_1', 'SLOW QUERY', 100, true);
      expect(shortCollector.queryMetrics.slowQueries).toHaveLength(1);

      setTimeout(() => {
        // Trigger cleanup by recording another slow query
        shortCollector.recordQuery('conn_1', 'ANOTHER SLOW QUERY', 100, true);
        expect(shortCollector.queryMetrics.slowQueries).toHaveLength(1); // Old one should be cleaned up
        shortCollector.destroy();
        done();
      }, 150);
    });
  });

  describe('Protocol Metrics', () => {
    test('should record protocol messages', () => {
      collector.recordProtocolMessage('QUERY', false);
      collector.recordProtocolMessage('PARSE', true);
      collector.recordProtocolMessage('EXECUTE', true);

      expect(collector.protocolMetrics.messageTypes.QUERY).toBe(1);
      expect(collector.protocolMetrics.messageTypes.PARSE).toBe(1);
      expect(collector.protocolMetrics.messageTypes.EXECUTE).toBe(1);
      expect(collector.protocolMetrics.simpleProtocolUsage).toBe(1);
      expect(collector.protocolMetrics.extendedProtocolUsage).toBe(2);
    });

    test('should record prepared statement cache hits/misses', () => {
      collector.recordPreparedStatement(true);
      collector.recordPreparedStatement(false);
      collector.recordPreparedStatement(true);

      expect(collector.protocolMetrics.preparedStatementHits).toBe(2);
      expect(collector.protocolMetrics.preparedStatementMisses).toBe(1);
    });
  });

  describe('Statistics Retrieval', () => {
    test('should return comprehensive stats', () => {
      // Set up some test data
      collector.recordConnectionCreated('conn_1');
      collector.recordQuery('conn_1', 'SELECT 1', 25, true);
      collector.recordProtocolMessage('QUERY', false);

      const stats = collector.getStats();

      expect(stats).toHaveProperty('timestamp');
      expect(stats).toHaveProperty('connections');
      expect(stats).toHaveProperty('queries');
      expect(stats).toHaveProperty('protocol');

      expect(stats.connections).toHaveProperty('totalCreated', 1);
      expect(stats.connections).toHaveProperty('currentActive', 1);
      expect(stats.connections).toHaveProperty('details');
      expect(stats.connections.details).toHaveLength(1);

      expect(stats.queries).toHaveProperty('totalQueries', 1);
      expect(stats.queries).toHaveProperty('queryLatencies');
      expect(stats.queries.queryLatencies).toHaveProperty('count', 1);

      expect(stats.protocol).toHaveProperty('messageTypes');
      expect(stats.protocol.messageTypes.QUERY).toBe(1);
    });

    test('should include connection idle times in stats', () => {
      collector.recordConnectionCreated('conn_1');
      
      // Wait a bit then get stats
      setTimeout(() => {
        const stats = collector.getStats();
        const connection = stats.connections.details[0];
        expect(connection).toHaveProperty('idleTime');
        expect(connection.idleTime).toBeGreaterThan(0);
      }, 10);
    });
  });

  describe('Configuration', () => {
    test('should disable metrics when configured', () => {
      const disabledCollector = new StatsCollector({ enableMetrics: false });
      
      disabledCollector.recordConnectionCreated('conn_1');
      disabledCollector.recordQuery('conn_1', 'SELECT 1', 25, true);

      expect(disabledCollector.connectionMetrics.totalCreated).toBe(0);
      expect(disabledCollector.queryMetrics.totalQueries).toBe(0);

      disabledCollector.destroy();
    });

    test('should respect custom slow query threshold', () => {
      const customCollector = new StatsCollector({
        enableMetrics: true,
        slowQueryThreshold: 200,
      });

      customCollector.recordQuery('conn_1', 'FAST QUERY', 150, true); // Below custom threshold
      customCollector.recordQuery('conn_1', 'SLOW QUERY', 250, true); // Above custom threshold

      expect(customCollector.queryMetrics.slowQueries).toHaveLength(1);
      expect(customCollector.queryMetrics.slowQueries[0].query).toBe('SLOW QUERY');

      customCollector.destroy();
    });
  });

  describe('Event Emission', () => {
    test('should emit connection events', (done) => {
      let eventsReceived = 0;

      collector.on('connectionCreated', (data) => {
        expect(data).toHaveProperty('connectionId', 'conn_1');
        eventsReceived++;
      });

      collector.on('connectionDestroyed', (data) => {
        expect(data).toHaveProperty('connectionId', 'conn_1');
        expect(data).toHaveProperty('reason', 'test');
        eventsReceived++;
        
        if (eventsReceived === 2) {
          done();
        }
      });

      collector.recordConnectionCreated('conn_1');
      collector.recordConnectionDestroyed('conn_1', 'test');
    });

    test('should emit query events', (done) => {
      collector.on('queryExecuted', (data) => {
        expect(data).toHaveProperty('connectionId', 'conn_1');
        expect(data).toHaveProperty('query', 'SELECT 1');
        expect(data).toHaveProperty('latencyMs', 25);
        expect(data).toHaveProperty('success', true);
        done();
      });

      collector.recordQuery('conn_1', 'SELECT 1', 25, true);
    });
  });

  describe('Cleanup and Destruction', () => {
    test('should clean up resources on destroy', () => {
      collector.recordConnectionCreated('conn_1');
      expect(collector.connectionDetails.size).toBe(1);

      collector.destroy();
      expect(collector.connectionDetails.size).toBe(0);
      expect(collector.listenerCount('connectionCreated')).toBe(0);
    });

    test('should clean up old slow queries periodically', (done) => {
      // Mock setInterval to control timing
      const originalSetInterval = global.setInterval;
      let intervalCallback;

      global.setInterval = (callback, interval) => {
        if (interval === 60000) { // Cleanup interval
          intervalCallback = callback;
          return { id: 'cleanup' };
        }
        return originalSetInterval(callback, interval);
      };

      const testCollector = new StatsCollector({
        enableMetrics: true,
        slowQueryThreshold: 50,
        retentionPeriod: 100,
      });

      // Add a slow query
      testCollector.recordQuery('conn_1', 'OLD SLOW QUERY', 100, true);
      expect(testCollector.queryMetrics.slowQueries).toHaveLength(1);

      // Wait for it to become old
      setTimeout(() => {
        // Trigger cleanup
        intervalCallback();
        expect(testCollector.queryMetrics.slowQueries).toHaveLength(0);
        
        testCollector.destroy();
        global.setInterval = originalSetInterval;
        done();
      }, 150);
    });
  });
});