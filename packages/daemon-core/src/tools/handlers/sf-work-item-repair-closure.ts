/**
 * sf-work-item-repair-closure — repair a Work Item's missing root-level
 * closure-skeleton files (tasks.md / trace_delta.md).
 *
 * Public name: sf_work_item_repair_closure.
 *
 * Why this exists:
 *   Work Items created through the legacy sf_state_transition create path (before
 *   the fix that calls initializeClosureFiles) never received their root-level
 *   closure skeleton. close_gate requires tasks.md and trace_delta.md to exist at
 *   the Work Item root, so such Work Items can never be closed even though the
 *   authoritative content lives under candidates/.
 *
 * Fail-closed guarantee (evidence-based):
 *   The root-level tasks.md / trace_delta.md are lifecycle SKELETON markers, not
 *   the source of authoritative content — the real task breakdown and trace delta
 *   live in candidates/tasks.md and candidates/trace_delta.md and are validated by
 *   the gates. This tool therefore only restores a root marker when the
 *   corresponding authoritative candidate artifact exists and is non-empty. If the
 *   candidate is missing/empty, the tool REFUSES to create the marker (fail-closed)
 *   and reports the gap, so it can never fabricate closure for a genuinely
 *   incomplete Work Item.
 *
 * Boundaries:
 *   - Never overwrites an existing root file (create-if-missing / idempotent).
 *   - Never advances workflow state.
 *   - Never modifies code or project truth source (.specforge/project/**).
 *   - Only ever writes tasks.md / trace_delta.md inside the target Work Item root.
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { registerHandler } from '../ToolDispatcher';
import {
  workItemRoot,
  workItemTasks,
  workItemTraceDelta,
  workItemCandidateTasks,
  workItemCandidateTraceDelta,
} from '@specforge/types/directory-layout';

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function isNonEmptyFile(filePath: string): Promise<boolean> {
  try {
    const stat = await fs.stat(filePath);
    if (!stat.isFile()) return false;
    const content = await fs.readFile(filePath, 'utf-8');
    return content.trim().length > 0;
  } catch {
    return false;
  }
}

function rel(projectRoot: string, filePath: string): string {
  return path.relative(projectRoot, filePath).replace(/\\/g, '/');
}

function tasksSkeleton(workItemId: string): string {
  return [
    '# Tasks',
    '',
    `Work Item: ${workItemId}`,
    '',
    '> Closure-skeleton marker restored by sf_work_item_repair_closure.',
    '>',
    '> The authoritative task breakdown for this Work Item lives in',
    '> candidates/tasks.md and was validated by the Tasks Gate. This root-level',
    '> file is the lifecycle skeleton that close_gate checks for structural',
    '> completeness; it is intentionally not the source of task content.',
    '',
  ].join('\n');
}

function traceDeltaSkeleton(workItemId: string): string {
  return [
    '# Trace Delta',
    '',
    `Work Item: ${workItemId}`,
    '',
    'Trace Impact: recorded in candidates/trace_delta.md',
    '',
    '> Closure-skeleton marker restored by sf_work_item_repair_closure.',
    '>',
    '> The authoritative trace delta lives in candidates/trace_delta.md, was',
    '> validated by the gates, and is merged into',
    '> .specforge/project/trace_matrix.md. This root-level file is the lifecycle',
    '> skeleton that close_gate checks for structural completeness.',
    '',
  ].join('\n');
}

interface RepairTarget {
  file: 'tasks.md' | 'trace_delta.md';
  rootPath: string;
  candidatePath: string;
  skeleton: string;
}

interface RepairOutcome {
  file: string;
  action: 'present' | 'repaired' | 'refused';
  candidate?: string;
  reason?: string;
}

registerHandler('sf_work_item_repair_closure', async (args, context) => {
  const projectRoot =
    (context?.directory as string) || (context?.worktree as string) || process.cwd();
  const workItemId = args['work_item_id'] as string;

  if (!workItemId) {
    return { success: false, error: 'work_item_id is required' };
  }

  const wiDir = workItemRoot(projectRoot, workItemId);
  const workItemJsonPath = path.join(wiDir, 'work_item.json');
  if (!(await pathExists(workItemJsonPath))) {
    return {
      success: false,
      work_item_id: workItemId,
      error: `work_item.json not found at ${rel(projectRoot, workItemJsonPath)} — refusing to repair an unknown Work Item`,
      code: 'WORK_ITEM_NOT_FOUND',
    };
  }

  const targets: RepairTarget[] = [
    {
      file: 'tasks.md',
      rootPath: workItemTasks(projectRoot, workItemId),
      candidatePath: workItemCandidateTasks(projectRoot, workItemId),
      skeleton: tasksSkeleton(workItemId),
    },
    {
      file: 'trace_delta.md',
      rootPath: workItemTraceDelta(projectRoot, workItemId),
      candidatePath: workItemCandidateTraceDelta(projectRoot, workItemId),
      skeleton: traceDeltaSkeleton(workItemId),
    },
  ];

  const outcomes: RepairOutcome[] = [];
  let allComplete = true;

  for (const target of targets) {
    // Idempotent: never overwrite an existing root file.
    if (await pathExists(target.rootPath)) {
      outcomes.push({ file: target.file, action: 'present' });
      continue;
    }

    // Fail-closed: only restore the marker when the authoritative candidate
    // artifact exists and is non-empty.
    if (await isNonEmptyFile(target.candidatePath)) {
      await fs.mkdir(path.dirname(target.rootPath), { recursive: true });
      await fs.writeFile(target.rootPath, target.skeleton, 'utf-8');
      outcomes.push({
        file: target.file,
        action: 'repaired',
        candidate: rel(projectRoot, target.candidatePath),
      });
    } else {
      outcomes.push({
        file: target.file,
        action: 'refused',
        reason: `authoritative candidate missing or empty: ${rel(projectRoot, target.candidatePath)}`,
      });
      allComplete = false;
    }
  }

  return {
    success: allComplete,
    work_item_id: workItemId,
    state_changed: false,
    repaired: outcomes.filter((o) => o.action === 'repaired').map((o) => o.file),
    present: outcomes.filter((o) => o.action === 'present').map((o) => o.file),
    refused: outcomes.filter((o) => o.action === 'refused'),
    outcomes,
    note: allComplete
      ? 'Root closure skeleton for tasks.md and trace_delta.md is complete.'
      : 'Fail-closed: some root markers were not restored because their authoritative candidate artifact is missing or empty. Produce the candidate via the proper workflow before closing.',
  };
});
