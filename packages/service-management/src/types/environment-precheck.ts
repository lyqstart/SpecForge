/**
 * Platform identifier for environment precheck.
 */
export type Platform = "linux";

/**
 * Precheck issue codes - closed enum of all possible environment issues.
 */
export type PrecheckIssueCode =
  | "PLATFORM_NOT_SUPPORTED"     // macOS or unsupported platform
  | "SYSTEMD_NOT_AVAILABLE"      // Linux: systemd --user unavailable (WSL1, Alpine)
  | "LINGER_NOT_ENABLED"         // Linux: services will be killed after user logout
  | "PORT_IN_USE"                // Daemon HTTP port already occupied
  | "BINARY_MISSING"             // ServiceInstallSpec.binaryPath does not exist
  | "OPENCODE_SERVER_BINARY_MISSING" // opencode not installed
  | "WORKING_DIR_MISSING";       // Working directory does not exist

/**
 * Individual precheck issue with code, message, and suggestion.
 */
export interface PrecheckIssue {
  code: PrecheckIssueCode;
  message: string;
  suggestion: string;
}

/**
 * Environment precheck result.
 * Returned before install to identify blockers and warnings.
 */
export interface EnvironmentPrecheck {
  schema_version: "1.0";
  platform: Platform;

  // Linux fields
  /** Whether systemd --user is available (Linux only, null on Windows) */
  systemdAvailable: boolean | null;
  /** systemd version string (Linux only, null on Windows) */
  systemdVersion: string | null;
  /** Whether linger is enabled (Linux only, null on Windows) */
  lingerEnabled: boolean | null;
  /** systemd user unit directory path (Linux only, null on Windows) */
  systemdUserUnitDir: string | null;

  /** Current username for the user service */
  currentUserName: string | null;

  /** Blocking issues - must be fixed before proceeding */
  blockers: PrecheckIssue[];
  /** Non-blocking warnings - can proceed but should be addressed */
  warnings: PrecheckIssue[];
}
