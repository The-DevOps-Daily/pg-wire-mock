# HTTP Monitoring Guide

The `pg-wire-mock` HTTP monitoring server exposes operational endpoints that make it easier to integrate the mock server with container orchestrators, load balancers, and observability stacks.

## Endpoints

| Path | Description | Success Code | Content-Type |
| --- | --- | --- | --- |
| `GET /health` | Aggregated health result with individual checks | `200` or `503` | `application/json` |
| `GET /status` | Detailed configuration, statistics, and health data | `200` | `application/json` |
| `GET /connections` | Active connection list and metadata | `200` | `application/json` |
| `GET /metrics` | Prometheus exposition metrics | `200` | `text/plain; version=0.0.4` |

All endpoints support CORS (`Access-Control-Allow-Origin: *`) and answer `OPTIONS` preflight requests with a `204` status.

## Configuration

Enable the HTTP server via environment variables or configuration files:

| Variable | Description | Default |
| --- | --- | --- |
| `PG_MOCK_HTTP_ENABLED` | Enable/disable the HTTP server | `true` |
| `PG_MOCK_HTTP_PORT` | Port for the HTTP listener | `8080` |
| `PG_MOCK_HTTP_HOST` | Bind address | `localhost` |
| `PG_MOCK_HTTP_ENABLE_AUTH` | Require `Authorization: Bearer <token>` header | `false` |
| `PG_MOCK_HTTP_AUTH_TOKEN` | Token used for bearer authentication | `null` |
| `PG_MOCK_HTTP_HEALTHCHECK_TIMEOUT` | Timeout (ms) for health/status generation | `5000` |

Example configuration:

```bash
export PG_MOCK_HTTP_ENABLED=true
export PG_MOCK_HTTP_PORT=8081
export PG_MOCK_HTTP_ENABLE_AUTH=true
export PG_MOCK_HTTP_AUTH_TOKEN="super-secret-token"
export PG_MOCK_HTTP_HEALTHCHECK_TIMEOUT=7000
npm start
```

If authentication is enabled but no token is supplied, all requests will be rejected with `401 Unauthorized` and a warning will be logged.

## Sample Responses

### `/health`

```json
{
  "status": "healthy",
  "timestamp": "2024-10-02T12:34:56.789Z",
  "uptime": 123456,
  "checks": [
    { "name": "server_running", "status": "pass", "message": "Server is running" },
    { "name": "not_shutting_down", "status": "pass", "message": "Server is accepting connections" },
    { "name": "accepting_connections", "status": "pass", "message": "Accepting connections (5/100)" }
  ]
}
```

### `/status`

```json
{
  "server": {
    "status": "running",
    "version": "1.1.0",
    "uptime": 123456,
    "uptimeFormatted": "2m 3s",
    "startedAt": "2024-10-02T12:32:53.123Z",
    "isShuttingDown": false,
    "address": { "address": "127.0.0.1", "family": "IPv4", "port": 5432 }
  },
  "statistics": {
    "connectionsAccepted": 42,
    "connectionsRejected": 1,
    "activeConnections": 5,
    "messagesProcessed": 500,
    "queriesExecuted": 120,
    "errors": 0,
    "bytesReceived": 10240,
    "bytesSent": 20480
  },
  "configuration": {
    "port": 5432,
    "host": "localhost",
    "maxConnections": 100,
    "enableConnectionPooling": true,
    "authMethod": "trust",
    "logLevel": "info"
  },
  "connectionPool": null,
  "health": { "...": "See /health payload" }
}
```

## Custom Health Checks

Custom health checks allow you to plug additional readiness logic into `/health` and `/status`. Provide an array of descriptors in `config.http.customHealthChecks` when constructing the `ServerManager`:

```js
const config = loadConfigWithValidation().config;

config.http.customHealthChecks = [
  {
    name: 'redis_ready',
    timeout: 2000,
    check: async serverManager => {
      const reachable = await pingRedis();
      return {
        passed: reachable,
        message: reachable ? 'Redis reachable' : 'Redis timeout',
      };
    },
  },
];
```

Each object supports:

- `name` (string): Identifier included in the JSON payloads.
- `timeout` (optional number): Overrides the global HTTP timeout for this check.
- `check` (function): Receives the `ServerManager` and must return `{ passed: boolean, message?: string }`. Throwing or timing out marks the check as failed.

All checks run sequentially. Failures mark the overall status as `unhealthy`, while warnings (e.g., max connections reached) keep the status but still surface in the response.

## Prometheus Integration

`/metrics` exposes the following metric families (not exhaustive):

- `pg_mock_connections_accepted_total`
- `pg_mock_connections_rejected_total`
- `pg_mock_queries_executed_total`
- `pg_mock_messages_processed_total`
- `pg_mock_errors_total`
- `pg_mock_bytes_received_total`
- `pg_mock_bytes_sent_total`
- `pg_mock_active_connections`
- `pg_mock_uptime_seconds`
- `pg_mock_pool_*` gauges when pooling is enabled

Configure Prometheus with:

```yaml
scrape_configs:
  - job_name: 'pg-wire-mock'
    static_configs:
      - targets: ['localhost:8080']
    metrics_path: /metrics
    scheme: http
    authorization:
      credentials: super-secret-token
```

> **Tip:** Add the same job to `prometheus.yml` used by the `docker-compose.dev.yml` stack to visualize metrics in Grafana during development.

