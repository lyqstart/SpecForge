// =============================================================================
// Installer types (sf-installer.ts + scripts/lib/*.ts)
// These were missing from this file, causing "Export named X not found" errors.
// =============================================================================

/** Supported manifest schema versions */
export const SUPPORTED_SCHEMA_VERSIONS = ["1.0", "1.1", "1.2", "2.0"] as const
export type SupportedSchemaVersion = typeof SUPPORTED_SCHEMA_VERSIONS[number]

/** Component types managed by the installer */
export type ManagedComponentType =
  | "agent"
  | "tool"
  | "tool_lib"
  | "plugin"
  | "skill"
  | "workflow"
  | "runtime"
  | "config"
  | "template"
  | "other"

/** Returns true if the component type allows user customization (conflict detection) */
export function isCustomizable(type: ManagedComponentType): boolean {
  return type === "agent" || type === "skill"
}

/** A single file entry in the user-level manifest */
export interface FileEntry {
  sha256: string
  size: number
  type: ManagedComponentType
}

/** Agent configuration stored in the manifest */
export interface AgentConfig {
  mode: "primary" | "subagent" | "all"
  model?: string
  temperature?: number
  steps?: number
  description?: string
  permission?: Record<string, string | Record<string, string>>
  prompt?: string
  hidden?: boolean
  color?: string
  top_p?: number
  disable?: boolean
  [key: string]: unknown
}

/** A component entry in the shared component registry */
export interface ComponentEntry {
  path: string
  type: ManagedComponentType
  /** Repository-relative source; defaults to setup/userlevel-opencode/<path>. */
  sourcePath?: string
  /** Append the platform executable suffix (for example .exe on Windows). */
  platformExecutable?: boolean
}

/** User-level manifest (specforge-manifest.json) */
export interface UserLevelManifest {
  schema_version: string
  shared_version: string
  install_mode: "user_level"
  installed_at: string
  updated_at: string
  managed_agents: string[]
  managed_agent_hashes: Record<string, string>
  files: Record<string, FileEntry>
  pending_deletes?: PendingDeleteEntry[]
}

/** An entry pending deletion (orphan cleanup) */
export interface PendingDeleteEntry {
  relativePath: string
  componentType: ManagedComponentType
  manifestHash: string
  scheduledAt: string
}

/** A single entry in the current state (filesystem scan result) */
export interface CurrentStateEntry {
  relativePath: string
  currentHash: string
  size: number
  componentType: ManagedComponentType
}

/** A single entry in the desired state (source directory scan result) */
export interface DesiredStateEntry {
  relativePath: string
  sourceHash: string
  size: number
  componentType: ManagedComponentType
}

/** Input to the R14 decision matrix */
export interface FileReconcileInput {
  relativePath: string
  sourceHash: string | undefined
  currentHash: string | undefined
  manifestHash: string | undefined
  componentType: ManagedComponentType
  isManagedComponent: boolean
}

/** Possible reconcile actions */
export type DecisionAction =
  | "create"
  | "update"
  | "delete"
  | "skip"
  | "conflict"
  | "ignore"
  | "none"

/** Executable actions (subset of DecisionAction that require file I/O) */
export type ExecutableAction = "create" | "update" | "delete"

/** Result of the R14 decision matrix for a single file */
export interface FileDecision {
  relativePath: string
  decision: DecisionAction
  componentType: ManagedComponentType
  reason: string
  tamperWarning?: boolean
}

/** A single entry in the reconcile plan */
export interface PlanEntry {
  relativePath: string
  action: ExecutableAction | "skip" | "conflict" | "ignore" | "none"
  componentType: ManagedComponentType
  reason: string
  tamperWarning?: boolean
  sourceHash?: string
  currentHash?: string
  manifestHash?: string
}

/** Summary statistics for a reconcile plan */
export interface PlanSummary {
  total: number
  create: number
  update: number
  delete: number
  skip: number
  conflict: number
  ignore: number
  none: number
}

/** Diagnostics attached to a reconcile plan */
export interface PlanDiagnostics {
  tamperWarnings: string[]
  conflicts: string[]
}

/** A complete reconcile plan */
export interface ReconcilePlan {
  entries: PlanEntry[]
  summary: PlanSummary
  diagnostics: PlanDiagnostics
}

/** Scope of a reconcile operation */
export type ReconcileScope = "user_shared" | "project_runtime"

/** Result of executing a reconcile plan */
export interface ExecutionResult {
  success: boolean
  created: string[]
  updated: string[]
  deleted: string[]
  failed: Array<{ relativePath: string; error: string }>
  skipped: string[]
  conflicts: string[]
}

/** Current installer lock file contract */
export interface InstallLockInfo {
  schema_version: "1.0"
  lock_id: string
  pid: number
  hostname: string
  command: "install" | "upgrade" | "uninstall"
  acquired_at: string
  last_heartbeat: string
}

/** CLI options parsed from argv */
export interface CLIOptions {
  subcommand: "install" | "upgrade" | "uninstall" | "verify" | null
  force: boolean
  showVersion: boolean
}
