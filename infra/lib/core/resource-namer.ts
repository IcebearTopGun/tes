export class ResourceNamer {
  constructor(
    private readonly projectName: string,
    private readonly environment: string,
  ) {}

  stackId(baseName: string): string {
    return `${this.toPascal(baseName)}Stack-${this.environment}`;
  }

  cdkId(resourceName: string): string {
    return `${this.toPascal(resourceName)}${this.toPascal(this.environment)}`;
  }

  physicalName(resourceName: string): string {
    return `${this.normalize(this.projectName)}-${this.normalize(this.environment)}-${this.normalize(resourceName)}`;
  }

  private toPascal(value: string): string {
    return value
      .replace(/[^a-zA-Z0-9]+/g, " ")
      .split(" ")
      .filter(Boolean)
      .map((token) => `${token[0].toUpperCase()}${token.slice(1).toLowerCase()}`)
      .join("");
  }

  private normalize(value: string): string {
    return value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
  }
}
