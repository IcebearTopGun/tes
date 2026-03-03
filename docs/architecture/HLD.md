# High-Level Design (HLD)

## Objective
Modularize the product into clear React feature boundaries and infrastructure layers so teams can scale delivery without increasing coupling.

## Frontend Architecture

### 1) App Layer
- `client/src/app/providers`: global providers (QueryClient, Toaster, Tooltip).
- `client/src/app/routing`: route orchestration and protected route enforcement.

### 2) Shared Layer
- `client/src/lib`: transport and infra utilities (`fetchWithAuth`, query client).
- `client/src/shared/utils`: cross-feature utilities (`getInitials`, identity helpers).
- `client/src/components/ui`: design-system primitives.

### 3) Feature Layer (Domain-first)
- `client/src/features/student/services`: class-based domain service (`StudentWorkspaceService`).
- `client/src/features/student/homework`: homework-specific hooks/components.
- `client/src/features/student/evaluations`: evaluation-specific hooks/components.
- `client/src/features/student/shared`: domain models and reusable feature widgets.

### 4) Page Layer
- `client/src/pages`: thin composition layer that wires hooks + components and owns route-level state only.

## Infrastructure Architecture (CDK)

### 1) Core Layer
- `infra/lib/core/context-resolver.ts`: typed context extraction and validation.
- `infra/lib/core/resource-namer.ts`: deterministic stack/resource naming conventions.
- `infra/lib/core/tag-policy.ts`: standard tags for governance.

### 2) Config Layer
- `infra/lib/config/deployment-defaults.ts`: centralized defaults.
- `infra/lib/config/deployment-config.ts`: factory-driven config materialization.

### 3) Stack Layer
- `infra/lib/stacks/base-stack.ts`: reusable base stack with naming + tagging policy.
- `infra/lib/stacks/tes-ecs-stack.ts`: business stack (VPC, ALB, ECS, ECR outputs).

### 4) Construct Layer
- `infra/lib/constructs`: encapsulated infrastructure capabilities (`Network`, `AppService`).

## Delivery Flow
- CI validates app (`test`, `build`) and deploys infra/app image through CDK workflow.
- Local infra simulation path exists using LocalStack.
