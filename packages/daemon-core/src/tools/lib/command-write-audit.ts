/**
 * command-write-audit.ts — Audit write operations triggered by commands
 *
 * Extracted from write-guard-v11.ts for write-guard domain.
 * Imports from write-policy.
 */

import type { WritePolicyContext } from './write-guard-v11.js';
import { evaluatePolicy } from './write-guard-v11.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CommandWriteAuditEntry {
  command: string;
  targetPath: string;
  operation: 'create' | 'modify' | 'delete';
  allowed: boolean;
  violation: string | null;
}

export interface CommandWriteAuditResult {
  passed: boolean;
  entries: CommandWriteAuditEntry[];
  violations: string[];
}

// ---------------------------------------------------------------------------
// auditCommandWrite
// ---------------------------------------------------------------------------

/**
 * Audit a batch of write operations that would be triggered by a command.
 *
 * Each entry is checked against the write policy rules; the result includes
 * per-entry and aggregate pass/fail information.
 */
export function auditCommandWrite(
  ctx: WritePolicyContext,
  writes: Array<{ command: string; targetPath: string; operation: 'create' | 'modify' | 'delete' }>,
): CommandWriteAuditResult {
  const entries: CommandWriteAuditEntry[] = [];
  const violations: string[] = [];

  for (const write of writes) {
    const result = evaluatePolicy(ctx, write.targetPath, write.operation);
    const entry: CommandWriteAuditEntry = {
      command: write.command,
      targetPath: write.targetPath,
      operation: write.operation,
      allowed: result.allowed,
      violation: result.violations.length > 0 ? result.violations[0]! : null,
    };
    entries.push(entry);

    if (!result.allowed) {
      violations.push(...result.violations);
    }
  }

  return {
    passed: violations.length === 0,
    entries,
    violations,
  };
}
