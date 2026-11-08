import { registerHandler } from '../ToolDispatcher';
import { batchVerify } from '../lib/sf_batch_verify_core';

registerHandler('sf_batch_verify', async (args, context, _deps) => {
  const targetFile = args['target_file'] as string;
  if (!targetFile) {
    return { success: false, error: 'target_file required' };
  }

  const baseDir = (context?.directory as string) || (context?.worktree as string) || process.cwd();
  const checks = args['checks'] as Array<{ name: string; pattern: string; should_exist: boolean; count?: number }>;

  try {
    return await batchVerify(targetFile, checks ?? [], baseDir);
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
});
