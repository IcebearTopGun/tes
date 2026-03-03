import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import * as ecr from "aws-cdk-lib/aws-ecr";
import { DeploymentConfig } from "../config/deployment-config";
import { Network } from "../constructs/network";
import { AppService } from "../constructs/app-service";

export interface TesEcsStackProps extends cdk.StackProps {
  config: DeploymentConfig;
}

export class TesEcsStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: TesEcsStackProps) {
    super(scope, id, props);

    const { config } = props;

    const network = new Network(this, "Network", {
      maxAzs: config.maxAzs,
      appPort: config.containerPort,
      availabilityZones: config.availabilityZones,
    });

    const repository = new ecr.Repository(this, "Repository", {
      repositoryName: config.ecrRepoName,
      imageScanOnPush: true,
      lifecycleRules: [{ maxImageCount: 30 }],
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      emptyOnDelete: false,
    });

    const appService = new AppService(this, "AppService", {
      vpc: network.vpc,
      alb: network.alb,
      serviceSecurityGroup: network.serviceSecurityGroup,
      repository,
      imageTag: config.imageTag,
      appSecretId: config.appSecretArn,
      containerPort: config.containerPort,
      desiredCount: config.desiredCount,
      cpu: config.cpu,
      memoryMiB: config.memoryMiB,
      healthCheckPath: config.healthCheckPath,
    });

    new cdk.CfnOutput(this, "AlbDnsName", {
      value: network.alb.loadBalancerDnsName,
    });

    new cdk.CfnOutput(this, "EcrRepositoryName", {
      value: repository.repositoryName,
    });

    new cdk.CfnOutput(this, "EcrRepositoryUri", {
      value: repository.repositoryUri,
    });

    new cdk.CfnOutput(this, "EcsClusterName", {
      value: appService.cluster.clusterName,
    });

    new cdk.CfnOutput(this, "EcsServiceName", {
      value: appService.service.serviceName,
    });
  }
}
