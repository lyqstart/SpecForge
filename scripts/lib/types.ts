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
