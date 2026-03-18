# DynamoDB Schema Design - Symphony Frontend POC

## Table: `symphony-tasks`

**Region:** eu-central-1 (mll-sandbox)
**Billing:** Provisioned (100 RCU / 100 WCU) for POC. Monitor and switch to On-Demand if needed.

### Primary Key

| Attribute   | Type   | Description                  |
|-------------|--------|------------------------------|
| `PK` (Hash) | String | `TASK#<uuid>` - Task entity  |

Using a prefixed PK allows future expansion to store other entity types
(e.g., `AGENT#<id>`, `SESSION#<id>`) in the same table if needed (single-table design).

### Attributes

| Attribute        | Type   | Required | Description                                    |
|------------------|--------|----------|------------------------------------------------|
| `PK`             | S      | Yes      | `TASK#<uuid>`                                  |
| `id`             | S      | Yes      | Raw UUID (for API responses, no prefix)        |
| `title`          | S      | Yes      | Task title (1-255 chars)                       |
| `description`    | S      | No       | Task description (up to 4096 chars)            |
| `status`         | S      | Yes      | Enum: `backlog`, `todo`, `in_progress`, `done` |
| `priority`       | S      | Yes      | Enum: `low`, `medium`, `high`, `urgent`        |
| `assigned_agent` | S      | No       | Agent ID (null if unassigned)                  |
| `tags`           | L      | No       | List of string tags                            |
| `source`         | S      | Yes      | Origin: `manual`, `jira`, `linear`             |
| `version`        | N      | Yes      | Monotonic version for optimistic locking       |
| `created_at`     | S      | Yes      | ISO 8601 UTC timestamp                         |
| `updated_at`     | S      | Yes      | ISO 8601 UTC timestamp                         |

### Global Secondary Indexes

#### GSI1: Query by Status

Used for: Kanban board columns (list tasks by status), filtered views.

| Attribute    | Key Type | Value                           |
|--------------|----------|---------------------------------|
| `GSI1_PK`    | Hash     | `STATUS#<status>` (e.g., `STATUS#in_progress`) |
| `GSI1_SK`    | Range    | `<created_at>#<id>` (composite for uniqueness + sort) |

**Access patterns:**
- List all `in_progress` tasks, sorted by creation date
- List all `backlog` tasks for the kanban "Backlog" column
- Paginate with `ExclusiveStartKey`

**Projection:** ALL (all attributes projected to avoid fetches)

#### GSI2: Query by Assigned Agent

Used for: Agent workload panel (show tasks assigned to a specific agent).

| Attribute    | Key Type | Value                           |
|--------------|----------|---------------------------------|
| `GSI2_PK`    | Hash     | `AGENT#<agent_id>` or `AGENT#UNASSIGNED` |
| `GSI2_SK`    | Range    | `<status>#<created_at>`         |

**Access patterns:**
- List all tasks assigned to agent X
- List unassigned tasks (for auto-assignment)
- Filter by status within an agent's queue

**Projection:** ALL

### Write Sharding Strategy (POC-acceptable)

For POC scale (~100 tasks, ~50 agents), hot partition risk is minimal.
The `STATUS#<status>` GSI partition key could become hot for `in_progress`
in production, but is fine for POC volumes.

**Production upgrade path (documented, not implemented):**
- Add date-based sharding: `STATUS#in_progress#2026-03-18`
- Use scatter-gather reads across date shards
- Or switch to DynamoDB Streams + materialized views

### Optimistic Locking

Every write increments `version` using a conditional expression:

```
ConditionExpression: attribute_not_exists(PK) OR version = :expected_version
UpdateExpression: SET version = :new_version, ...
```

This prevents concurrent edits from silently overwriting each other.
The API returns 409 Conflict if the condition fails.

### State Machine Validation

Status transitions enforced at the application layer (Elixir context module):

```
Allowed transitions:
  backlog    -> todo
  todo       -> in_progress
  in_progress -> done
  in_progress -> in_progress  (reassign, keeps status)
  any        -> backlog       (reset/reopen)
```

Disallowed:
- `done -> in_progress` (create a new task instead)
- `backlog -> done` (must go through the pipeline)

### Example Item (DynamoDB JSON)

```json
{
  "PK":             {"S": "TASK#a1b2c3d4-e5f6-7890-abcd-ef1234567890"},
  "id":             {"S": "a1b2c3d4-e5f6-7890-abcd-ef1234567890"},
  "title":          {"S": "Implement user authentication"},
  "description":    {"S": "Add OAuth2 login flow with GitHub provider"},
  "status":         {"S": "in_progress"},
  "priority":       {"S": "high"},
  "assigned_agent": {"S": "worker-ssh-1"},
  "tags":           {"L": [{"S": "auth"}, {"S": "security"}]},
  "source":         {"S": "manual"},
  "version":        {"N": "3"},
  "created_at":     {"S": "2026-03-18T10:30:00Z"},
  "updated_at":     {"S": "2026-03-18T14:22:15Z"},
  "GSI1_PK":        {"S": "STATUS#in_progress"},
  "GSI1_SK":        {"S": "2026-03-18T10:30:00Z#a1b2c3d4-e5f6-7890-abcd-ef1234567890"},
  "GSI2_PK":        {"S": "AGENT#worker-ssh-1"},
  "GSI2_SK":        {"S": "in_progress#2026-03-18T10:30:00Z"}
}
```

### Table Creation (AWS CLI)

```bash
aws dynamodb create-table \
  --table-name symphony-tasks \
  --attribute-definitions \
    AttributeName=PK,AttributeType=S \
    AttributeName=GSI1_PK,AttributeType=S \
    AttributeName=GSI1_SK,AttributeType=S \
    AttributeName=GSI2_PK,AttributeType=S \
    AttributeName=GSI2_SK,AttributeType=S \
  --key-schema \
    AttributeName=PK,KeyType=HASH \
  --global-secondary-indexes \
    '[
      {
        "IndexName": "GSI1-status-index",
        "KeySchema": [
          {"AttributeName": "GSI1_PK", "KeyType": "HASH"},
          {"AttributeName": "GSI1_SK", "KeyType": "RANGE"}
        ],
        "Projection": {"ProjectionType": "ALL"},
        "ProvisionedThroughput": {"ReadCapacityUnits": 50, "WriteCapacityUnits": 50}
      },
      {
        "IndexName": "GSI2-agent-index",
        "KeySchema": [
          {"AttributeName": "GSI2_PK", "KeyType": "HASH"},
          {"AttributeName": "GSI2_SK", "KeyType": "RANGE"}
        ],
        "Projection": {"ProjectionType": "ALL"},
        "ProvisionedThroughput": {"ReadCapacityUnits": 50, "WriteCapacityUnits": 50}
      }
    ]' \
  --provisioned-throughput ReadCapacityUnits=100,WriteCapacityUnits=100 \
  --region eu-central-1
```
