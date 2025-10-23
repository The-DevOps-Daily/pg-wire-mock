const http = require('http');
const { createLogger } = require('../utils/logger');
const {
  generateHealthStatus,
  formatPrometheusMetrics,
  formatStatusResponse,
  formatConnectionsResponse,
} = require('../utils/metricsFormatter');

class HttpServer {
  /**
   * Create a new HTTP server for monitoring
   * @param {Object} config - HTTP server configuration
   * @param {Object} serverManager - Reference to ServerManager instance
   */
  constructor(config, serverManager) {
    this.config = {
      enabled: true,
      port: 8080,
      host: 'localhost',
      enableAuth: false,
      authToken: null,
      ...config,
    };
    this.serverManager = serverManager;
    this.server = null;
    this.isRunning = false;
    this.logger = createLogger('http-server');
    this.authWarningLogged = false;
  }

  /**
   * Starts the HTTP server
   * @returns {Promise<void>}
   */
  async start() {
    if (!this.config.enabled) {
      this.logger.info('HTTP monitoring endpoints disabled');
      return;
    }

    if (this.isRunning) {
      throw new Error('HTTP server is already running');
    }

    return new Promise((resolve, reject) => {
      this.server = http.createServer((req, res) => {
        Promise.resolve(this.handleRequest(req, res)).catch(error => {
          this.logger.error(`Unhandled request error ${error.message}`);
          if (!res.headersSent) {
            this.sendError(res, 500, 'Internal Server Error');
          } else {
            res.end();
          }
        });
      });

      this.server.listen(this.config.port, this.config.host, () => {
        this.isRunning = true;
        this.logger.info(
          `HTTP monitoring server listening on http://${this.config.host}:${this.config.port}`
        );
        resolve();
      });

      this.server.on('error', error => {
        this.isRunning = false;
        reject(error);
      });
    });
  }

  /**
   * Stops the HTTP server
   * @returns {Promise<void>}
   */
  async stop() {
    if (!this.server || !this.isRunning) {
      return;
    }

    return new Promise(resolve => {
      this.server.close(() => {
        this.isRunning = false;
        this.logger.info('HTTP monitoring server stopped');
        resolve();
      });
    });
  }

  /**
   * Main request handler
   * @param {IncomingMessage} req - HTTP request
   * @param {ServerResponse} res - HTTP response
   * @private
   */
  async handleRequest(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    // Handle OPTIONS for CORS preflight
    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    //Only allow GET requests
    if (req.method !== 'GET') {
      this.sendError(res, 405, 'Method Not Allowed');
      return;
    }

    // Check authentication if enabled
    if (this.config.enableAuth && !this.authenticate(req)) {
      this.sendError(res, 401, 'Unauthorized');
      return;
    }

    const url = req.url.split('?')[0];

    try {
      switch (url) {
        case '/health':
          await this.handleHealth(req, res);
          break;
        case '/metrics':
          this.handleMetrics(req, res);
          break;
        case '/status':
          await this.handleStatus(req, res);
          break;
        case '/connections':
          this.handleConnections(req, res);
          break;
        default:
          this.sendError(res, 404, 'Not Found');
      }
    } catch (error) {
      this.logger.error(`Error handling request (${url}): ${error.message}`);
      if (!res.headersSent) {
        this.sendError(res, 500, 'Internal Server Error');
      } else {
        res.end();
      }
    }
  }

  /**
   * Authenticates a request
   * @param {IncomingMessage} req - HTTP request
   * @returns {boolean} True if authenticated
   * @private
   */
  authenticate(req) {
    if (!this.config.enableAuth) {
      return true;
    }

    if (!this.config.authToken) {
      if (!this.authWarningLogged) {
        this.logger.warn(
          'HTTP authentication is enabled but no authToken is configured; rejecting requests'
        );
        this.authWarningLogged = true;
      }
      return false;
    }

    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return false;
    }

    const [type, token] = authHeader.split(' ');
    if (type !== 'Bearer' || token !== this.config.authToken) {
      return false;
    }

    return true;
  }

  /**
   * Handles GET /health endpoint
   * @param {IncomingMessage} req - HTTP request
   * @param {ServerResponse} res - HTTP response
   * @private
   */
  async handleHealth(req, res) {
    const timeoutMs = this.config.healthCheckTimeout || 5000;
    const stats = this.serverManager.getStats();

    const health = await this.withTimeout(
      generateHealthStatus(this.serverManager),
      timeoutMs,
      'Health check time out'
    );

    const statusCode = health.status === 'healthy' ? 200 : 503;

    this.sendJSON(res, statusCode, {
      status: health.status,
      timestamp: health.timestamp,
      uptime: stats.uptime || 0,
      checks: health.checks,
    });
  }

  /**
   * Handles GET /metrics endpoint
   * @param {IncomingMessage} req - HTTP request
   * @param {ServerResponse} res - HTTP response
   * @private
   */
  handleMetrics(req, res) {
    const stats = this.serverManager.getStats();
    const metrics = formatPrometheusMetrics(stats);

    res.writeHead(200, {
      'Content-Type': 'text/plain; version=0.0.4',
    });
    res.end(metrics);
  }

  /**
   * Handles GET /status endpoint
   * @param {IncomingMessage} req - HTTP request
   * @param {ServerResponse} res - HTTP response
   * @private
   */
  async handleStatus(req, res) {
    const timeoutMs = this.config.healthCheckTimeout || 5000;
    const status = await this.withTimeout(
      formatStatusResponse(this.serverManager),
      timeoutMs,
      'Status generation time out'
    );
    this.sendJSON(res, 200, status);
  }

  /**
   * Handles GET /connections endpoint
   * @param {IncomingMessage} req - HTTP request
   * @param {ServerResponse} res - HTTP response
   * @private
   */
  handleConnections(req, res) {
    const connections = formatConnectionsResponse(this.serverManager);
    this.sendJSON(res, 200, connections);
  }

  /**
   * Wraps a promise with a timeout
   * @param {Promise} promise - Promise to wrap
   * @param {number} timeoutMs - Timeout in milliseconds
   * @param {string} timeoutMessage - Message to use when promise times out
   * @returns {Promise<*>} Promise that resolves with the original value or rejects on timeout
   * @private
   */
  withTimeout(promise, timeoutMs, timeoutMessage) {
    const wrappedPromise = Promise.resolve(promise);

    if (!timeoutMs || timeoutMs <= 0) {
      return wrappedPromise;
    }

    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new Error(timeoutMessage));
      }, timeoutMs);

      wrappedPromise
        .then(result => {
          clearTimeout(timeoutId);
          resolve(result);
        })
        .catch(error => {
          clearTimeout(timeoutId);
          reject(error);
        });
    });
  }

  /**
   * Sends a JSON response
   * @param {http.ServerResponse} res - HTTP response
   * @param {number} statusCode - HTTP status code
   * @param {Object} data - Response data
   * @private
   */
  sendJSON(res, statusCode, data) {
    res.writeHead(statusCode, {
      'Content-Type': 'application/json',
    });
    res.end(JSON.stringify(data, null, 2));
  }

  /**
   * Sends an error message
   * @param {ServerResponse} res - HTTP response
   * @param {*} statusCode - HTTP status code
   * @param {*} message - Error message
   * @private
   */
  sendError(res, statusCode, message) {
    this.sendJSON(res, statusCode, {
      error: message,
      statusCode: statusCode,
    });
  }
}

module.exports = { HttpServer };
