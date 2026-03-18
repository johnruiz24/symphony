# ADR-002: Why DynamoDB as Canonical Store

**Status:** Proposed
**Date:** 2026-03-18
**Context:** Symphony Frontend POC persistence strategy

---

## Context

The current Symphony Elixir implementation is deliberately stateless -- the orchestrator keeps all runtime state in-memory (in a GenServer) and reconstructs it on restart by re-polling the issue tracker. This design is documented in the spec:

> Support restart recovery without requiring a persistent database.

For the Frontend POC, we need persistent storage for:
- Task board state (columns, card positions, user customizations)
- Agent session history (past runs, token usage, outcomes)
- Frontend-specific metadata (user preferences, saved views)
- Audit trail of state transitions

---

## Decision

Use **DynamoDB** as the canonical persistent store for the Frontend POC.

---

## Rationale

### 1. Zero operational overhead

DynamoDB is a fully managed, serverless database:
- No server provisioning, patching, or capacity planning
- Automatic scaling (on-demand mode)
- Built-in replication and durability
- Pay-per-request pricing fits a POC budget

For a POC that needs to move fast, eliminating database operations is a significant advantage.

### 2. Natural fit for Symphony's data model

Symphony's data is naturally key-value / document-oriented:
- Issues are keyed by `issue_identifier` (e.g., `PROJ-42`)
- Agent sessions are keyed by `session_id`
- State snapshots are time-series documents

DynamoDB's partition key + sort key model maps directly:
- `PK: ISSUE#PROJ-42, SK: SESSION#2026-03-18T12:00:00Z`
- `PK: ISSUE#PROJ-42, SK: META`
- `PK: BOARD#default, SK: COLUMN#todo`

No relational joins are needed -- all queries are by known keys or key prefixes.

### 3. Single-table design reduces complexity

Using a single DynamoDB table with composite keys:
- All data in one table (no schema migrations across multiple tables)
- GSIs (Global Secondary Indexes) for alternate access patterns
- Atomic transactions across related items (e.g., move card + update column in one operation)

### 4. Event sourcing compatibility

DynamoDB Streams can emit change events, enabling:
- SSE endpoints that push updates when data changes
- Audit trail without separate event store
- Future integration with Lambda or other event consumers

### 5. Consistent with AWS ecosystem

If Symphony is deployed on AWS (common for enterprise teams):
- IAM-based authentication (no separate database credentials)
- VPC integration for private access
- CloudWatch metrics and alarms built in
- DynamoDB Local for offline development

---

## Consequences

### Positive
- Zero-ops database for the POC phase
- Millisecond read/write latency at any scale
- Built-in TTL for automatic data expiration (useful for session cleanup)
- DynamoDB Local available for development without AWS account

### Negative
- Vendor lock-in to AWS (mitigated by abstracting behind a repository interface)
- Query flexibility is limited compared to SQL (no ad-hoc queries without GSIs)
- Cost can grow with heavy read/write patterns if not using on-demand wisely
- Learning curve for single-table design patterns

### Risks
- If query patterns evolve significantly, GSI limits (20 per table) could become constraining
- Hot partition keys (e.g., a single board with thousands of cards) need careful key design
- DynamoDB Local has behavioral differences from the real service (eventual consistency simulation)

---

## Alternatives Considered

### PostgreSQL
A strong general-purpose choice. Rejected for POC because:
- Requires provisioning and managing a database server (or RDS)
- Schema migrations add friction during rapid iteration
- Symphony's data model doesn't benefit from relational features

PostgreSQL remains a viable option for a production deployment.

### SQLite
Lightweight and zero-config. Rejected because:
- Single-writer limitation conflicts with concurrent agent sessions
- No built-in change streams for real-time updates
- Not suitable for multi-node deployments

### Redis
Fast key-value store with pub/sub. Rejected because:
- Data durability requires explicit configuration (RDB/AOF)
- No built-in secondary indexes for querying by time range or status
- Memory-only storage is expensive for audit trail data

### In-memory only (current approach)
The current Elixir implementation's approach. Not viable for the frontend because:
- Data is lost on restart
- No history or audit trail
- Cannot support frontend features like saved views or user preferences

---

## Implementation Notes

### Local Development

Use DynamoDB Local for development:

```bash
# Docker
docker run -p 8000:8000 amazon/dynamodb-local

# Or via AWS CLI
aws dynamodb list-tables --endpoint-url http://localhost:8000
```

### Table Schema (Draft)

```
Table: symphony-frontend-poc
  PK (String) - Partition key
  SK (String) - Sort key
  GSI1PK (String) - Global secondary index 1 partition key
  GSI1SK (String) - Global secondary index 1 sort key
  TTL (Number) - Automatic expiration timestamp
```

### Access Patterns

| Access Pattern | PK | SK |
|---------------|----|----|
| Get issue metadata | `ISSUE#PROJ-42` | `META` |
| List sessions for issue | `ISSUE#PROJ-42` | `SESSION#*` |
| Get board layout | `BOARD#default` | `COLUMN#*` |
| Get agent run history | `AGENT#agent-id` | `RUN#*` |
