# Low-Level Design (LLD)

## React Module Contracts

### `StudentWorkspaceService` (class)
File: `client/src/features/student/services/student-workspace.service.ts`

Responsibilities:
- Encapsulate student homework/evaluation API endpoints.
- Provide one typed entry point for route pages and feature hooks.

Methods:
- `getHomework()`
- `getHomeworkAnalytics()`
- `submitHomework(homeworkId, filesBase64)`
- `askHomeworkQuestion(homeworkId, question)`
- `getEvaluations()`
- `askEvaluationQuestion(evaluationId, question)`

### Homework Feature
- Hook: `useStudentHomeworkWorkspace`
  - Fetches homework list + analytics.
  - Sorts and groups by `subject -> month -> dueDate(desc)`.
- Component: `HomeworkStats`
  - Isolated KPI rendering for assignment analytics.

### Evaluations Feature
- Hook: `useStudentEvaluationsWorkspace`
  - Fetches evaluations and derives aggregated stats.
- Component: `EvaluationStats`
  - Isolated KPI rendering for completed evaluations.

### Shared Student Feature Component
- `PrivateEvaluationQA`
  - Reused question/answer UI for homework and evaluations.
  - Keeps private per-record interaction pattern consistent.

### App Composition
- `AppProviders` isolates all global provider wiring.
- `AppRouter` isolates route tree.
- `ProtectedRoute` encapsulates role-based route guard logic.

## CDK Module Contracts

### `ContextResolver` (class)
File: `infra/lib/core/context-resolver.ts`

Responsibilities:
- Parse typed context values from CDK App.
- Enforce required values and safe numeric parsing.

### `DeploymentConfigFactory` (class)
File: `infra/lib/config/deployment-config.ts`

Responsibilities:
- Build a valid `DeploymentConfig` object from context + defaults.
- Keep all config derivation in one location.

### `ResourceNamer` (class)
File: `infra/lib/core/resource-namer.ts`

Responsibilities:
- Generate deterministic stack IDs, construct IDs, and physical names.
- Enforce naming conventions across stacks and constructs.

### `InfrastructureTagPolicy` (class)
File: `infra/lib/core/tag-policy.ts`

Responsibilities:
- Apply required organization tags (`Project`, `Environment`, `ManagedBy`).

### `BaseStack` (class)
File: `infra/lib/stacks/base-stack.ts`

Responsibilities:
- Provide shared stack concerns: resolved config, naming strategy, tag policy.
- Reduce repeated stack bootstrap code.

### `TesEcsStack`
File: `infra/lib/stacks/tes-ecs-stack.ts`

Responsibilities:
- Compose `Network` and `AppService` constructs.
- Manage ECR repository and stack outputs.
