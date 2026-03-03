#!/usr/bin/env node
import "source-map-support/register";
import * as cdk from "aws-cdk-lib";
import { loadDeploymentConfig } from "../lib/config/deployment-config";
import { TesEcsStack } from "../lib/stacks/tes-ecs-stack";

const app = new cdk.App();
const config = loadDeploymentConfig(app);

new TesEcsStack(app, `TesEcsStack-${config.envName}`, {
  env: {
    account: config.account,
    region: config.region,
  },
  config,
});
