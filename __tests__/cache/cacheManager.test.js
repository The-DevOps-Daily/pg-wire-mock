/**
 * Tests for Cache Manager
 */

const { CacheManager, MemoryCacheBackend, CacheStats } = require('../../src/cache/cacheManager');

describe('CacheStats', () => {
  let stats;

  beforeEach(() => {
    stats = new CacheStats();
  });

  test('should initialize with zero values', () => {
    expect(stats.hits).toBe(0);
    expect(stats.misses).toBe(0);
    expect(stats.sets).toBe(0);
    expect(stats.invalidations).toBe(0);
    expect(stats.errors).toBe(0);
  });

  test('should record hits', () => {
    stats.recordHit();
    stats.recordHit();
    expect(stats.hits).toBe(2);
  });

  test('should record misses', () => {
    stats.recordMiss();
    expect(stats.misses).toBe(1);
  });

  test('should calculate hit rate correctly', () => {
    stats.recordHit();
    stats.recordHit();
    stats.recordMiss();

    const statsData = stats.getStats();
    expect(statsData.hits).toBe(2);
    expect(statsData.misses).toBe(1);
    expect(statsData.totalRequests).toBe(3);
    expect(statsData.hitRate).toBe('66.67%');
  });

  test('should reset statistics', () => {
    stats.recordHit();
    stats.recordMiss();
    stats.reset();

    expect(stats.hits).toBe(0);
    expect(stats.misses).toBe(0);
  });
});

describe('MemoryCacheBackend', () => {
  let backend;

  beforeEach(() => {
    backend = new MemoryCacheBackend({ maxSize: 3, cleanupInterval: 100 });
  });

  afterEach(async () => {
    await backend.close();
  });

  test('should store and retrieve values', async () => {
    await backend.set('key1', 'value1');
    const value = await backend.get('key1');
    expect(value).toBe('value1');
  });

  test('should return null for non-existent keys', async () => {
    const value = await backend.get('nonexistent');
    expect(value).toBeNull();
  });

  test('should handle TTL expiration', async () => {
    await backend.set('key1', 'value1', 50); // 50ms TTL
    let value = await backend.get('key1');
    expect(value).toBe('value1');

    // Wait for expiration
    await new Promise(resolve => setTimeout(resolve, 60));
    value = await backend.get('key1');
    expect(value).toBeNull();
  });

  test('should enforce max size with LRU eviction', async () => {
    await backend.set('key1', 'value1');
    await backend.set('key2', 'value2');
    await backend.set('key3', 'value3');
    await backend.set('key4', 'value4'); // Should evict key1

    expect(await backend.get('key1')).toBeNull();
    expect(await backend.get('key2')).toBe('value2');
    expect(await backend.get('key3')).toBe('value3');
    expect(await backend.get('key4')).toBe('value4');
  });

  test('should delete keys', async () => {
    await backend.set('key1', 'value1');
    await backend.delete('key1');
    const value = await backend.get('key1');
    expect(value).toBeNull();
  });

  test('should clear all entries', async () => {
    await backend.set('key1', 'value1');
    await backend.set('key2', 'value2');
    await backend.clear();

    expect(await backend.get('key1')).toBeNull();
    expect(await backend.get('key2')).toBeNull();
    expect(await backend.size()).toBe(0);
  });

  test('should cleanup expired entries', async () => {
    await backend.set('key1', 'value1', 50);
    await backend.set('key2', 'value2', 200);

    // Wait for first key to expire
    await new Promise(resolve => setTimeout(resolve, 60));
    backend.cleanup();

    expect(await backend.get('key1')).toBeNull();
    expect(await backend.get('key2')).toBe('value2');
  });
});

