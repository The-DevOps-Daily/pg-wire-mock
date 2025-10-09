# SCRAM-SHA-256 Authentication Demo

This demo shows how to use SCRAM-SHA-256 authentication with pg-wire-mock.

## Quick Start

1. Start the server with SCRAM authentication:

```bash
export PG_MOCK_AUTH_METHOD=scram-sha-256
export PG_MOCK_REQUIRE_AUTHENTICATION=true
export PG_MOCK_USERNAME=testuser
export PG_MOCK_PASSWORD=securepass
npm start
```

2. Connect with psql:

```bash
psql -h localhost -p 5432 -U testuser -W
# Enter password: securepass
```

3. Try some queries:

```sql
SELECT 'SCRAM-SHA-256 authentication works!' as message;
SHOW VERSION;
SELECT NOW();
```

## Configuration Options

| Variable                         | Description            | Default    |
| -------------------------------- | ---------------------- | ---------- |
| `PG_MOCK_AUTH_METHOD`            | Authentication method  | `trust`    |
| `PG_MOCK_REQUIRE_AUTHENTICATION` | Require authentication | `false`    |
| `PG_MOCK_USERNAME`               | Mock username          | `postgres` |
| `PG_MOCK_PASSWORD`               | Mock password          | `password` |
| `PG_MOCK_SCRAM_ITERATIONS`       | PBKDF2 iterations      | `4096`     |

## Security Features

✅ **Salted passwords** - Passwords are never stored in plaintext
✅ **Challenge-response** - No passwords transmitted over network  
✅ **Mutual authentication** - Both client and server authenticate
✅ **Configurable iterations** - PBKDF2 key stretching for security
✅ **Standards compliant** - Full SCRAM-SHA-256 RFC 7677 support

## Client Examples

### Node.js (node-postgres)

```javascript
const { Client } = require('pg');

const client = new Client({
  host: 'localhost',
  port: 5432,
  database: 'postgres',
  user: 'testuser',
  password: 'securepass',
});

await client.connect();
const result = await client.query('SELECT 1');
console.log(result.rows[0]);
await client.end();
```

### Python (psycopg2)

```python
import psycopg2

conn = psycopg2.connect(
    host="localhost",
    port=5432,
    database="postgres",
    user="testuser",
    password="securepass"
)

cursor = conn.cursor()
cursor.execute("SELECT 'Hello SCRAM!' as greeting")
print(cursor.fetchone())
conn.close()
```

### Java (JDBC)

```java
String url = "jdbc:postgresql://localhost:5432/postgres";
Connection conn = DriverManager.getConnection(url, "testuser", "securepass");

Statement stmt = conn.createStatement();
ResultSet rs = stmt.executeQuery("SELECT 'JDBC with SCRAM!' as message");
while (rs.next()) {
    System.out.println(rs.getString("message"));
}
conn.close();
```

## Troubleshooting

**Authentication fails:**

- Check username/password match configuration
- Verify client supports SCRAM-SHA-256 (PostgreSQL 10+)
- Enable debug logging: `export PG_MOCK_LOG_LEVEL=debug`

**Connection hangs:**

- Check authentication method is supported by client
- Verify network connectivity
- Check client timeout settings
