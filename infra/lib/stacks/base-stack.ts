import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import { DEPLOYMENT_DEFAULTS } from "../config/deployment-defaults";
import type { DeploymentConfig } from "../config/deployment-config";
import { ResourceNamer } from "../core/resource-namer";
import { InfrastructureTagPolicy } from "../core/tag-policy";

export interface BaseStackProps extends cdk.StackProps {
  config: DeploymentConfig;
}

export abstract class BaseStack extends cdk.Stack {
  protected readonly config: DeploymentConfig;
  protected readonly namer: ResourceNamer;

  constructor(scope: Construct, id: string, props: BaseStackProps) {
    super(scope, id, props);

    this.config = props.config;
    this.namer = new ResourceNamer(DEPLOYMENT_DEFAULTS.projectName, props.config.envName);

    InfrastructureTagPolicy.apply(this, {
      projectName: DEPLOYMENT_DEFAULTS.projectName,
      envName: props.config.envName,
    });
  }
}