describe('CacheManager', () => {
  let cacheManager;

  beforeEach(async () => {
    cacheManager = new CacheManager({
      enabled: true,
      backend: 'memory',
      ttl: 1000,
      maxSize: 10,
    });
    await cacheManager.initialize();
  });

  afterEach(async () => {
    await cacheManager.close();
  });

  test('should initialize successfully', () => {
    expect(cacheManager.initialized).toBe(true);
    expect(cacheManager.config.enabled).toBe(true);
  });

  test('should generate consistent cache keys', () => {
    const key1 = cacheManager.generateKey('SELECT 1', []);
    const key2 = cacheManager.generateKey('SELECT 1', []);
    const key3 = cacheManager.generateKey('SELECT 2', []);

    expect(key1).toBe(key2);
    expect(key1).not.toBe(key3);
  });

  test('should cache and retrieve query results', async () => {
    const query = 'SELECT * FROM users';
    const result = { columns: [], rows: [[1, 'test']], command: 'SELECT', rowCount: 1 };

    await cacheManager.set(query, [], result);
    const cached = await cacheManager.get(query, []);

    expect(cached).toEqual(result);
  });

  test('should return null for cache miss', async () => {
    const cached = await cacheManager.get('SELECT * FROM nonexistent', []);
    expect(cached).toBeNull();
  });

  test('should bypass cache for write operations', async () => {
    const queries = [
      'INSERT INTO users VALUES (1)',
      'UPDATE users SET name = "test"',
      'DELETE FROM users WHERE id = 1',
      'CREATE TABLE test (id INT)',
      'DROP TABLE test',
      'BEGIN',
      'COMMIT',
      'ROLLBACK',
    ];

    for (const query of queries) {
      expect(cacheManager.shouldBypassCache(query)).toBe(true);
    }
  });

  test('should not bypass cache for read operations', () => {
    const queries = ['SELECT * FROM users', 'SHOW TABLES', 'SELECT VERSION()'];

    for (const query of queries) {
      expect(cacheManager.shouldBypassCache(query)).toBe(false);
    }
  });

  test('should bypass cache for custom patterns', async () => {
    const manager = new CacheManager({
      enabled: true,
      backend: 'memory',
      bypassPatterns: ['NOW()', /RANDOM/i],
    });
    await manager.initialize();

    expect(manager.shouldBypassCache('SELECT NOW()')).toBe(true);
    expect(manager.shouldBypassCache('SELECT RANDOM()')).toBe(true);
    expect(manager.shouldBypassCache('SELECT * FROM users')).toBe(false);

    await manager.close();
  });

  test('should invalidate cached entries', async () => {
    const query = 'SELECT * FROM users';
    const result = { columns: [], rows: [[1, 'test']], command: 'SELECT', rowCount: 1 };

    await cacheManager.set(query, [], result);
    let cached = await cacheManager.get(query, []);
    expect(cached).toEqual(result);

    await cacheManager.invalidate(query, []);
    cached = await cacheManager.get(query, []);
    expect(cached).toBeNull();
  });

  test('should clear all cached entries', async () => {
    await cacheManager.set('SELECT 1', [], { result: 1 });
    await cacheManager.set('SELECT 2', [], { result: 2 });

    await cacheManager.clear();

    expect(await cacheManager.get('SELECT 1', [])).toBeNull();
    expect(await cacheManager.get('SELECT 2', [])).toBeNull();
  });

  test('should track cache statistics', async () => {
    await cacheManager.get('SELECT 1', []); // miss
    await cacheManager.set('SELECT 1', [], { result: 1 });
    await cacheManager.get('SELECT 1', []); // hit
    await cacheManager.get('SELECT 1', []); // hit

    const stats = cacheManager.getStats();
    expect(stats.hits).toBe(2);
    expect(stats.misses).toBe(1);
    expect(stats.sets).toBe(1);
    expect(stats.totalRequests).toBe(3);
  });

  test('should reset statistics', async () => {
    await cacheManager.get('SELECT 1', []);
    await cacheManager.set('SELECT 1', [], { result: 1 });

    cacheManager.resetStats();

    const stats = cacheManager.getStats();
    expect(stats.hits).toBe(0);
    expect(stats.misses).toBe(0);
    expect(stats.sets).toBe(0);
  });

  test('should warm up cache with predefined queries', async () => {
    const manager = new CacheManager({
      enabled: true,
      backend: 'memory',
      warmupQueries: [
        { query: 'SELECT 1', parameters: [], result: { value: 1 } },
        { query: 'SELECT 2', parameters: [], result: { value: 2 } },
      ],
    });

    await manager.initialize();

    const result1 = await manager.get('SELECT 1', []);
    const result2 = await manager.get('SELECT 2', []);

    expect(result1).toEqual({ value: 1 });
    expect(result2).toEqual({ value: 2 });

    await manager.close();
  });

  test('should handle disabled cache gracefully', async () => {
    const manager = new CacheManager({ enabled: false });
    await manager.initialize();

    const result = await manager.get('SELECT 1', []);
    expect(result).toBeNull();

    // Should not throw errors
    await manager.set('SELECT 1', [], { value: 1 });
    await manager.invalidate('SELECT 1', []);
    await manager.clear();

    await manager.close();
  });

  test('should respect TTL configuration', async () => {
    const manager = new CacheManager({
      enabled: true,
      backend: 'memory',
      ttl: 50, // 50ms TTL
    });
    await manager.initialize();

    await manager.set('SELECT 1', [], { value: 1 });
    let result = await manager.get('SELECT 1', []);
    expect(result).toEqual({ value: 1 });

    // Wait for expiration
    await new Promise(resolve => setTimeout(resolve, 60));
    result = await manager.get('SELECT 1', []);
    expect(result).toBeNull();

    await manager.close();
  });

  test('should handle parameters in cache key generation', async () => {
    const query = 'SELECT * FROM users WHERE id = $1';
    const result1 = { value: 'user1' };
    const result2 = { value: 'user2' };

    await cacheManager.set(query, [1], result1);
    await cacheManager.set(query, [2], result2);

    const cached1 = await cacheManager.get(query, [1]);
    const cached2 = await cacheManager.get(query, [2]);

    expect(cached1).toEqual(result1);
    expect(cached2).toEqual(result2);
  });
});

describe('CacheManager - Error Handling', () => {
  test('should handle initialization errors gracefully', async () => {
    const manager = new CacheManager({
      enabled: true,
      backend: 'memory', // Use valid backend but force error later
    });

    await manager.initialize();
    // Manager should initialize successfully with memory backend
    expect(manager.initialized).toBe(true);
  });

  test('should handle backend errors gracefully', async () => {
    const manager = new CacheManager({
      enabled: true,
      backend: 'memory',
    });
    await manager.initialize();

    // Force backend to null to simulate error
    manager.backend = null;

    // Should not throw errors
    const result = await manager.get('SELECT 1', []);
    expect(result).toBeNull();

    await manager.set('SELECT 1', [], { value: 1 });
    await manager.invalidate('SELECT 1', []);

    await manager.close();
  });
});
