#!/usr/bin/env node
import "source-map-support/register";
import * as cdk from "aws-cdk-lib";
import { TesEcsStack } from "../lib/tes-ecs-stack";

const app = new cdk.App();

const getContext = (key: string): string | undefined => {
  const value = app.node.tryGetContext(key);
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
};

const account = getContext("account") ?? process.env.CDK_DEFAULT_ACCOUNT;
if (!account) {
  throw new Error("Missing AWS account. Pass -c account=... or set CDK_DEFAULT_ACCOUNT.");
}

const region = getContext("region") ?? process.env.CDK_DEFAULT_REGION ?? "us-east-1";
const envName = getContext("envName") ?? "prod";
const stackId = `TesEcsStack-${envName}`;

new TesEcsStack(app, stackId, {
  env: {
    account,
    region,
  },
  envName,
  ecrRepoName: getContext("ecrRepoName") ?? "tes-app",
  imageTag: getContext("imageTag") ?? "latest",
  appSecretId: getContext("appSecretId") ?? `tes/app/${envName}`,
  containerPort: Number(getContext("containerPort") ?? 5000),
  desiredCount: Number(getContext("desiredCount") ?? 1),
  cpu: Number(getContext("cpu") ?? 512),
  memoryMiB: Number(getContext("memoryMiB") ?? 1024),
  maxAzs: Number(getContext("maxAzs") ?? 2),
  healthCheckPath: getContext("healthCheckPath") ?? "/api/admin/stats",
});

/*
File Purpose:
This file is the CDK entrypoint for AWS hosting infrastructure.

Responsibilities:

* Resolves deployment context values with pragmatic defaults for single-account deployments
* Creates the ECS stack with minimal required deployment parameters

Notes:
This file was extracted from a large file during refactoring to improve maintainability.
No business logic was modified.
*/
