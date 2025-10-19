# Docker Development Environment

This directory contains the complete Docker-based development environment for pg-wire-mock. The setup includes multiple services for testing, monitoring, and database management.

## What This Setup Provides

This Docker environment includes:

- **pg-wire-mock**: The main application server with hot reload for development
- **PostgreSQL**: A real PostgreSQL 16 instance for comparison testing with sample data
- **pgAdmin**: Web-based database management interface
- **Prometheus**: Metrics collection and monitoring
- **Grafana**: Visualization dashboards with pre-configured datasources
- **Redis**: Caching layer for experiments
- **Redis Commander**: Web UI for Redis management

## Quick Start

### Prerequisites

- Docker and Docker Compose installed
- Ports available: 5432, 5433, 5050, 3000, 6379, 8081, 9091, 9229

### Starting the Environment

1. Navigate to the project root directory:

```bash
cd /path/to/pg-wire-mock
```

2. Start all services:

```bash
docker-compose -f docker-compose.dev.yml up -d
```

3. Verify all services are running:

```bash
docker ps
```

All 7 containers should show as "Up" or "healthy".

## Testing the Services

### 1. Test pg-wire-mock Server

Check the server logs:

```bash
docker logs pg-wire-mock-dev
```

You should see:

- "PostgreSQL Wire Protocol Mock Server started"
- "Listening on localhost:5432"
- "Server is ready to accept connections"

### 2. Test PostgreSQL Database

Connect to the database and query sample data:

```bash
PGPASSWORD=postgres psql -h localhost -p 5433 -U postgres -d testdb -c "SELECT * FROM users;"
```

Expected output: 3 users (Alice, Bob, Charlie)

Verify database version:

```bash
PGPASSWORD=postgres psql -h localhost -p 5433 -U postgres -d testdb -c "SELECT version();"
```

### 3. Test Redis

Ping Redis:

```bash
docker exec redis-dev redis-cli ping
```

Expected output: `PONG`

Set and get a test value:

```bash
docker exec redis-dev redis-cli SET test_key "Hello"
docker exec redis-dev redis-cli GET test_key
```

Expected output: `Hello`

### 4. Test Prometheus

Check Prometheus is responding:

```bash
curl -s http://localhost:9091/api/v1/status/config | head -c 100
```

View configured targets:

```bash
curl -s http://localhost:9091/api/v1/targets | jq '.data.activeTargets[] | {job: .labels.job, health: .health}'
```

Access Prometheus web UI: http://localhost:9091

### 5. Test Grafana

Check Grafana health:

```bash
curl -s http://localhost:3000/api/health
```

Expected output: `{"database":"ok","version":"..."}`

List configured datasources:

```bash
curl -s -u admin:admin http://localhost:3000/api/datasources | jq -r '.[] | "\(.name): \(.type)"'
```

Expected output:

- PostgreSQL: grafana-postgresql-datasource
- Prometheus: prometheus
- Redis: redis-datasource

Access Grafana web UI: http://localhost:3000 (admin/admin)

### 6. Test pgAdmin

Check pgAdmin is responding:

```bash
curl -sL http://localhost:5050/misc/ping
```

Expected output: `PING`

Access pgAdmin web UI: http://localhost:5050 (admin@example.com/admin)

The interface will have two pre-configured servers:

- pg-wire-mock (Development)
- PostgreSQL Real (Comparison)

### 7. Test Redis Commander

Check Redis Commander web interface:

```bash
curl -s http://localhost:8081 | grep -o '<title>.*</title>'
```

Expected output: `<title>Redis Commander: Home</title>`

Access Redis Commander web UI: http://localhost:8081

## Configuration Files

### Core Configuration

- `docker-compose.dev.yml`: Main orchestration file defining all services
- `.env.example`: Template for environment variables (copy to `.env` if needed)

### Service-Specific Configuration

- `init-scripts/01-init.sql`: PostgreSQL initialization script (creates sample tables and data)
- `pgadmin-servers.json`: Pre-configured pgAdmin server connections
- `prometheus.yml`: Prometheus scrape configuration
- `grafana-datasources.yml`: Grafana datasource provisioning
- `grafana-dashboards.yml`: Grafana dashboard provisioning
- `dashboards/overview.json`: Main monitoring dashboard

## Port Mappings

| Service               | Internal Port | Host Port | Purpose                  |
| --------------------- | ------------- | --------- | ------------------------ |
| pg-wire-mock          | 5432          | 5432      | PostgreSQL wire protocol |
| pg-wire-mock debugger | 9229          | 9229      | Node.js debugger         |
| PostgreSQL            | 5432          | 5433      | Real PostgreSQL instance |
| pgAdmin               | 80            | 5050      | Database management UI   |
| Prometheus            | 9090          | 9091      | Metrics and monitoring   |
| Grafana               | 3000          | 3000      | Visualization dashboards |
| Redis                 | 6379          | 6379      | Cache and data store     |
| Redis Commander       | 8081          | 8081      | Redis management UI      |

## Service Credentials

| Service    | Username/Email    | Password |
| ---------- | ----------------- | -------- |
| PostgreSQL | postgres          | postgres |
| pgAdmin    | admin@example.com | admin    |
| Grafana    | admin             | admin    |

