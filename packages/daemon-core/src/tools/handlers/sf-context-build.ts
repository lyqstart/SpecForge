import { registerHandler } from '../ToolDispatcher';
import { buildContext } from '../lib/sf_context_build_core';

registerHandler('sf_context_build', async (args, context, _deps) => {
  const workItemId = args['work_item_id'] as string;
  if (!workItemId) {
    return { success: false, error: 'work_item_id required' };
  }

  const baseDir = (context?.directory as string) || (context?.worktree as string) || process.cwd();

  try {
    let targetFiles: string[] | undefined;
    const rawTargetFiles = args['target_files'];
    if (rawTargetFiles !== undefined) {
      if (typeof rawTargetFiles !== 'string') {
        throw new Error('target_files must be a JSON array of strings');
      }
      let parsed: unknown;
      try {
        parsed = JSON.parse(rawTargetFiles);
      } catch {
        throw new Error('target_files must be valid JSON');
      }
      if (
        !Array.isArray(parsed) ||
        !parsed.every((item) => typeof item === 'string' && item.trim().length > 0)
      ) {
        throw new Error('target_files must be a JSON array of non-empty strings');
      }
      targetFiles = Array.from(new Set(parsed.map((item) => item.trim())));
    }

    const result = await buildContext(
      workItemId,
      args['task_id'] as string | undefined,
      args['phase'] as string | undefined,
      (args['include_capabilities'] as boolean) ?? false,
      baseDir,
      {
        task_description: args['task_description'] as string | undefined,
        workflow_type: args['workflow_type'] as string | undefined,
        target_files: targetFiles,
      }
    );
    return result;
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
});
