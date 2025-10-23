# Development Environment Setup

This setup provides a stable development environment for `pg-wire-mock` with monitoring tools (Prometheus & Grafana) and a PostgreSQL client. It works reliably on Windows.

## Prerequisites

- Docker >= 24.x
- Docker Compose >= 2.x
- Git (optional, for cloning)

## Services

| Service             | Description                              | Ports |
| ------------------- | ---------------------------------------- | ----- |
| `pg-wire-mock`      | Main application mock server             | 5432  |
| `pg-client`         | PostgreSQL client for testing            | 5433  |
| `postgres_exporter` | Prometheus exporter for Postgres metrics | 9187  |
| `prometheus`        | Prometheus monitoring                    | 9090  |
| `grafana`           | Grafana dashboard                        | 3000  |

## Start Development Environment

```bash
docker-compose -f docker-compose.dev.yml up --build
```

## HTTP Monitoring Server

The HTTP monitoring server exposes health, status, connection, and Prometheus metrics endpoints for local debugging. It is disabled by default in the development stack; enable it via environment variables before starting the server.

| Variable | Description | Default |
| --- | --- | --- |
| `PG_MOCK_HTTP_ENABLED` | Toggle the HTTP server | `true` |
| `PG_MOCK_HTTP_PORT` | HTTP listener port | `8080` |
| `PG_MOCK_HTTP_HOST` | Bind address | `localhost` |
| `PG_MOCK_HTTP_ENABLE_AUTH` | Require Bearer token auth | `false` |
| `PG_MOCK_HTTP_AUTH_TOKEN` | Token value checked against `Authorization: Bearer <token>` | `null` |
| `PG_MOCK_HTTP_HEALTHCHECK_TIMEOUT` | Timeout (ms) for health/status generation | `5000` |

Example:

```bash
export PG_MOCK_HTTP_ENABLED=true
export PG_MOCK_HTTP_PORT=8081
export PG_MOCK_HTTP_ENABLE_AUTH=true
export PG_MOCK_HTTP_AUTH_TOKEN="dev-token"
docker-compose -f docker-compose.dev.yml up --build
```

Once running, the endpoints are available at `http://<host>:<port>/(health|status|connections|metrics)`.

### Custom Health Checks

When embedding `pg-wire-mock` in another Node.js process, you can register custom health checks that run alongside the built-in checks. Each check receives the `ServerManager` instance and must return `{ passed: boolean, message?: string }`. Optionally, provide a `timeout` (ms) to override the global HTTP timeout.

```js
const { ServerManager } = require('./src/server/serverManager');
const config = loadConfigWithValidation().config;

config.http.customHealthChecks = [
  {
    name: 'cache_ready',
    timeout: 2000,
    check: async serverManager => {
      const cacheHealthy = await pingCache();
      return {
        passed: cacheHealthy,
        message: cacheHealthy ? 'Cache reachable' : 'Cache unavailable',
      };
    },
  },
];

const server = new ServerManager(config);
server.start();
```

### Prometheus & Grafana Integration

Point Prometheus at `http://localhost:8080/metrics` (adjust host/port as needed) to collect server metrics. Grafana dashboards can then visualize connection rates, bytes sent/received, and error counters emitted by the mock server. The development Docker stack can be extended with an additional scrape job targeting `pg-wire-mock` for end-to-end validation.
