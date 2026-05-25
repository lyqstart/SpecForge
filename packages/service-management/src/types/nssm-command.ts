/**
 * NSSM command representation for Windows service management.
 * Each command is idempotent - calling multiple times has the same effect as once.
 */
export interface NssmCommand {
  /** NSSM subcommand: install / set / remove / start / stop / status */
  subcommand: string;
  /** Argument list (already escaped; caller spawns directly) */
  args: string[];
  /** Whether failure is allowed (idempotent operations like "already exists" can be ignored) */
  allowFailure: boolean;
}