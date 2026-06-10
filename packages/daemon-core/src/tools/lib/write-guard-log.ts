/**
 * write-guard-log.ts — Write Guard Append-Only Log
 *
 * Provides a persistent, append-only log of all write guard decisions.
 * This log serves as the FACTUAL SOURCE for changed_files_audit:
 * - Every allowed write is logged with path, operation, actor, timestamp
 * - Every blocked write is logged with path, operation, actor, violation, timestamp
 *
 * The log is stored at: .specforge/work-items/{workItemId}/write_guard_log.jsonl
 *
 * This file is the single source of truth for:
 * - What files were actually allowed to be written
 * - What files were blocked (violations)
 * - Who attempted to write what
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface WriteGuardLogEntry {
  timestamp: string;
  path: string;
  operation: 'create' | 'modify' | 'delete';
  actor: string;
  allowed: boolean;
  violations: string[];
  tool?: string;
  command?: string;
}

export interface WriteGuardLogSummary {
  totalEntries: number;
  allowedWrites: WriteGuardLogEntry[];
  blockedWrites: WriteGuardLogEntry[];
  uniqueAllowedPaths: string[];
  uniqueBlockedPaths: string[];
}

// ---------------------------------------------------------------------------
// WriteGuardLog
// ---------------------------------------------------------------------------

const LOG_FILENAME = 'write_guard_log.jsonl';

/**
 * Append a write guard decision to the log.
 * Creates the log file if it doesn't exist.
 */
export function appendWriteGuardLog(
  workItemDir: string,
  entry: WriteGuardLogEntry,
): void {
  const logPath = path.join(workItemDir, LOG_FILENAME);
  const line = JSON.stringify(entry) + '\n';
  try {
    fs.appendFileSync(logPath, line, 'utf-8');
  } catch (err: any) {
    // If directory doesn't exist, try to create it
    if (err.code === 'ENOENT') {
      try {
        fs.mkdirSync(path.dirname(logPath), { recursive: true });
        fs.appendFileSync(logPath, line, 'utf-8');
      } catch {
        // Silent failure — log is best-effort
      }
    }
  }
}

/**
 * Read all entries from the Write Guard log.
 * Returns empty array if log doesn't exist.
 */
export function readWriteGuardLog(workItemDir: string): WriteGuardLogEntry[] {
  const logPath = path.join(workItemDir, LOG_FILENAME);
  try {
    const content = fs.readFileSync(logPath, 'utf-8');
    const lines = content.trim().split('\n').filter(l => l.length > 0);
    return lines.map(line => JSON.parse(line) as WriteGuardLogEntry);
  } catch {
    return [];
  }
}

/**
 * Get a summary of the Write Guard log for audit purposes.
 */
export function summarizeWriteGuardLog(workItemDir: string): WriteGuardLogSummary {
  const entries = readWriteGuardLog(workItemDir);
  const allowedWrites = entries.filter(e => e.allowed);
  const blockedWrites = entries.filter(e => !e.allowed);

  return {
    totalEntries: entries.length,
    allowedWrites,
    blockedWrites,
    uniqueAllowedPaths: [...new Set(allowedWrites.map(e => e.path))],
    uniqueBlockedPaths: [...new Set(blockedWrites.map(e => e.path))],
  };
}

/**
 * Get the factual list of files that were actually written (allowed by Write Guard).
 * This is the TRUTH SOURCE for changed_files_audit — not caller-provided data.
 */
export function getFactualChangedFiles(
  workItemDir: string,
): Array<{ path: string; operation: 'create' | 'modify' | 'delete' }> {
  const entries = readWriteGuardLog(workItemDir);
  const allowed = entries.filter(e => e.allowed);

  // Deduplicate by path (keep latest operation)
  const byPath = new Map<string, 'create' | 'modify' | 'delete'>();
  for (const entry of allowed) {
    byPath.set(entry.path, entry.operation);
  }

  return Array.from(byPath.entries()).map(([p, op]) => ({ path: p, operation: op }));
}
