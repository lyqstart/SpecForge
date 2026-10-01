/**
 * Types consumed by the current package-publish pipeline and version command.
 */

export interface ParsedPackageJson {
  schema_version: "1.0";
  name: string;
  version: string;
  description: string;
  main: string;
  types: string;
  files: string[];
  license: string;
  repository: { type: "git"; url: string };
  engines: { node: ">=20"; bun: ">=1.0" };
  bin?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  private?: boolean;
  keywords?: string[];
  author?: string;
}

export interface ValidationContext {
  packagePath: string;
  mode: "dev" | "publish";
  publishVersionMap: ReadonlyMap<string, string>;
}

export interface ValidationResult {
  isValid: boolean;
  errors: ValidationError[];
  warnings: string[];
}

export interface ValidationError {
  code:
    | "NAME_FORMAT"
    | "MISSING_FIELD"
    | "ENGINES_NODE"
    | "ENGINES_BUN"
    | "WORKSPACE_NOT_REWRITTEN"
    | "DEP_RANGE_FORBIDDEN"
    | "DEP_VERSION_NOT_PINNED"
    | "PUBLISH_BASELINE_DOWNGRADE"
    | "PUBLISH_VALIDATION";
  field: string;
  message: string;
}

export interface VersionInfoPayload {
  schema_version: "1.0";
  cliVersion: string;
  schemaVersionBaseline: string;
  installRoot: string;
  /** Read-only probe of a legacy installation record; null when absent or invalid. */
  installRootSchemaVersion: string | null;
  platform: string;
}
