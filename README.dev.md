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
