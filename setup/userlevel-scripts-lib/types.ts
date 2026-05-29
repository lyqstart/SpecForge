/**
 * Shared types for sync-task-status.
 *
 * schema_version: 1.0
 * Derived-From: v6-architecture-overview REQ-18 (schema_version 单调)
 */

import { z } from 'zod';

// --- Kiro task meta schema ---
// Mirrors the shape Kiro writes to ~/.kiro/tasks/<hash>/<spec>.meta.json.
// See kiro.kiro-agent/dist/extension.js:363685 writeMetadataFile.

export const ExecutionStatusSchema = z.enum([
  'queued',
  'running',
  'succeed',
  'failed',
  'aborted',
]);
export type ExecutionStatus = z.infer<typeof ExecutionStatusSchema>;

export const ExecutionHistoryEntrySchema = z.object({
  chatSessionId: z.string(),
  executionId: z.string(),
  timestamp: z.number(),
});

export const TaskMetaEntrySchema = z.object({
  createdAt: z.number(),
  updatedAt: z.number(),
  taskId: z.string(),
  specUri: z.string(),
  executionHistory: z.array(ExecutionHistoryEntrySchema),
  executionStatus: ExecutionStatusSchema.optional(),
});
export type TaskMetaEntry = z.infer<typeof TaskMetaEntrySchema>;

export const MetaFileSchema = z.object({
  tasks: z.record(z.string(), TaskMetaEntrySchema),
});
export type MetaFile = z.infer<typeof MetaFileSchema>;

// --- PBT (Property-Based Test) metadata schema ---
// Mirrors the shape Kiro writes to <repo>/.kiro/specs/<spec>/tasks.meta.json
// via its `update_pbt_status` tool. See kiro.kiro-agent/dist/extension.js:
//   - function i34: returns `{ pbtResults: {}, executionHistory: {} }`
//   - l30 class loadMetadata/saveMetadata uses a30(tasksPath) which maps
//     `tasks.md` → `tasks.meta.json` in the same directory.
// The `executionHistory` field on this file is separate from the one in
// `~/.kiro/tasks/<hash>/<spec>.meta.json` and keyed by taskId.

export const PbtPublicStatusSchema = z.enum([
  'passed',
  'failed',
  'unexpected_pass',
]);
export type PbtPublicStatus = z.infer<typeof PbtPublicStatusSchema>;

export const PbtResultEntrySchema = z.object({
  status: PbtPublicStatusSchema,
  failingExample: z.string().optional(),
  lastRunTimestamp: z.number(),
});
export type PbtResultEntry = z.infer<typeof PbtResultEntrySchema>;

export const TasksMetaFileSchema = z.object({
  pbtResults: z.record(z.string(), PbtResultEntrySchema).default({}),
  executionHistory: z
    .record(z.string(), z.array(ExecutionHistoryEntrySchema))
    .default({}),
});
export type TasksMetaFile = z.infer<typeof TasksMetaFileSchema>;

// --- CLI input schemas ---

/**
 * Public-facing status aliases accepted from the CLI.
 * We map them onto Kiro's internal statuses.
 */
export const PublicStatusSchema = z.enum([
  'completed',
  'in_progress',
  'queued',
  'failed',
  'aborted',
  'not_started',
]);
export type PublicStatus = z.infer<typeof PublicStatusSchema>;

export function publicToInternal(status: PublicStatus): ExecutionStatus | undefined {
  switch (status) {
    case 'completed':
      return 'succeed';
    case 'in_progress':
      return 'running';
    case 'queued':
      return 'queued';
    case 'failed':
      return 'failed';
    case 'aborted':
      return 'aborted';
    case 'not_started':
      return undefined; // Kiro treats missing executionStatus as not-started
  }
}

export function internalToPublic(status: ExecutionStatus | undefined): PublicStatus {
  switch (status) {
    case 'succeed':
      return 'completed';
    case 'running':
      return 'in_progress';
    case 'queued':
      return 'queued';
    case 'failed':
      return 'failed';
    case 'aborted':
      return 'aborted';
    case undefined:
      return 'not_started';
  }
}

// --- Batch file schema ---

export const BatchEntrySchema = z.object({
  spec: z.string(),
  taskId: z.string(),
  status: PublicStatusSchema,
});
export type BatchEntry = z.infer<typeof BatchEntrySchema>;

export const BatchFileSchema = z.object({
  schema_version: z.literal('1.0').optional().default('1.0'),
  entries: z.array(BatchEntrySchema).min(1),
});
export type BatchFile = z.infer<typeof BatchFileSchema>;


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
}

/** User-level manifest (specforge-manifest.json) */
export interface UserLevelManifest {
  schema_version: string
  shared_version: string
  install_mode: "user_level" | "project_level"
  installed_at: string
  updated_at: string
  managed_agents: string[]
  managed_agent_hashes: Record<string, string>
  files: Record<string, FileEntry>
  pending_deletes?: PendingDeleteEntry[]
}

/** Project-level manifest (specforge/manifest.json) */
export interface ProjectLevelManifest {
  schema_version: string
  install_mode: "user_level" | "project_level"
  required_shared_version_range?: string
  initialized_at?: string
  updated_at?: string
}

/** Runtime manifest (specforge/runtime-manifest.json) */
export interface RuntimeManifest {
  schema_version: string
  runtime_schema_version: string
  install_mode: string
  required_shared_version_range: string
  initialized_at: string
  updated_at: string
  project_files: Record<string, { sha256: string; size: number }>
  recovery_required?: boolean
  last_migration?: {
    from_version: string
    to_version: string
    migrated_at: string
  }
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

/** Lock file content */
export interface LockContent {
  lock_id: string
  pid: number
  hostname: string
  command: string
  created_at: string
  last_heartbeat: string
}

/** Install lock info (legacy install_lock.ts) */
export interface InstallLockInfo {
  lock_id: string
  pid: number
  hostname: string
  command: string
  created_at: string
  last_heartbeat: string
}

/** CLI options parsed from argv */
export interface CLIOptions {
  subcommand: "install" | "upgrade" | "uninstall" | "verify" | null
  force: boolean
  showVersion: boolean
}
