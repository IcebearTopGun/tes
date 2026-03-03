#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
COMPOSE_FILE="$ROOT_DIR/localstack/docker-compose.yml"
ENDPOINT="http://localhost:4566"
SECRET_NAME="tes/app/local"

export AWS_ACCESS_KEY_ID="test"
export AWS_SECRET_ACCESS_KEY="test"
export AWS_DEFAULT_REGION="${AWS_DEFAULT_REGION:-us-east-1}"

if ! command -v docker >/dev/null 2>&1; then
  echo "docker is required"
  exit 1
fi

if ! command -v aws >/dev/null 2>&1; then
  echo "aws cli is required"
  exit 1
fi

docker compose -f "$COMPOSE_FILE" up -d

echo "Waiting for LocalStack health..."
for _ in {1..40}; do
  if curl -fsS "$ENDPOINT/_localstack/health" >/dev/null 2>&1; then
    break
  fi
  sleep 2
done

if ! curl -fsS "$ENDPOINT/_localstack/health" >/dev/null 2>&1; then
  echo "LocalStack did not become ready"
  exit 1
fi

SECRET_PAYLOAD='{"DATABASE_URL":"postgresql://postgres:admin@host.docker.internal:5432/tes","SESSION_SECRET":"local-session-secret","OPENAI_API_KEY":"local-openai-key"}'

if aws --endpoint-url "$ENDPOINT" secretsmanager describe-secret --secret-id "$SECRET_NAME" >/dev/null 2>&1; then
  aws --endpoint-url "$ENDPOINT" secretsmanager put-secret-value \
    --secret-id "$SECRET_NAME" \
    --secret-string "$SECRET_PAYLOAD" >/dev/null
else
  aws --endpoint-url "$ENDPOINT" secretsmanager create-secret \
    --name "$SECRET_NAME" \
    --secret-string "$SECRET_PAYLOAD" >/dev/null
fi

echo "LocalStack is ready with secret $SECRET_NAME"
