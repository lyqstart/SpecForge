/**
 * sf-v11-merge — v1.1 Merge Runner handler
 *
 * R2 changes:
 * - returns merge status/reason so Agent can see not_applicable directly.
 */
import { registerHandler } from '../ToolDispatcher';
import { executeMerge } from '../lib/merge-runner-v11';
import * as path from 'node:path';

registerHandler('sf_v11_merge', async (args, context, _deps) => {
  const projectRoot = (context?.directory as string) || (context?.worktree as string) || process.cwd();
  const workItemId = args['work_item_id'] as string;
  if (!workItemId) return { success: false, error: 'work_item_id is required' };

  const workItemDir = path.join(projectRoot, '.specforge', 'work-items', workItemId);
  try {
    const result = await executeMerge({
      projectRoot,
      workItemId,
      workItemDir,
      candidateManifestPath: path.join(workItemDir, 'candidate_manifest.json'),
      userDecisionPath: path.join(workItemDir, 'user_decision.json'),
    });

    return {
      success: result.success,
      status: result.status ?? (result.success ? 'success' : 'failed'),
      reason: result.reason,
      work_item_id: workItemId,
      merged_count: result.merged_files.filter((f) => f.status === 'success').length,
      failed_count: result.merged_files.filter((f) => f.status === 'failed').length,
      spec_manifest_updated: result.spec_manifest_updated,
      project_spec_version: result.project_spec_version,
      errors: result.errors,
    };
  } catch (err: any) {
    return { success: false, status: 'failed', error: err.message };
  }
});
