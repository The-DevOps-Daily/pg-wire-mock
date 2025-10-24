/**
 * Query Cache Manager
 * Provides configurable caching layer for query results with multiple backend support
 */

const crypto = require('crypto');
const { createQueryLogger } = require('../utils/logger');

// Create cache logger instance
let cacheLogger = createQueryLogger();

/**
 * Configures the cache logger
 * @param {Object} config - Logger configuration
 */
function configureCacheLogger(config) {
  cacheLogger = createQueryLogger(config);
}

/**
 * Cache statistics tracker
 */
class CacheStats {
  constructor() {
    this.hits = 0;
    this.misses = 0;
    this.sets = 0;
    this.invalidations = 0;
    this.errors = 0;
    this.startTime = Date.now();
  }

  recordHit() {
    this.hits++;
  }

  recordMiss() {
    this.misses++;
  }

  recordSet() {
    this.sets++;
  }

  recordInvalidation() {
    this.invalidations++;
  }

  recordError() {
    this.errors++;
  }

  getStats() {
    const uptime = Date.now() - this.startTime;
    const totalRequests = this.hits + this.misses;
    const hitRate = totalRequests > 0 ? (this.hits / totalRequests) * 100 : 0;

    return {
      hits: this.hits,
      misses: this.misses,
      sets: this.sets,
      invalidations: this.invalidations,
      errors: this.errors,
      totalRequests,
      hitRate: hitRate.toFixed(2) + '%',
      uptimeMs: uptime,
    };
  }

  reset() {
    this.hits = 0;
    this.misses = 0;
    this.sets = 0;
    this.invalidations = 0;
    this.errors = 0;
    this.startTime = Date.now();
  }
}

/**
 * In-Memory Cache Backend
 */
class MemoryCacheBackend {
  constructor(options = {}) {
    this.cache = new Map();
    this.maxSize = options.maxSize || 1000;
    this.cleanupInterval = options.cleanupInterval || 60000; // 1 minute
    this.startCleanupTimer();
  }

  startCleanupTimer() {
    this.cleanupTimer = setInterval(() => {
      this.cleanup();
    }, this.cleanupInterval);

    // Don't prevent process exit
    if (this.cleanupTimer.unref) {
      this.cleanupTimer.unref();
    }
  }

  async get(key) {
    const entry = this.cache.get(key);
    if (!entry) {
      return null;
    }

    // Check if expired
    if (entry.expiresAt && Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return null;
    }

    return entry.value;
  }

  async set(key, value, ttlMs) {
    // Enforce max size with LRU eviction
    if (this.cache.size >= this.maxSize && !this.cache.has(key)) {
      // Remove oldest entry
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
    }

    const entry = {
      value,
      expiresAt: ttlMs ? Date.now() + ttlMs : null,
      createdAt: Date.now(),
    };

    this.cache.set(key, entry);
  }

  async delete(key) {
    return this.cache.delete(key);
  }

  async clear() {
    this.cache.clear();
  }

  async size() {
    return this.cache.size;
  }

  cleanup() {
    const now = Date.now();
    let removed = 0;

    for (const [key, entry] of this.cache.entries()) {
      if (entry.expiresAt && now > entry.expiresAt) {
        this.cache.delete(key);
        removed++;
      }
    }

    if (removed > 0) {
      cacheLogger.debug(`Cleaned up ${removed} expired cache entries`);
    }
  }

  async close() {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
    }
    this.cache.clear();
  }
}

/**
 * Redis Cache Backend (optional)
 * Requires redis package to be installed
 */
class RedisCacheBackend {
  constructor(options = {}) {
    this.options = options;
    this.client = null;
    this.connected = false;
  }

  async connect() {
    try {
      // Dynamically require redis (optional dependency)
      const redis = require('redis');

      this.client = redis.createClient({
        url: this.options.url || 'redis://localhost:6379',
        socket: {
          connectTimeout: this.options.connectTimeout || 5000,
        },
      });

      this.client.on('error', err => {
        cacheLogger.error('Redis client error:', err);
        this.connected = false;
      });

      this.client.on('connect', () => {
        cacheLogger.info('Redis cache backend connected');
        this.connected = true;
      });

      await this.client.connect();
      return true;
    } catch (error) {
      cacheLogger.warn('Redis not available, falling back to memory cache:', error.message);
      return false;
    }
  }

