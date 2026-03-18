#!/usr/bin/env bash
#
# Local DynamoDB setup for Symphony E2E testing.
# Uses Docker to run DynamoDB Local.
#
# Usage:
#   ./scripts/dynamodb-local.sh start   - Start DynamoDB Local
#   ./scripts/dynamodb-local.sh stop    - Stop DynamoDB Local
#   ./scripts/dynamodb-local.sh tables  - Create required tables
#   ./scripts/dynamodb-local.sh status  - Check if running
#

set -euo pipefail

CONTAINER_NAME="symphony-dynamodb-local"
DYNAMODB_PORT="${DYNAMODB_PORT:-8000}"
AWS_REGION="${AWS_REGION:-us-east-1}"
AWS_ENDPOINT="http://localhost:${DYNAMODB_PORT}"

# Dummy credentials for local DynamoDB
export AWS_ACCESS_KEY_ID="${AWS_ACCESS_KEY_ID:-fakeAccessKeyId}"
export AWS_SECRET_ACCESS_KEY="${AWS_SECRET_ACCESS_KEY:-fakeSecretAccessKey}"
export AWS_DEFAULT_REGION="${AWS_REGION}"

start() {
  echo "Starting DynamoDB Local on port ${DYNAMODB_PORT}..."

  if docker ps --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
    echo "DynamoDB Local is already running."
    return 0
  fi

  # Remove stopped container if exists
  docker rm -f "${CONTAINER_NAME}" 2>/dev/null || true

  docker run -d \
    --name "${CONTAINER_NAME}" \
    -p "${DYNAMODB_PORT}:8000" \
    amazon/dynamodb-local:latest \
    -jar DynamoDBLocal.jar -inMemory -sharedDb

  echo "Waiting for DynamoDB Local to be ready..."
  for i in $(seq 1 30); do
    if aws dynamodb list-tables --endpoint-url "${AWS_ENDPOINT}" --region "${AWS_REGION}" >/dev/null 2>&1; then
      echo "DynamoDB Local is ready."
      return 0
    fi
    sleep 1
  done

  echo "ERROR: DynamoDB Local did not start in time."
  return 1
}

stop() {
  echo "Stopping DynamoDB Local..."
  docker rm -f "${CONTAINER_NAME}" 2>/dev/null || true
  echo "Stopped."
}

create_tables() {
  echo "Creating Symphony tables..."

  # Tasks table
  aws dynamodb create-table \
    --endpoint-url "${AWS_ENDPOINT}" \
    --region "${AWS_REGION}" \
    --table-name "symphony-tasks" \
    --attribute-definitions \
      AttributeName=id,AttributeType=S \
      AttributeName=status,AttributeType=S \
      AttributeName=priority,AttributeType=S \
      AttributeName=assignee,AttributeType=S \
    --key-schema \
      AttributeName=id,KeyType=HASH \
    --global-secondary-indexes \
      '[
        {
          "IndexName": "status-index",
          "KeySchema": [{"AttributeName": "status", "KeyType": "HASH"}],
          "Projection": {"ProjectionType": "ALL"},
          "ProvisionedThroughput": {"ReadCapacityUnits": 5, "WriteCapacityUnits": 5}
        },
        {
          "IndexName": "priority-index",
          "KeySchema": [{"AttributeName": "priority", "KeyType": "HASH"}],
          "Projection": {"ProjectionType": "ALL"},
          "ProvisionedThroughput": {"ReadCapacityUnits": 5, "WriteCapacityUnits": 5}
        },
        {
          "IndexName": "assignee-index",
          "KeySchema": [{"AttributeName": "assignee", "KeyType": "HASH"}],
          "Projection": {"ProjectionType": "ALL"},
          "ProvisionedThroughput": {"ReadCapacityUnits": 5, "WriteCapacityUnits": 5}
        }
      ]' \
    --provisioned-throughput ReadCapacityUnits=10,WriteCapacityUnits=10 \
    2>/dev/null && echo "  Created: symphony-tasks" || echo "  Exists: symphony-tasks"

  # Agents table
  aws dynamodb create-table \
    --endpoint-url "${AWS_ENDPOINT}" \
    --region "${AWS_REGION}" \
    --table-name "symphony-agents" \
    --attribute-definitions \
      AttributeName=id,AttributeType=S \
    --key-schema \
      AttributeName=id,KeyType=HASH \
    --provisioned-throughput ReadCapacityUnits=5,WriteCapacityUnits=5 \
    2>/dev/null && echo "  Created: symphony-agents" || echo "  Exists: symphony-agents"

  echo "Tables ready."
  aws dynamodb list-tables --endpoint-url "${AWS_ENDPOINT}" --region "${AWS_REGION}"
}

status() {
  if docker ps --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
    echo "DynamoDB Local: RUNNING (port ${DYNAMODB_PORT})"
    aws dynamodb list-tables --endpoint-url "${AWS_ENDPOINT}" --region "${AWS_REGION}" 2>/dev/null || true
  else
    echo "DynamoDB Local: STOPPED"
  fi
}

case "${1:-}" in
  start)  start && create_tables ;;
  stop)   stop ;;
  tables) create_tables ;;
  status) status ;;
  *)
    echo "Usage: $0 {start|stop|tables|status}"
    exit 1
    ;;
esac
