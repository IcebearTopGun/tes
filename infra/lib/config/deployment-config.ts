import * as cdk from "aws-cdk-lib";
import { DEPLOYMENT_DEFAULTS } from "./deployment-defaults";
import { ContextResolver } from "../core/context-resolver";

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

export class DeploymentConfigFactory {
  constructor(private readonly app: cdk.App) {}

  build(): DeploymentConfig {
    const context = new ContextResolver(this.app);
    const account = context.getRequiredString("account", process.env.CDK_DEFAULT_ACCOUNT);
    const region = context.getRequiredString("region", process.env.CDK_DEFAULT_REGION ?? DEPLOYMENT_DEFAULTS.region);

    return {
      envName: context.getOptionalString("envName") ?? DEPLOYMENT_DEFAULTS.envName,
      account,
      region,
      availabilityZones: context.getStringList("availabilityZones", [`${region}a`, `${region}b`]),
      ecrRepoName: context.getOptionalString("ecrRepoName") ?? DEPLOYMENT_DEFAULTS.ecrRepoName,
      imageTag: context.getOptionalString("imageTag") ?? DEPLOYMENT_DEFAULTS.imageTag,
      appSecretArn: context.getRequiredString("appSecretArn"),
      containerPort: context.getNumber("containerPort", DEPLOYMENT_DEFAULTS.containerPort),
      desiredCount: context.getNumber("desiredCount", DEPLOYMENT_DEFAULTS.desiredCount),
      cpu: context.getNumber("cpu", DEPLOYMENT_DEFAULTS.cpu),
      memoryMiB: context.getNumber("memoryMiB", DEPLOYMENT_DEFAULTS.memoryMiB),
      maxAzs: context.getNumber("maxAzs", DEPLOYMENT_DEFAULTS.maxAzs),
      healthCheckPath: context.getOptionalString("healthCheckPath") ?? DEPLOYMENT_DEFAULTS.healthCheckPath,
    };
  }
}

export function loadDeploymentConfig(app: cdk.App): DeploymentConfig {
  return new DeploymentConfigFactory(app).build();
}
