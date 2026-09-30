/**
 * Map meta.json executionStatus → tasks.md checkbox state.
 *
 * Kiro uses three on-disk checkbox marks:
 *   [ ] not started
 *   [-] in progress / aborted / failed
 *   [x] completed
 *
 * This module reads tasks.md, finds each task by its id (e.g. "1.2" or
 * "4.3 Implement event schema") and updates the mark without disturbing
 * the rest of the file.
 *
 * schema_version: 1.0
 */

import * as fs from 'node:fs/promises';
import { atomicWriteWindowsSafe } from './meta-store';
import { ExecutionStatus } from './types';

export type CheckboxMark = ' ' | '-' | 'x';

/**
 * Map meta executionStatus to a tasks.md checkbox mark.
 *
 * Design note: the checkbox expresses "is this task achieved?" (boolean
 * truth about the outcome) while meta.executionStatus records "what
 * happened on the most recent execution attempt" (mechanical state).
 * These do not always correspond 1:1 — a task can be `[x]` in tasks.md
 * (developer says it's done) while meta shows `failed` or `aborted`
 * because the last run was interrupted before success was recorded.
 *
 * We therefore use a minimal mapping:
 *   succeed  → [x]
 *   running  → [-]
 *   anything else → [ ]
 *
 * Callers of syncTasksMd should combine this with `shouldUpgrade` to
 * implement a safe "upgrade-only" sync that never demotes an [x].
 */
export function statusToMark(status: ExecutionStatus | undefined): CheckboxMark {
  switch (status) {
    case 'succeed':
      return 'x';
    case 'running':
      return '-';
    default:
      return ' ';
  }
}

/**
 * Rank of a checkbox mark. Higher means "more achieved".
 * Used to gate monotone upgrades during sync.
 */
function markRank(mark: CheckboxMark): number {
  switch (mark) {
    case 'x':
      return 2;
    case '-':
      return 1;
    case ' ':
    default:
      return 0;
  }
}

/**
 * True if `desired` is strictly higher than `current` on the
 * monotone lattice (empty → in-progress → done). This lets `sync`
 * promote `[ ]` → `[-]` → `[x]` without ever demoting a developer's
 * explicit `[x]` back down just because a stale meta says otherwise.
 */
export function shouldUpgrade(current: CheckboxMark, desired: CheckboxMark): boolean {
  return markRank(desired) > markRank(current);
}

export interface CheckboxLine {
  lineNumber: number;
  indent: string;
  mark: CheckboxMark;
  taskPrefix: string; // e.g. "1.2" or "4.3"
  textAfter: string; // what comes after the task id
  rawLine: string;
}

/**
 * Parse tasks.md and return every `- [x] N.M ...` line.
 * Task id is the leading dotted number sequence (e.g. `1.2` or `4.3`).
 *
 * We accept both `1.2` and `1.` patterns (the latter appears in specs
 * that use single-digit parent numbering like `v6-architecture-overview`).
 * The matched prefix is normalised by stripping any trailing dot.
 */
export function findCheckboxLines(content: string): CheckboxLine[] {
  const lines = content.split(/\r?\n/);
  // Allow trailing dot after the number (e.g. "2." or "2.3.") and accept
  // either whitespace, a dot, or end-of-line as the delimiter.
  const re = /^(\s*)-\s*\[([ xX\-])\]\s+(\d+(?:\.\d+)*)(\.?)(\s.*)?$/;
  const out: CheckboxLine[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const m = re.exec(line);
    if (!m) continue;
    // The "raw" id in the file may include a trailing dot; keep that as
    // part of the text so rewriting preserves the original layout, but
    // expose a dot-free prefix for matching.
    const numericPart = m[3]!;
    const trailingDot = m[4] ?? '';
    const rest = m[5] ?? '';
    out.push({
      lineNumber: i,
      indent: m[1] ?? '',
      mark: (m[2] === 'X' ? 'x' : (m[2] as CheckboxMark)),
      taskPrefix: numericPart,
      textAfter: trailingDot + rest,
      rawLine: line,
    });
  }
  return out;
}

/**
 * Given a map of `taskPrefix → target mark`, rewrite tasks.md lines in
 * place. Returns the new content and the number of lines changed.
 *
 * Task ids in the map may be either a bare prefix (`4.3`) or the full
 * Kiro task id (`4.3 Implement event schema`); we match on the prefix.
 */
export function applyCheckboxUpdates(
  content: string,
  updates: Map<string, CheckboxMark>,
): { content: string; changed: number } {
  const lines = content.split(/\r?\n/);
  const re = /^(\s*-\s*\[)([ xX\-])(\]\s+)(\d+(?:\.\d+)*)(\.?)(\s.*)?$/;

  // Normalise map keys to bare prefixes (digits and dots only, no trailing dot).
  const byPrefix = new Map<string, CheckboxMark>();
  for (const [k, v] of updates) {
    const m = /^\d+(?:\.\d+)*/.exec(k);
    const prefix = (m ? m[0] : k).replace(/\.+$/, '');
    byPrefix.set(prefix, v);
  }

  let changed = 0;
  for (let i = 0; i < lines.length; i++) {
    const m = re.exec(lines[i]!);
    if (!m) continue;
    const prefix = m[4]!;
    const desired = byPrefix.get(prefix);
    if (!desired) continue;
    const current = m[2] === 'X' ? 'x' : (m[2] as CheckboxMark);
    if (current === desired) continue;
    lines[i] = `${m[1]}${desired}${m[3]}${prefix}${m[5] ?? ''}${m[6] ?? ''}`;
    changed++;
  }

  return { content: lines.join('\n'), changed };
}

/**
 * Read a tasks.md file, apply updates, write it back using the
 * Windows-safe atomic writer (same as for meta files).
 */
export async function syncTasksMd(
  tasksMdPath: string,
  updates: Map<string, CheckboxMark>,
): Promise<number> {
  if (updates.size === 0) return 0;
  const raw = await fs.readFile(tasksMdPath, 'utf-8');
  const { content, changed } = applyCheckboxUpdates(raw, updates);
  if (changed === 0) return 0;
  await atomicWriteWindowsSafe(tasksMdPath, content);
  return changed;
}
