import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as ecr from "aws-cdk-lib/aws-ecr";
import * as ecs from "aws-cdk-lib/aws-ecs";
import * as logs from "aws-cdk-lib/aws-logs";
import * as secretsmanager from "aws-cdk-lib/aws-secretsmanager";
import * as elbv2 from "aws-cdk-lib/aws-elasticloadbalancingv2";

export interface TesEcsStackProps extends cdk.StackProps {
  envName: string;
  ecrRepoName: string;
  imageTag: string;
  appSecretId: string;
  containerPort: number;
  desiredCount: number;
  cpu: number;
  memoryMiB: number;
  maxAzs: number;
  healthCheckPath: string;
}

export class TesEcsStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: TesEcsStackProps) {
    super(scope, id, props);

    cdk.Tags.of(this).add("Project", "tes");
    cdk.Tags.of(this).add("Environment", props.envName);
    cdk.Tags.of(this).add("ManagedBy", "cdk");

    const vpc = new ec2.Vpc(this, "Vpc", {
      maxAzs: props.maxAzs,
      natGateways: 0,
      subnetConfiguration: [
        {
          name: "public",
          subnetType: ec2.SubnetType.PUBLIC,
          cidrMask: 24,
        },
      ],
    });

    const albSecurityGroup = new ec2.SecurityGroup(this, "AlbSecurityGroup", {
      vpc,
      description: "Allow inbound HTTP traffic",
      allowAllOutbound: true,
    });
    albSecurityGroup.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(80), "HTTP from internet");

    const serviceSecurityGroup = new ec2.SecurityGroup(this, "ServiceSecurityGroup", {
      vpc,
      description: "Allow ALB traffic to the app service",
      allowAllOutbound: true,
    });
    serviceSecurityGroup.addIngressRule(
      albSecurityGroup,
      ec2.Port.tcp(props.containerPort),
      "Allow ALB to reach app container",
    );

    const alb = new elbv2.ApplicationLoadBalancer(this, "Alb", {
      vpc,
      internetFacing: true,
      securityGroup: albSecurityGroup,
      vpcSubnets: { subnetType: ec2.SubnetType.PUBLIC },
    });

    const cluster = new ecs.Cluster(this, "Cluster", {
      vpc,
      containerInsightsV2: ecs.ContainerInsights.ENABLED,
    });

    const repository = ecr.Repository.fromRepositoryName(this, "Repository", props.ecrRepoName);

    const appSecret = props.appSecretId.startsWith("arn:")
      ? secretsmanager.Secret.fromSecretCompleteArn(this, "AppSecret", props.appSecretId)
      : secretsmanager.Secret.fromSecretNameV2(this, "AppSecret", props.appSecretId);

    const logGroup = new logs.LogGroup(this, "LogGroup", {
      retention: logs.RetentionDays.ONE_WEEK,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    const taskDefinition = new ecs.FargateTaskDefinition(this, "TaskDefinition", {
      cpu: props.cpu,
      memoryLimitMiB: props.memoryMiB,
    });

    const container = taskDefinition.addContainer("AppContainer", {
      image: ecs.ContainerImage.fromEcrRepository(repository, props.imageTag),
      logging: ecs.LogDrivers.awsLogs({
        streamPrefix: "tes-app",
        logGroup,
      }),
      environment: {
        NODE_ENV: "production",
        PORT: String(props.containerPort),
      },
      secrets: {
        DATABASE_URL: ecs.Secret.fromSecretsManager(appSecret, "DATABASE_URL"),
        SESSION_SECRET: ecs.Secret.fromSecretsManager(appSecret, "SESSION_SECRET"),
        OPENAI_API_KEY: ecs.Secret.fromSecretsManager(appSecret, "OPENAI_API_KEY"),
      },
    });

    container.addPortMappings({
      containerPort: props.containerPort,
      protocol: ecs.Protocol.TCP,
    });

    const service = new ecs.FargateService(this, "Service", {
      cluster,
      taskDefinition,
      desiredCount: props.desiredCount,
      assignPublicIp: true,
      securityGroups: [serviceSecurityGroup],
      vpcSubnets: {
        subnetType: ec2.SubnetType.PUBLIC,
      },
      circuitBreaker: { rollback: true },
    });

    const listener = alb.addListener("HttpListener", {
      port: 80,
      open: true,
    });

    listener.addTargets("EcsTargets", {
      port: props.containerPort,
      protocol: elbv2.ApplicationProtocol.HTTP,
      targets: [service],
      healthCheck: {
        path: props.healthCheckPath,
        protocol: elbv2.Protocol.HTTP,
        healthyHttpCodes: "200-499",
        interval: cdk.Duration.seconds(30),
      },
    });

    new cdk.CfnOutput(this, "AlbDnsName", {
      value: alb.loadBalancerDnsName,
    });

    new cdk.CfnOutput(this, "EcrRepositoryName", {
      value: props.ecrRepoName,
    });

    new cdk.CfnOutput(this, "EcsClusterName", {
      value: cluster.clusterName,
    });

    new cdk.CfnOutput(this, "EcsServiceName", {
      value: service.serviceName,
    });
  }
}

/*
File Purpose:
This file defines the complete AWS ECS hosting stack in a minimal, single-module layout.

Responsibilities:

* Provisions networking, ALB, ECS cluster/service, logging, and app task definition
* Pulls the application image from a fixed ECR repository and injects runtime secrets
* Exposes key stack outputs for operations and troubleshooting

Notes:
This file was extracted from a large file during refactoring to improve maintainability.
No business logic was modified.
*/
