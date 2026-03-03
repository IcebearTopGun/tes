import { Construct } from "constructs";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as elbv2 from "aws-cdk-lib/aws-elasticloadbalancingv2";

export interface NetworkProps {
  maxAzs: number;
  appPort: number;
  availabilityZones: string[];
}

export class Network extends Construct {
  readonly vpc: ec2.Vpc;
  readonly alb: elbv2.ApplicationLoadBalancer;
  readonly albSecurityGroup: ec2.SecurityGroup;
  readonly serviceSecurityGroup: ec2.SecurityGroup;

  constructor(scope: Construct, id: string, props: NetworkProps) {
    super(scope, id);

    const baseVpcProps: ec2.VpcProps = {
      natGateways: 0,
      subnetConfiguration: [
        {
          name: "public",
          subnetType: ec2.SubnetType.PUBLIC,
          cidrMask: 24,
        },
      ],
    };

    const vpcProps: ec2.VpcProps =
      props.availabilityZones.length > 0
        ? { ...baseVpcProps, availabilityZones: props.availabilityZones }
        : { ...baseVpcProps, maxAzs: props.maxAzs };

    this.vpc = new ec2.Vpc(this, "Vpc", vpcProps);

    this.albSecurityGroup = new ec2.SecurityGroup(this, "AlbSecurityGroup", {
      vpc: this.vpc,
      description: "Allow inbound HTTP traffic",
      allowAllOutbound: true,
    });
    this.albSecurityGroup.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(80), "HTTP from internet");

    this.serviceSecurityGroup = new ec2.SecurityGroup(this, "ServiceSecurityGroup", {
      vpc: this.vpc,
      description: "Allow ALB traffic to the app service",
      allowAllOutbound: true,
    });

    this.serviceSecurityGroup.addIngressRule(
      this.albSecurityGroup,
      ec2.Port.tcp(props.appPort),
      "Allow ALB to reach app container",
    );

    this.alb = new elbv2.ApplicationLoadBalancer(this, "Alb", {
      vpc: this.vpc,
      internetFacing: true,
      securityGroup: this.albSecurityGroup,
      vpcSubnets: {
        subnetType: ec2.SubnetType.PUBLIC,
      },
    });
  }
}
