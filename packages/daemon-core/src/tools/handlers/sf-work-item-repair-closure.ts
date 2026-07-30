/**
 * sf-work-item-repair-closure — legacy compatibility audit.
 *
 * Public name: sf_work_item_repair_closure.
 *
 * This public tool name is retained for compatibility, but the Runtime no longer
 * creates or requires root-level closure skeletons. It now verifies that the
 * canonical Candidate exists, or that a real authored legacy root artifact is
 * available as a read-only fallback.
 *
 * Boundaries:
 *   - Never creates or overwrites tasks.md / trace_delta.md.
 *   - Never advances workflow state.
 *   - Never modifies code or project truth source (.specforge/project/**).
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
  isWorkItemSpecArtifactPlaceholder,
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

interface RepairTarget {
  file: 'tasks.md' | 'trace_delta.md';
  rootPath: string;
  candidatePath: string;
}

interface RepairOutcome {
  file: string;
  action: 'canonical_present' | 'legacy_present' | 'refused';
  candidate?: string;
  legacy?: string;
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
    },
    {
      file: 'trace_delta.md',
      rootPath: workItemTraceDelta(projectRoot, workItemId),
      candidatePath: workItemCandidateTraceDelta(projectRoot, workItemId),
    },
  ];

  const outcomes: RepairOutcome[] = [];
  let allComplete = true;

  for (const target of targets) {
    if (await isNonEmptyFile(target.candidatePath)) {
      outcomes.push({
        file: target.file,
        action: 'canonical_present',
        candidate: rel(projectRoot, target.candidatePath),
      });
      continue;
    }

    if (await isNonEmptyFile(target.rootPath)) {
      const content = await fs.readFile(target.rootPath, 'utf-8');
      const kind = target.file === 'tasks.md' ? 'tasks' : 'trace_delta';
      if (!isWorkItemSpecArtifactPlaceholder(kind, content)) {
        outcomes.push({
          file: target.file,
          action: 'legacy_present',
          legacy: rel(projectRoot, target.rootPath),
        });
        continue;
      }
    }

    outcomes.push({
      file: target.file,
      action: 'refused',
      reason:
        `canonical candidate missing or empty: ${rel(projectRoot, target.candidatePath)}; ` +
        'no authored legacy fallback is available',
    });
    allComplete = false;
  }

  return {
    success: allComplete,
    work_item_id: workItemId,
    state_changed: false,
    deprecated_repair: true,
    files_written: [],
    canonical_present: outcomes
      .filter((o) => o.action === 'canonical_present')
      .map((o) => o.file),
    legacy_present: outcomes
      .filter((o) => o.action === 'legacy_present')
      .map((o) => o.file),
    refused: outcomes.filter((o) => o.action === 'refused'),
    outcomes,
    note: allComplete
      ? 'Compatibility audit passed. Runtime consumes canonical Candidate artifacts first and wrote no root skeletons.'
      : 'Fail-closed: an authoritative Candidate or real authored legacy fallback is missing. Produce the Candidate via the proper workflow; no root skeleton was written.',
  };
});