  async get(key) {
    if (!this.connected || !this.client) {
      return null;
    }

    try {
      const value = await this.client.get(key);
      return value ? JSON.parse(value) : null;
    } catch (error) {
      cacheLogger.error('Redis get error:', error);
      return null;
    }
  }

  async set(key, value, ttlMs) {
    if (!this.connected || !this.client) {
      return;
    }

    try {
      const serialized = JSON.stringify(value);
      if (ttlMs) {
        await this.client.setEx(key, Math.ceil(ttlMs / 1000), serialized);
      } else {
        await this.client.set(key, serialized);
      }
    } catch (error) {
      cacheLogger.error('Redis set error:', error);
    }
  }

  async delete(key) {
    if (!this.connected || !this.client) {
      return false;
    }

    try {
      const result = await this.client.del(key);
      return result > 0;
    } catch (error) {
      cacheLogger.error('Redis delete error:', error);
      return false;
    }
  }

  async clear() {
    if (!this.connected || !this.client) {
      return;
    }

    try {
      await this.client.flushDb();
    } catch (error) {
      cacheLogger.error('Redis clear error:', error);
    }
  }

  async size() {
    if (!this.connected || !this.client) {
      return 0;
    }

    try {
      return await this.client.dbSize();
    } catch (error) {
      cacheLogger.error('Redis size error:', error);
      return 0;
    }
  }

  async close() {
    if (this.client) {
      try {
        await this.client.quit();
      } catch (error) {
        cacheLogger.error('Redis close error:', error);
      }
    }
  }
}

/**
 * Query Cache Manager
 * Main cache interface with pluggable backends
 */
class CacheManager {
  constructor(config = {}) {
    this.config = {
      enabled: config.enabled !== false,
      backend: config.backend || 'memory',
      ttl: config.ttl || 300000, // 5 minutes default
      maxSize: config.maxSize || 1000,
      keyPrefix: config.keyPrefix || 'pgmock:',
      warmupQueries: config.warmupQueries || [],
      bypassPatterns: config.bypassPatterns || [],
      ...config,
    };

    this.stats = new CacheStats();
    this.backend = null;
    this.initialized = false;
  }

  /**
   * Initialize the cache backend
   */
  async initialize() {
    if (this.initialized) {
      return;
    }

    if (!this.config.enabled) {
      cacheLogger.info('Query cache is disabled');
      return;
    }

    try {
      if (this.config.backend === 'redis') {
        this.backend = new RedisCacheBackend(this.config.redis || {});
        const connected = await this.backend.connect();

        if (!connected) {
          // Fallback to memory cache
          cacheLogger.warn('Falling back to memory cache backend');
          this.backend = new MemoryCacheBackend({
            maxSize: this.config.maxSize,
            cleanupInterval: this.config.cleanupInterval,
          });
        }
      } else {
        this.backend = new MemoryCacheBackend({
          maxSize: this.config.maxSize,
          cleanupInterval: this.config.cleanupInterval,
        });
      }

      this.initialized = true;
      cacheLogger.info(`Query cache initialized with ${this.config.backend} backend`);

      // Warm up cache if configured
      if (this.config.warmupQueries.length > 0) {
        await this.warmupCache();
      }
    } catch (error) {
      cacheLogger.error('Failed to initialize cache:', error);
      this.config.enabled = false;
    }
  }

  /**
   * Generate cache key from query and parameters
   */
  generateKey(query, parameters = []) {
    const normalizedQuery = query.trim().replace(/\s+/g, ' ');
    const keyData = {
      query: normalizedQuery,
      params: parameters,
    };

    const hash = crypto.createHash('sha256').update(JSON.stringify(keyData)).digest('hex');
    return `${this.config.keyPrefix}${hash}`;
  }

