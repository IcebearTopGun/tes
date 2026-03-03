import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";

interface TagPolicyProps {
  projectName: string;
  envName: string;
  managedBy?: string;
}

export class InfrastructureTagPolicy {
  static apply(scope: Construct, props: TagPolicyProps) {
    cdk.Tags.of(scope).add("Project", props.projectName);
    cdk.Tags.of(scope).add("Environment", props.envName);
    cdk.Tags.of(scope).add("ManagedBy", props.managedBy ?? "cdk");
  }
}
