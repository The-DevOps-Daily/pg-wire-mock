# EXPLAIN Query Support

The PostgreSQL Wire Protocol Mock Server supports EXPLAIN queries to provide mock query execution plans. This feature helps test query optimization tools, ORMs, and database administration utilities that rely on PostgreSQL's EXPLAIN functionality.

## Supported Features

### Basic EXPLAIN
```sql
EXPLAIN SELECT * FROM users;
```
Returns a textual execution plan showing estimated costs, row counts, and operation types.

### EXPLAIN ANALYZE
```sql
EXPLAIN ANALYZE SELECT * FROM users WHERE id = 1;
```
Includes simulated actual execution times, row counts, and performance metrics alongside the planned estimates.

### Output Formats

#### TEXT Format (Default)
```sql
EXPLAIN SELECT * FROM users;
```
```
Seq Scan on users  (cost=0.00..15.00 rows=1000 width=100)
```

#### JSON Format
```sql
EXPLAIN (FORMAT JSON) SELECT * FROM users;
```
```json
[
  {
    "Plan": {
      "Node Type": "Seq Scan",
      "Relation Name": "users",
      "Startup Cost": 0.00,
      "Total Cost": 15.00,
      "Plan Rows": 1000,
      "Plan Width": 100
    }
  }
]
```

#### XML Format
```sql
EXPLAIN (FORMAT XML) SELECT * FROM users;
```
```xml
<?xml version="1.0" encoding="UTF-8"?>
<explain xmlns="http://www.postgresql.org/2009/explain">
  <Query>
    <Plan>
      <Node-Type>Seq Scan</Node-Type>
      <Relation-Name>users</Relation-Name>
      <Startup-Cost>0.00</Startup-Cost>
      <Total-Cost>15.00</Total-Cost>
      <Plan-Rows>1000</Plan-Rows>
      <Plan-Width>100</Plan-Width>
    </Plan>
  </Query>
</explain>
```

#### YAML Format
```sql
EXPLAIN (FORMAT YAML) SELECT * FROM users;
```
```yaml
- Plan:
    Node Type: "Seq Scan"
    Relation Name: "users"
    Startup Cost: 0.00
    Total Cost: 15.00
    Plan Rows: 1000
    Plan Width: 100
```

## Supported Options

### ANALYZE
- `EXPLAIN ANALYZE` - Include actual execution statistics
- `EXPLAIN (ANALYZE true)` - Explicit enable
- `EXPLAIN (ANALYZE false)` - Explicit disable

### FORMAT
- `TEXT` - Traditional indented plan tree (default)
- `JSON` - Structured JSON format
- `XML` - PostgreSQL-compatible XML format
- `YAML` - YAML representation

### Other Options
- `VERBOSE` - Currently parsed but not implemented
- `COSTS` - Cost display (enabled by default)
- `BUFFERS` - Currently parsed but not implemented
- `TIMING` - Timing information for ANALYZE mode

## Query Type Support

### SELECT Queries
- Simple selects: `EXPLAIN SELECT 1`
- Table scans: `EXPLAIN SELECT * FROM users`
- Filtered queries: `EXPLAIN SELECT * FROM users WHERE id = 1`
- Joins: `EXPLAIN SELECT * FROM users JOIN posts ON users.id = posts.user_id`
- Sorted queries: `EXPLAIN SELECT * FROM users ORDER BY name`

### DML Queries
- `EXPLAIN INSERT INTO users (name) VALUES ('test')`
- `EXPLAIN UPDATE users SET name = 'new' WHERE id = 1`
- `EXPLAIN DELETE FROM users WHERE active = false`

## Plan Node Types

The mock server generates realistic plan nodes based on query analysis:

### Common Node Types
- **Seq Scan** - Sequential table scan
- **Result** - Simple result generation
- **Hash Join** - Hash-based join operation
- **Hash** - Hash table creation
- **Sort** - Sorting operation
- **Insert** - Insert operation
- **Update** - Update operation
- **Delete** - Delete operation

### Plan Structure
Each plan node includes:
- **Node Type** - The operation type
- **Startup Cost** - Estimated cost to return first row
- **Total Cost** - Estimated total execution cost
- **Plan Rows** - Estimated number of rows
- **Plan Width** - Estimated average row width in bytes
- **Relation Name** - Table name (when applicable)

