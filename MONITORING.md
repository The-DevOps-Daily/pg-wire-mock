# PostgreSQL Wire Mock - Monitoring Guide

This guide covers the comprehensive monitoring and observability features available in pg-wire-mock, including metrics collection, Prometheus integration, and Grafana dashboards.

## Table of Contents

- [Overview](#overview)
- [Quick Start](#quick-start)
- [Configuration](#configuration)
- [Metrics Reference](#metrics-reference)
- [Grafana Dashboard](#grafana-dashboard)
- [Docker Setup](#docker-setup)
- [Troubleshooting](#troubleshooting)
- [Advanced Usage](#advanced-usage)

## Overview

pg-wire-mock includes comprehensive monitoring capabilities that provide detailed insights into:

- **Connection Management**: Pool statistics, lifecycle tracking, and connection health
- **Query Performance**: Latency percentiles, slow query tracking, and query type distribution
- **Protocol Usage**: Message type distribution, extended vs simple protocol usage
- **System Health**: Error rates, throughput, and resource utilization

## Quick Start

### 1. Enable Monitoring

Set the following environment variable to enable metrics collection:

```bash
export PG_MOCK_ENABLE_METRICS=true
export PG_MOCK_METRICS_PORT=9090
```

### 2. Start the Server

```bash
npm start
```

### 3. Access Metrics

- **Prometheus metrics**: `http://localhost:9090/metrics`
- **Health check**: `http://localhost:9090/health`

### 4. Docker Compose Setup

Use the provided development environment with monitoring stack:

```bash
docker-compose -f docker-compose.dev.yml up -d
```

Access the monitoring stack:
- **Grafana Dashboard**: `http://localhost:3000` (admin/admin)
- **Prometheus**: `http://localhost:9090`
- **pg-wire-mock metrics**: `http://localhost:9091/metrics`

## Configuration

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PG_MOCK_ENABLE_METRICS` | `false` | Enable metrics collection and Prometheus export |
| `PG_MOCK_METRICS_PORT` | `9090` | Port for Prometheus metrics endpoint |
| `PG_MOCK_METRICS_HOST` | `0.0.0.0` | Host address for metrics endpoint |
| `PG_MOCK_SLOW_QUERY_THRESHOLD` | `100` | Threshold in milliseconds for slow query tracking |
| `PG_MOCK_METRICS_RETENTION` | `3600000` | Metrics retention period in milliseconds (1 hour) |
| `PG_MOCK_METRICS_UPDATE_INTERVAL` | `5000` | Metrics update interval in milliseconds |

### Example Configuration

```bash
# Enable comprehensive monitoring
export PG_MOCK_ENABLE_METRICS=true
export PG_MOCK_METRICS_PORT=9090
export PG_MOCK_METRICS_HOST=0.0.0.0
export PG_MOCK_SLOW_QUERY_THRESHOLD=50
export PG_MOCK_METRICS_RETENTION=7200000  # 2 hours
export PG_MOCK_METRICS_UPDATE_INTERVAL=2000  # 2 seconds

# Start the server
npm start
```

## Metrics Reference

### Connection Metrics

| Metric | Type | Description |
|--------|------|-------------|
| `pgwire_connections_total` | Counter | Total number of connections created |
| `pgwire_connections_destroyed_total` | Counter | Total number of connections destroyed |
| `pgwire_connections_active` | Gauge | Number of currently active connections |
| `pgwire_connections_idle` | Gauge | Number of currently idle connections |
| `pgwire_connections_peak` | Gauge | Peak number of concurrent connections |
| `pgwire_connection_duration_seconds` | Histogram | Connection lifetime in seconds |
| `pgwire_connection_wait_seconds` | Histogram | Connection wait time in seconds |
| `pgwire_connection_timeouts_total` | Counter | Total number of connection timeouts |
| `pgwire_connection_errors_total` | Counter | Total number of connection errors |

### Query Metrics

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `pgwire_queries_total` | Counter | `query_type`, `status` | Total number of queries executed |
| `pgwire_query_duration_seconds` | Histogram | | Query execution time in seconds |
| `pgwire_slow_queries_total` | Counter | | Total number of slow queries |

Query types include: `select`, `insert`, `update`, `delete`, `show`, `begin`, `commit`, `rollback`, `other`

Status values: `success`, `error`

### Protocol Metrics

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `pgwire_protocol_messages_total` | Counter | `message_type` | Total number of protocol messages processed |
| `pgwire_protocol_extended_usage_total` | Counter | | Total usage of extended protocol |
| `pgwire_protocol_simple_usage_total` | Counter | | Total usage of simple protocol |
| `pgwire_prepared_statements_total` | Counter | `result` | Total prepared statement operations |

Message types include: `query`, `parse`, `bind`, `execute`, `sync`, `terminate`

### Data Transfer Metrics

| Metric | Type | Description |
|--------|------|-------------|
| `pgwire_bytes_received_total` | Counter | Total bytes received from clients |
| `pgwire_bytes_sent_total` | Counter | Total bytes sent to clients |

## Grafana Dashboard

### Dashboard Features

The included Grafana dashboard (`grafana/dashboards/pg-wire-mock-dashboard.json`) provides:

1. **Connection Pool Overview** - Active, idle, and peak connections
2. **Query Latency Percentiles** - p50, p90, p95, p99 latency tracking
3. **Queries Per Second (QPS)** - Request rate by query type
4. **Query Type Distribution** - Pie chart of query types
5. **Connection Lifecycle** - Connection creation/destruction rates
6. **Error Rate** - Query errors, connection errors, and timeouts
7. **Protocol Message Distribution** - Message types over time
8. **Slow Queries** - Table of slow query statistics
9. **Data Transfer** - Bytes sent/received rates
10. **Extended vs Simple Protocol** - Protocol usage comparison

### Dashboard Import

1. Open Grafana at `http://localhost:3000`
2. Login with `admin/admin`
3. Go to **Dashboards** → **Import**
4. Upload `grafana/dashboards/pg-wire-mock-dashboard.json`
5. Configure the Prometheus datasource (usually auto-configured)

## Docker Setup

### Development Environment

The `docker-compose.dev.yml` includes a complete monitoring stack:

```yaml
services:
  pg-wire-mock:
    environment:
      - PG_MOCK_ENABLE_METRICS=true
      - PG_MOCK_METRICS_PORT=9091
    ports:
      - "5432:5432"
      - "9091:9091"

  prometheus:
    image: prom/prometheus:v2.48.0
    ports:
      - "9090:9090"

  grafana:
    image: grafana/grafana:latest
    ports:
      - "3000:3000"
```

### Starting the Stack

```bash
# Start the complete monitoring stack
docker-compose -f docker-compose.dev.yml up -d

# View logs
docker-compose -f docker-compose.dev.yml logs -f pg-wire-mock

# Stop the stack
docker-compose -f docker-compose.dev.yml down
```

## Troubleshooting

### Common Issues

#### 1. Metrics Endpoint Not Available

**Problem**: Cannot access `http://localhost:9090/metrics`

**Solutions**:
- Verify `PG_MOCK_ENABLE_METRICS=true` is set
- Check that `PG_MOCK_METRICS_PORT` is not conflicting with other services
- Ensure firewall allows connections to the metrics port

#### 2. No Data in Grafana

**Problem**: Dashboard panels show "No data"

**Solutions**:
- Verify Prometheus is scraping pg-wire-mock metrics
- Check Prometheus targets at `http://localhost:9090/targets`
- Ensure pg-wire-mock is generating traffic (run some queries)
- Verify time range in Grafana matches data availability

#### 3. High Memory Usage

**Problem**: Server uses excessive memory with metrics enabled

**Solutions**:
- Reduce `PG_MOCK_METRICS_RETENTION` value
- Decrease histogram size in configuration
- Monitor for memory leaks in long-running instances

#### 4. Slow Query Threshold Not Working

**Problem**: Expected slow queries not being tracked

**Solutions**:
- Verify `PG_MOCK_SLOW_QUERY_THRESHOLD` is set appropriately
- Check that queries are actually taking longer than the threshold
- Review slow query data in detailed stats: `GET /api/stats/detailed`

### Debug Mode

Enable debug logging for monitoring components:

```bash
export PG_MOCK_LOG_LEVEL=debug
export PG_MOCK_ENABLE_LOGGING=true
npm start
```

### Health Check

Monitor server health with the built-in health endpoint:

```bash
curl http://localhost:9090/health
```

Expected response:
```json
{
  "status": "healthy",
  "lastUpdate": 1696435200000,
  "timestamp": 1696435205000
}
```

## Advanced Usage

### Custom Prometheus Configuration

Create custom scraping configurations for different environments:

```yaml
# prometheus-custom.yml
global:
  scrape_interval: 10s
  evaluation_interval: 10s

scrape_configs:
  - job_name: 'pg-wire-mock-production'
    static_configs:
      - targets: ['pg-wire-mock:9091']
    scrape_interval: 5s
    metrics_path: /metrics
    params:
      collect_slow_queries: ['true']
```

### Metrics API

Access detailed metrics programmatically:

```bash
# Get basic server stats
curl http://localhost:5432/api/stats

# Get detailed monitoring stats (if metrics enabled)
curl http://localhost:5432/api/stats/detailed

# Get connection details
curl http://localhost:5432/api/connections
```

### Integration with External Monitoring

#### Datadog Integration

```bash
# Configure Datadog agent to scrape Prometheus metrics
# datadog.yaml
prometheus_check:
  instances:
    - prometheus_url: http://pg-wire-mock:9091/metrics
      namespace: "pgwire"
      metrics:
        - pgwire_*
```

#### New Relic Integration

```bash
# Configure New Relic Infrastructure agent
# newrelic-infra.yml
integrations:
  - name: nri-prometheus
    config:
      targets:
        - description: pg-wire-mock
          urls: ["http://pg-wire-mock:9091/metrics"]
```

### Performance Impact

Monitoring overhead is minimal when properly configured:

- **CPU Impact**: < 2% with default settings
- **Memory Impact**: ~10-50MB depending on retention settings
- **Network Impact**: ~1KB/second for metrics export

Optimize performance by:
- Adjusting `PG_MOCK_METRICS_UPDATE_INTERVAL` for less frequent updates
- Reducing `PG_MOCK_METRICS_RETENTION` for lower memory usage
- Disabling metrics in production if not needed

### Alerting Rules

Example Prometheus alerting rules:

```yaml
# alerts.yml
groups:
  - name: pg-wire-mock
    rules:
      - alert: HighConnectionUsage
        expr: pgwire_connections_active / pgwire_connections_peak > 0.8
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "High connection usage on pg-wire-mock"

      - alert: SlowQueriesIncreasing
        expr: rate(pgwire_slow_queries_total[5m]) > 0.1
        for: 2m
        labels:
          severity: warning
        annotations:
          summary: "Slow queries increasing on pg-wire-mock"

      - alert: HighErrorRate
        expr: rate(pgwire_queries_total{status="error"}[5m]) > 0.05
        for: 1m
        labels:
          severity: critical
        annotations:
          summary: "High error rate detected on pg-wire-mock"
```

## Contributing

When contributing monitoring features:

1. **Add metrics** to appropriate components (StatsCollector)
2. **Update Prometheus exporter** to expose new metrics
3. **Test metrics** with unit tests
4. **Update documentation** to reflect new metrics
5. **Add dashboard panels** if visualization would be helpful

See the test suite in `__tests__/monitoring/` for examples of testing monitoring components.

---

For additional help, see the main README.md or open an issue on GitHub.