# TES AWS CDK Infra

This directory deploys the app to AWS ECS Fargate behind an Application Load Balancer.

Design references:
- `docs/architecture/HLD.md`
- `docs/architecture/LLD.md`

## What gets created

- VPC (public subnets only, NAT-free for minimal cost)
- ECS Cluster + Fargate Service
- ALB (HTTP on port 80)
- CloudWatch log group
- ECR repository

## Required secret

Create one AWS Secrets Manager secret and use its name (or ARN) as `appSecretId`.
Secret JSON must include:

```json
{
  "DATABASE_URL": "postgresql://...",
  "SESSION_SECRET": "...",
  "OPENAI_API_KEY": "..."
}
```

## Deploy manually

```bash
cd infra
npm ci
npm run cdk -- bootstrap aws://<AWS_ACCOUNT_ID>/<AWS_REGION>
npm run cdk -- deploy TesEcsStack-prod \
  --require-approval never \
  -c region=<AWS_REGION> \
  -c envName=prod \
  -c ecrRepoName=tes-app \
  -c appSecretId=tes/app/prod \
  -c imageTag=<IMAGE_TAG>
```

## Main context values

- `account` (optional; defaults to `CDK_DEFAULT_ACCOUNT`)
- `region` (optional; defaults to `CDK_DEFAULT_REGION` or `us-east-1`)
- `appSecretId` (default: `tes/app/<envName>`)
- `envName` (default: `prod`)
- `ecrRepoName` (default: `tes-app`)
- `imageTag` (default: `latest`)
- `desiredCount` (default: `1`)
- `cpu` (default: `512`)
- `memoryMiB` (default: `1024`)
- `containerPort` (default: `5000`)
- `healthCheckPath` (default: `/api/admin/stats`)

## Local infra spin-up (LocalStack)

Prerequisites: Docker and AWS CLI installed locally.

```bash
cd infra
npm ci
npm run local:deploy
```

This flow starts LocalStack, creates/updates the `tes/app/local` secret, bootstraps CDK locally, and deploys `TesEcsStack-local` with `desiredCount=0`.

To stop LocalStack:

```bash
npm run localstack:down
```