## Volumes and Data Persistence

The following named volumes are created for data persistence:

- `pg-mock-node-modules`: Node.js dependencies
- `pg-mock-postgres-data`: PostgreSQL database files
- `pg-mock-pgadmin-data`: pgAdmin configuration and saved connections
- `pg-mock-prometheus-data`: Prometheus time-series data
- `pg-mock-grafana-data`: Grafana dashboards and settings
- `pg-mock-redis-data`: Redis persistence files

## Development Workflow

### Hot Reload

The pg-wire-mock service has hot reload enabled. Changes to files in the `src/` directory will automatically restart the server without rebuilding the container.

Edit code:

```bash
# Edit files in src/
vim src/handlers/queryHandlers.js
```

Check logs to see the restart:

```bash
docker logs -f pg-wire-mock-dev
```

### Debugging

The Node.js debugger is exposed on port 9229. You can attach your IDE debugger to `localhost:9229`.

Example for VS Code (`.vscode/launch.json`):

```json
{
  "type": "node",
  "request": "attach",
  "name": "Docker: Attach to Node",
  "port": 9229,
  "address": "localhost",
  "localRoot": "${workspaceFolder}",
  "remoteRoot": "/app",
  "protocol": "inspector"
}
```

## Common Operations

### View Logs

View logs for a specific service:

```bash
docker logs -f pg-wire-mock-dev
docker logs -f postgres-real
docker logs -f grafana-dev
```

View logs for all services:

```bash
docker-compose -f docker-compose.dev.yml logs -f
```

### Restart a Service

Restart a specific service:

```bash
docker-compose -f docker-compose.dev.yml restart pg-wire-mock
```

### Rebuild After Configuration Changes

If you modify Dockerfile or docker-compose.dev.yml:

```bash
docker-compose -f docker-compose.dev.yml down
docker-compose -f docker-compose.dev.yml up -d --build
```

### Stop All Services

Stop and remove containers (keeps volumes):

```bash
docker-compose -f docker-compose.dev.yml down
```

Stop and remove everything including volumes:

```bash
docker-compose -f docker-compose.dev.yml down -v
```

### Clean Restart

Remove all containers, volumes, and rebuild:

```bash
docker-compose -f docker-compose.dev.yml down -v
docker-compose -f docker-compose.dev.yml up -d --build
```

## Troubleshooting

### Port Already in Use

If you see "port is already allocated" errors:

1. Check what's using the port:

```bash
lsof -i :5432  # or whatever port is conflicting
```

2. Stop the conflicting service or change the port mapping in `docker-compose.dev.yml`

### Services Not Starting

Check service health:

```bash
docker ps -a
docker-compose -f docker-compose.dev.yml ps
```

View specific service logs:

```bash
docker logs pg-wire-mock-dev
```

### Cannot Connect to PostgreSQL

Ensure the service is healthy:

```bash
docker exec postgres-real pg_isready -U postgres
```

Test from inside the container:

```bash
docker exec -it postgres-real psql -U postgres -d testdb -c "SELECT 1;"
```

### Grafana Dashboards Not Showing

Check if provisioning files are mounted correctly:

```bash
docker exec grafana-dev ls -la /etc/grafana/provisioning/datasources/
docker exec grafana-dev ls -la /etc/grafana/provisioning/dashboards/
```

Restart Grafana:

```bash
docker-compose -f docker-compose.dev.yml restart grafana
```

### Hot Reload Not Working

Ensure the source directory is properly mounted:

```bash
docker exec pg-wire-mock-dev ls -la /app/src
```

Check that the container is running with `npm run dev`:

```bash
docker exec pg-wire-mock-dev ps aux | grep node
```

## Network Details

All services are connected via a bridge network named `pg-mock-dev-network`. Services can communicate with each other using their container names:

- `pg-wire-mock-dev` → access at `pg-wire-mock-dev:5432`
- `postgres-real` → access at `postgres-real:5432`
- `redis-dev` → access at `redis-dev:6379`
- `prometheus-dev` → access at `prometheus-dev:9090`
- `grafana-dev` → access at `grafana-dev:3000`

Example: Grafana connects to Prometheus using `http://prometheus-dev:9090`

## Next Steps

After verifying all services are running:

1. Access pgAdmin at http://localhost:5050 and explore both PostgreSQL instances
2. Open Grafana at http://localhost:3000 and check the pre-configured dashboards
3. Use Redis Commander at http://localhost:8081 to inspect Redis data
4. Start developing your pg-wire-mock features with hot reload enabled
5. Test your changes against the real PostgreSQL instance for comparison

## Files Added in This PR

- `docker-compose.dev.yml` - Complete 7-service development environment
- `.env.example` - Environment variable template with documentation
- `docker/init-scripts/01-init.sql` - PostgreSQL sample data initialization
- `docker/pgadmin-servers.json` - Pre-configured server connections for pgAdmin
- `docker/prometheus.yml` - Prometheus scrape configuration
- `docker/grafana-datasources.yml` - Grafana datasource provisioning
- `docker/grafana-dashboards.yml` - Grafana dashboard provisioning configuration
- `docker/dashboards/overview.json` - Main monitoring dashboard template
- `docker/README.md` - This documentation file
