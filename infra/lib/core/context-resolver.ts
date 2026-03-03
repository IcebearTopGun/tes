import * as cdk from "aws-cdk-lib";

export class ContextResolver {
  constructor(private readonly app: cdk.App) {}

  getOptionalString(key: string): string | undefined {
    const value = this.app.node.tryGetContext(key);
    return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
  }

  getRequiredString(key: string, fallback?: string): string {
    const value = this.getOptionalString(key) ?? fallback;
    if (!value) {
      throw new Error(`Missing required context value: ${key}`);
    }
    return value;
  }

  getNumber(key: string, fallback: number): number {
    const raw = this.app.node.tryGetContext(key);
    if (raw === undefined || raw === null || raw === "") {
      return fallback;
    }

    const parsed = Number(raw);
    if (!Number.isFinite(parsed)) {
      throw new Error(`Context value ${key} must be numeric.`);
    }

    return parsed;
  }

  getStringList(key: string, fallback: string[]): string[] {
    const raw = this.getOptionalString(key);
    if (!raw) return fallback;

    const values = raw
      .split(",")
      .map((part) => part.trim())
      .filter((part) => part.length > 0);

    return values.length > 0 ? values : fallback;
  }
}
