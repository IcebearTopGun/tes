#!/usr/bin/env node
import "source-map-support/register";
import * as cdk from "aws-cdk-lib";
import { DEPLOYMENT_DEFAULTS } from "../lib/config/deployment-defaults";
import { loadDeploymentConfig } from "../lib/config/deployment-config";
import { ResourceNamer } from "../lib/core/resource-namer";
import { TesEcsStack } from "../lib/stacks/tes-ecs-stack";

const app = new cdk.App();
const config = loadDeploymentConfig(app);
const namer = new ResourceNamer(DEPLOYMENT_DEFAULTS.projectName, config.envName);

new TesEcsStack(app, namer.stackId("tes-ecs"), {
  env: {
    account: config.account,
    region: config.region,
  },
  config,
});
