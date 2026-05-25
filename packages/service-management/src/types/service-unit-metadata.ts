/**
 * Metadata embedded in the header comment block of generated unit files.
 * Provides versioning and diagnostic information.
 */
export interface ServiceUnitMetadata {
  schema_version: "1.0";
  /** "specforge-service-management" + package version */
  generatedBy: string;
  /** ISO 8601 UTC timestamp */
  generatedAt: string;
  /** The specforge version when this unit was installed */
  specforgeVersion: string;
  /** Service name (matches unit file name / NSSM service name) */
  serviceName: string;
  /** Binary absolute path (for diagnostics: "is binary still there?") */
  binaryPath: string;
}