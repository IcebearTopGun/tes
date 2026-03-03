import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as ecr from "aws-cdk-lib/aws-ecr";
import * as ecs from "aws-cdk-lib/aws-ecs";
import * as logs from "aws-cdk-lib/aws-logs";
import * as secretsmanager from "aws-cdk-lib/aws-secretsmanager";
import * as elbv2 from "aws-cdk-lib/aws-elasticloadbalancingv2";

export interface AppServiceProps {
  vpc: ec2.IVpc;
  alb: elbv2.ApplicationLoadBalancer;
  serviceSecurityGroup: ec2.ISecurityGroup;
  repository: ecr.IRepository;
  imageTag: string;
  appSecretId: string;
  containerPort: number;
  desiredCount: number;
  cpu: number;
  memoryMiB: number;
  healthCheckPath: string;
}

export class AppService extends Construct {
  readonly cluster: ecs.Cluster;
  readonly service: ecs.FargateService;

  constructor(scope: Construct, id: string, props: AppServiceProps) {
    super(scope, id);

    this.cluster = new ecs.Cluster(this, "Cluster", {
      vpc: props.vpc,
      containerInsightsV2: ecs.ContainerInsights.ENABLED,
    });

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
      image: ecs.ContainerImage.fromEcrRepository(props.repository, props.imageTag),
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

    this.service = new ecs.FargateService(this, "Service", {
      cluster: this.cluster,
      taskDefinition,
      desiredCount: props.desiredCount,
      assignPublicIp: true,
      securityGroups: [props.serviceSecurityGroup],
      vpcSubnets: {
        subnetType: ec2.SubnetType.PUBLIC,
      },
      circuitBreaker: { rollback: true },
    });

    const listener = props.alb.addListener("HttpListener", {
      port: 80,
      open: true,
    });

    listener.addTargets("EcsTargets", {
      port: props.containerPort,
      protocol: elbv2.ApplicationProtocol.HTTP,
      targets: [this.service],
      healthCheck: {
        path: props.healthCheckPath,
        protocol: elbv2.Protocol.HTTP,
        healthyHttpCodes: "200-499",
        interval: cdk.Duration.seconds(30),
      },
    });
  }
}