  /**
   * Check if query should bypass cache
   */
  shouldBypassCache(query) {
    if (!this.config.enabled || !this.initialized) {
      return true;
    }

    const normalizedQuery = query.trim().toUpperCase();

    // Always bypass transaction control and write operations
    const alwaysBypass = [
      'BEGIN',
      'COMMIT',
      'ROLLBACK',
      'INSERT',
      'UPDATE',
      'DELETE',
      'CREATE',
      'DROP',
      'ALTER',
      'TRUNCATE',
      'LISTEN',
      'UNLISTEN',
      'NOTIFY',
      'COPY',
    ];

    for (const keyword of alwaysBypass) {
      if (normalizedQuery.startsWith(keyword)) {
        return true;
      }
    }

    // Check custom bypass patterns
    for (const pattern of this.config.bypassPatterns) {
      if (typeof pattern === 'string' && normalizedQuery.includes(pattern.toUpperCase())) {
        return true;
      }
      if (pattern instanceof RegExp && pattern.test(query)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Get cached query result
   */
  async get(query, parameters = []) {
    if (this.shouldBypassCache(query)) {
      return null;
    }

    try {
      const key = this.generateKey(query, parameters);
      const cached = await this.backend.get(key);

      if (cached) {
        this.stats.recordHit();
        cacheLogger.debug(`Cache hit for query: ${query.substring(0, 50)}...`);
        return cached;
      }

      this.stats.recordMiss();
      cacheLogger.debug(`Cache miss for query: ${query.substring(0, 50)}...`);
      return null;
    } catch (error) {
      this.stats.recordError();
      cacheLogger.error('Cache get error:', error);
      return null;
    }
  }

  /**
   * Store query result in cache
   */
  async set(query, parameters = [], result, ttl = null) {
    if (this.shouldBypassCache(query)) {
      return;
    }

    try {
      const key = this.generateKey(query, parameters);
      const cacheTtl = ttl || this.config.ttl;

      await this.backend.set(key, result, cacheTtl);
      this.stats.recordSet();
      cacheLogger.debug(`Cached result for query: ${query.substring(0, 50)}...`);
    } catch (error) {
      this.stats.recordError();
      cacheLogger.error('Cache set error:', error);
    }
  }

  /**
   * Invalidate specific query from cache
   */
  async invalidate(query, parameters = []) {
    try {
      const key = this.generateKey(query, parameters);
      await this.backend.delete(key);
      this.stats.recordInvalidation();
      cacheLogger.debug(`Invalidated cache for query: ${query.substring(0, 50)}...`);
    } catch (error) {
      this.stats.recordError();
      cacheLogger.error('Cache invalidate error:', error);
    }
  }

  /**
   * Clear all cached queries
   */
  async clear() {
    try {
      await this.backend.clear();
      cacheLogger.info('Cache cleared');
    } catch (error) {
      this.stats.recordError();
      cacheLogger.error('Cache clear error:', error);
    }
  }

  /**
   * Get cache statistics
   */
  getStats() {
    return {
      ...this.stats.getStats(),
      enabled: this.config.enabled,
      backend: this.config.backend,
      size: this.backend ? this.backend.size() : 0,
    };
  }

  /**
   * Reset cache statistics
   */
  resetStats() {
    this.stats.reset();
  }

  /**
   * Warm up cache with predefined queries
   */
  async warmupCache() {
    if (!this.config.warmupQueries || this.config.warmupQueries.length === 0) {
      return;
    }

    cacheLogger.info(`Warming up cache with ${this.config.warmupQueries.length} queries`);

    for (const warmupConfig of this.config.warmupQueries) {
      try {
        const { query, parameters = [], result } = warmupConfig;
        await this.set(query, parameters, result);
      } catch (error) {
        cacheLogger.error('Cache warmup error:', error);
      }
    }

    cacheLogger.info('Cache warmup completed');
  }

  /**
   * Close cache backend and cleanup
   */
  async close() {
    if (this.backend) {
      await this.backend.close();
    }
    this.initialized = false;
  }
}

module.exports = {
  CacheManager,
  CacheStats,
  MemoryCacheBackend,
  RedisCacheBackend,
  configureCacheLogger,
};