### ANALYZE Additional Fields
When using EXPLAIN ANALYZE, nodes also include:
- **Actual Startup Time** - Simulated time to first row (ms)
- **Actual Total Time** - Simulated total execution time (ms)
- **Actual Rows** - Simulated actual row count
- **Actual Loops** - Number of times node was executed

## Implementation Details

### Plan Generation Algorithm
1. **Query Parsing** - Extract EXPLAIN options and inner query
2. **Query Analysis** - Detect query patterns (JOINs, WHERE clauses, etc.)
3. **Template Selection** - Choose appropriate plan template
4. **Cost Estimation** - Generate realistic cost estimates
5. **Format Output** - Convert to requested format

### Cost Model
The mock server uses simplified cost calculations:
- Base sequential scan cost: `rows * 0.01 + 5.0`
- Join operations add overhead based on estimated row counts
- Sort operations add cost proportional to row count

### Timing Simulation
EXPLAIN ANALYZE includes simulated timing:
- **Planning Time** - Random value between 0.1-0.6ms
- **Execution Time** - Based on estimated costs with randomization
- **Node Timing** - Proportional to node cost estimates

## Limitations

### Mock Nature
- **Not Real Optimization** - Plans are generated using simple heuristics, not actual PostgreSQL query optimization
- **Deterministic Output** - Plans are consistent for identical queries but don't reflect real database statistics
- **Limited Complexity** - Complex query features may not be accurately represented

### Query Analysis
- **Simple Parsing** - Uses regex-based parsing, not full SQL grammar
- **Table Detection** - Basic table name extraction may miss complex cases
- **Index Awareness** - No simulation of index usage or statistics

### Plan Accuracy
- **Cost Estimates** - Simplified cost model doesn't match PostgreSQL's actual costing
- **Node Selection** - Limited set of plan node types compared to full PostgreSQL
- **Statistics** - No consideration of table statistics or data distribution

### Format Compatibility
- **Schema Compliance** - Output formats aim for PostgreSQL compatibility but may have minor differences
- **Field Coverage** - Some PostgreSQL EXPLAIN fields may be missing or simplified

## Usage Examples

### Testing Query Optimization Tools
```javascript
// Test tool that analyzes query plans
const client = new Client({ /* connection config */ });
const result = await client.query('EXPLAIN (FORMAT JSON) SELECT * FROM users WHERE active = true');
const plan = JSON.parse(result.rows[0]['QUERY PLAN']);
// Analyze plan structure...
```

### ORM Integration Testing
```javascript
// Test ORM explain functionality
const users = await User.query()
  .explain({ format: 'json', analyze: true })
  .where('active', true);
```

### Performance Analysis Simulation
```sql
-- Compare different query approaches
EXPLAIN ANALYZE SELECT * FROM users WHERE name LIKE 'John%';
EXPLAIN ANALYZE SELECT * FROM users WHERE name = 'John Smith';
```

## Configuration

EXPLAIN functionality is enabled by default. No additional configuration is required.

The feature integrates with the existing query logging system, so EXPLAIN queries are logged with their execution plans and performance metrics.

## Error Handling

### Invalid Syntax
```sql
EXPLAIN; -- Error: requires query to analyze
EXPLAIN (FORMAT INVALID) SELECT 1; -- Error: unknown format
```

### Inner Query Errors
If the inner query would produce an error, EXPLAIN will generally succeed but may return a generic plan for unknown query types.

## Integration with Other Features

### Query Logging
EXPLAIN queries are logged with full details including:
- Original EXPLAIN query
- Parsed options
- Generated plan structure
- Execution timing (if ANALYZE)

### Connection State
EXPLAIN queries don't affect transaction state but respect the current connection context for parameter substitution.

### Error Reporting
EXPLAIN-specific errors use PostgreSQL-compatible error codes and messages.

## Future Enhancements

Potential improvements for future versions:
- More sophisticated cost models
- Additional plan node types
- Index simulation
- Statistics-aware planning
- Custom plan templates
- Performance benchmarking integration

## Compatibility

This EXPLAIN implementation aims for compatibility with:
- PostgreSQL 12+ EXPLAIN syntax
- Common PostgreSQL client libraries
- Popular ORMs and query builders
- Database administration tools

While not 100% feature-complete compared to real PostgreSQL, it provides sufficient functionality for most testing and development scenarios involving query plan analysis.