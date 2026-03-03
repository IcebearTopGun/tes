import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import * as ecr from "aws-cdk-lib/aws-ecr";
import { Network } from "../constructs/network";
import { AppService } from "../constructs/app-service";
import { BaseStack, BaseStackProps } from "./base-stack";

export interface TesEcsStackProps extends BaseStackProps {}

export class TesEcsStack extends BaseStack {
  constructor(scope: Construct, id: string, props: TesEcsStackProps) {
    super(scope, id, props);

    const { config } = this;

    const network = new Network(this, this.namer.cdkId("Network"), {
      maxAzs: config.maxAzs,
      appPort: config.containerPort,
      availabilityZones: config.availabilityZones,
    });

    const repository = new ecr.Repository(this, this.namer.cdkId("Repository"), {
      repositoryName: config.ecrRepoName,
      imageScanOnPush: true,
      lifecycleRules: [{ maxImageCount: 30 }],
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      emptyOnDelete: false,
    });

    const appService = new AppService(this, this.namer.cdkId("AppService"), {
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

    new cdk.CfnOutput(this, this.namer.cdkId("AlbDnsName"), {
      value: network.alb.loadBalancerDnsName,
    });

    new cdk.CfnOutput(this, this.namer.cdkId("EcrRepositoryName"), {
      value: repository.repositoryName,
    });

    new cdk.CfnOutput(this, this.namer.cdkId("EcrRepositoryUri"), {
      value: repository.repositoryUri,
    });

    new cdk.CfnOutput(this, this.namer.cdkId("EcsClusterName"), {
      value: appService.cluster.clusterName,
    });

    new cdk.CfnOutput(this, this.namer.cdkId("EcsServiceName"), {
      value: appService.service.serviceName,
    });
  }
}
