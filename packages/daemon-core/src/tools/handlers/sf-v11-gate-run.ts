/**
 * sf-v11-gate-run — v1.1 Gate Runner handler
 *
 * 运行指定 Gate 列表并生成 Gate Reports + Gate Summary。
 */
import { registerHandler } from '../ToolDispatcher';
import { runRequiredGates } from '../lib/gate-runner-v11';
import type { GateIdV11 } from '../lib/gate-runner-v11';
import * as path from 'node:path';

registerHandler('sf_v11_gate_run', async (args, context, deps) => {
  const projectRoot = (context?.directory as string) || (context?.worktree as string) || process.cwd();
  const workItemId = args['work_item_id'] as string;
  const gateIds = args['gate_ids'] as string[];

  if (!workItemId || !gateIds || !Array.isArray(gateIds)) {
    return { success: false, error: 'work_item_id and gate_ids[] are required' };
  }

  const workItemDir = path.join(projectRoot, '.specforge', 'work-items', workItemId);

  // Verify WI directory exists
  try {
    const { access } = await import('node:fs/promises');
    await access(workItemDir);
  } catch {
    return { success: false, error: `Work Item directory not found: ${workItemDir}` };
  }

  try {
    const ctx = {
      workItemId,
      workItemDir,
      projectRoot,
    };

    const { reports, summaryStatus, summaryPath } = await runRequiredGates(
      gateIds as GateIdV11[],
      ctx,
    );

    return {
      success: true,
      work_item_id: workItemId,
      summary_status: summaryStatus,
      gate_count: reports.length,
      passed: reports.filter(r => r.status === 'passed').length,
      failed: reports.filter(r => r.status === 'failed').length,
      reports: reports.map(r => ({
        gate_id: r.gate_id,
        status: r.status,
        blocking_issues: r.blocking_issues.length,
      })),
    };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
});
