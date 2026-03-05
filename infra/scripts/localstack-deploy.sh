#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REGION="${AWS_DEFAULT_REGION:-us-east-1}"
ACCOUNT="000000000000"

export AWS_ACCESS_KEY_ID="test"
export AWS_SECRET_ACCESS_KEY="test"
export AWS_DEFAULT_REGION="$REGION"
export CDK_DEFAULT_ACCOUNT="$ACCOUNT"
export CDK_DEFAULT_REGION="$REGION"

bash "$ROOT_DIR/scripts/localstack-up.sh"

pushd "$ROOT_DIR" >/dev/null
npm ci

npx cdklocal bootstrap "aws://$ACCOUNT/$REGION"

npx cdklocal deploy "TesEcsStack-local" \
  --require-approval never \
  --no-lookups \
  -c account="$ACCOUNT" \
  -c region="$REGION" \
  -c envName="local" \
  -c ecrRepoName="tes-app-local" \
  -c appSecretId="tes/app/local" \
  -c imageTag="local" \
  -c desiredCount=0

popd >/dev/null

echo "Local infra stack deployed on LocalStack."
