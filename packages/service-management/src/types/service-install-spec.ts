/**
 * Service installation specification.
 * Contains all configuration needed to install a service with systemd or NSSM.
 */
export interface ServiceInstallSpec {
  /** Service name (OS-visible identifier, e.g., specforge-daemon) */
  name: string;
  /** Display name / description */
  description: string;
  /** Absolute path to executable */
  binaryPath: string;
  /** Startup arguments */
  args: string[];
  /** Working directory absolute path */
  workingDirectory: string;
  /** Environment variables (override defaults) */
  environment: Record<string, string>;
  /** Other service names this service depends on (startup order guarantee) */
  dependsOn: string[];
  /** Restart policy on failure */
  restartPolicy: "no" | "on-failure" | "always";
  /** Graceful shutdown timeout in seconds, after which force kill */
  stopTimeoutSec: number;
  /** stdout log output path (absolute) */
  stdoutLogPath: string;
  /** stderr log output path (absolute) */
  stderrLogPath: string;
  /** Whether to enable (auto-start) at boot time during install */
  enableAtBoot: boolean;
}