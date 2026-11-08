import { registerHandler } from '../ToolDispatcher';
import { checkRequirementsGate } from '../lib/sf_requirements_gate_core';

registerHandler('sf_requirements_gate', async (args, context, _deps) => {
  if(args['gate_mode']!==undefined||(args['mode']!==undefined&&args['mode']!=='standard'))return {success:false,error:'REQUIREMENTS_GATE_MODE_NOT_CURRENT'};
  const workItemId = args['work_item_id'] as string;
  if (!workItemId) {
    return { success: false, error: 'work_item_id required' };
  }

  const baseDir = (context?.directory as string) || (context?.worktree as string) || process.cwd();

  try {
    const result = await checkRequirementsGate(workItemId, baseDir);
    return { success: true, ...result };
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
});
