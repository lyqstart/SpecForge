/**
 * sf-v11-gate-run — v1.1 Gate Runner handler
 *
 * Patch A:
 * - Accept empty gate_ids and expand by workflow_path.
 * - Normalize legacy aliases (all/tasks/verification/close).
 * - Fail-closed on unknown gate IDs instead of producing skipped reports.
 */

import { registerHandler } from '../ToolDispatcher';
import { runRequiredGates } from '../lib/gate-runner-v11';
import type { GateIdV11 } from '../lib/gate-runner-v11';
import { getRequiredGates } from '../lib/required-gates';
import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import { validateWorkItemId } from '../lib/work-item-id-validator';

const VALID_GATE_IDS: readonly GateIdV11[] = [
  'entry_gate',
  'workflow_selection_gate',
  'required_files_gate',
  'candidate_manifest_gate',
  'path_policy_gate',
  'schema_gate',
  'spec_consistency_gate',
  'trace_gate',
  'workflow_specific_gate',
  'gate_summary_gate',
  'merge_ready_gate',
  'post_merge_gate',
  'verification_gate',
  'close_gate',
  'extension_gate',
] as const;

function isGateIdV11(value: string): value is GateIdV11 {
  return (VALID_GATE_IDS as readonly string[]).includes(value);
}

async function readWorkflowPath(workItemDir: string): Promise<string> {
  const candidates = [
    path.join(workItemDir, 'trigger_result.json'),
    path.join(workItemDir, 'work_item.json'),
    path.join(workItemDir, 'candidate_manifest.json'),
  ];

  for (const file of candidates) {
    try {
      const json = JSON.parse(await fs.readFile(file, 'utf-8'));
      const workflowPath = json.workflow_path;
      if (typeof workflowPath === 'string' && workflowPath.length > 0) {
        return workflowPath;
      }
    } catch {
      // try next source
    }
  }

  return 'requirement_change_path';
}

function dedupe<T>(items: T[]): T[] {
  return Array.from(new Set(items));
}

function normalizeGateIds(input: unknown, workflowPath: string): { gateIds: GateIdV11[]; aliasesUsed: string[] } {
  const aliasesUsed: string[] = [];
  const rawIds = Array.isArray(input) && input.length > 0 ? input.map(String) : ['all'];
  const gateIds: GateIdV11[] = [];

  for (const raw of rawIds) {
    switch (raw) {
      case 'all':
        aliasesUsed.push(raw);
        gateIds.push(...getRequiredGates(workflowPath));
        break;
      case 'tasks':
        aliasesUsed.push(raw);
        gateIds.push('required_files_gate', 'candidate_manifest_gate', 'trace_gate');
        break;
      case 'verification':
        aliasesUsed.push(raw);
        gateIds.push('verification_gate');
        break;
      case 'close':
        aliasesUsed.push(raw);
        gateIds.push('close_gate');
        break;
      default:
        if (!isGateIdV11(raw)) {
          throw new Error(
            `UNKNOWN_GATE_ID: ${raw}. Allowed canonical Gate IDs: ${VALID_GATE_IDS.join(', ')}. ` +
              'Legacy aliases accepted only for normalization: all, tasks, verification, close.',
          );
        }
        gateIds.push(raw);
    }
  }

  return { gateIds: dedupe(gateIds), aliasesUsed };
}

registerHandler('sf_v11_gate_run', async (args, context, _deps) => {
  const projectRoot = (context?.directory as string) || (context?.worktree as string) || process.cwd();
  const workItemId = args['work_item_id'] as string;

  const idError = validateWorkItemId(workItemId);
  if (idError) {
    return { success: false, error: idError };
  }

  const workItemDir = path.join(projectRoot, '.specforge', 'work-items', workItemId);

  try {
    await fs.access(workItemDir);
  } catch {
    return { success: false, error: `Work Item directory not found: ${workItemDir}` };
  }

  try {
    const workflowPath = await readWorkflowPath(workItemDir);
    const normalized = normalizeGateIds(args['gate_ids'], workflowPath);

    const ctx = {
      workItemId,
      workItemDir,
      projectRoot,
    };

    const { reports, summaryStatus, summaryPath } = await runRequiredGates(normalized.gateIds, ctx);

    return {
      success: true,
      work_item_id: workItemId,
      workflow_path: workflowPath,
      requested_gate_ids: args['gate_ids'] ?? [],
      normalized_gate_ids: normalized.gateIds,
      aliases_used: normalized.aliasesUsed,
      summary_status: summaryStatus,
      summary_path: path.relative(projectRoot, summaryPath).replace(/\\/g, '/'),
      gate_count: reports.length,
      passed: reports.filter((r) => r.status === 'passed').length,
      failed: reports.filter((r) => r.status === 'failed').length,
      reports: reports.map((r) => ({
        gate_id: r.gate_id,
        status: r.status,
        blocking_issues: r.blocking_issues.length,
        warnings: r.warnings.length,
      })),
    };
  } catch (err: any) {
    return {
      success: false,
      error: err.message,
      work_item_id: workItemId,
    };
  }
});
