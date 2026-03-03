export const DEPLOYMENT_DEFAULTS = {
  projectName: "tes",
  envName: "prod",
  region: "us-east-1",
  ecrRepoName: "tes-app",
  imageTag: "latest",
  containerPort: 5000,
  desiredCount: 1,
  cpu: 512,
  memoryMiB: 1024,
  maxAzs: 2,
  healthCheckPath: "/api/admin/stats",
} as const;
