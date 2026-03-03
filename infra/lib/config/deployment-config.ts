import * as cdk from "aws-cdk-lib";

export interface DeploymentConfig {
  envName: string;
  account: string;
  region: string;
  availabilityZones: string[];
  ecrRepoName: string;
  imageTag: string;
  appSecretArn: string;
  containerPort: number;
  desiredCount: number;
  cpu: number;
  memoryMiB: number;
  maxAzs: number;
  healthCheckPath: string;
}

function getContextString(app: cdk.App, key: string): string | undefined {
  const val = app.node.tryGetContext(key);
  return typeof val === "string" && val.trim().length > 0 ? val.trim() : undefined;
}

function getRequired(app: cdk.App, key: string, fallback?: string): string {
  const value = getContextString(app, key) ?? fallback;
  if (!value) {
    throw new Error(`Missing required context value: ${key}`);
  }
  return value;
}

function getNumber(app: cdk.App, key: string, fallback: number): number {
  const raw = app.node.tryGetContext(key);
  if (raw === undefined || raw === null || raw === "") {
    return fallback;
  }

  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) {
    throw new Error(`Context value ${key} must be numeric.`);
  }
  return parsed;
}

function getStringList(app: cdk.App, key: string, fallback: string[]): string[] {
  const raw = getContextString(app, key);
  if (!raw) return fallback;
  const values = raw
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part.length > 0);

  return values.length > 0 ? values : fallback;
}

export function loadDeploymentConfig(app: cdk.App): DeploymentConfig {
  const account = getRequired(app, "account", process.env.CDK_DEFAULT_ACCOUNT);
  const region = getRequired(app, "region", process.env.CDK_DEFAULT_REGION ?? "us-east-1");

  return {
    envName: getContextString(app, "envName") ?? "prod",
    account,
    region,
    availabilityZones: getStringList(app, "availabilityZones", [`${region}a`, `${region}b`]),
    ecrRepoName: getContextString(app, "ecrRepoName") ?? "tes-app",
    imageTag: getContextString(app, "imageTag") ?? "latest",
    appSecretArn: getRequired(app, "appSecretArn"),
    containerPort: getNumber(app, "containerPort", 5000),
    desiredCount: getNumber(app, "desiredCount", 1),
    cpu: getNumber(app, "cpu", 512),
    memoryMiB: getNumber(app, "memoryMiB", 1024),
    maxAzs: getNumber(app, "maxAzs", 2),
    healthCheckPath: getContextString(app, "healthCheckPath") ?? "/api/admin/stats",
  };
}
