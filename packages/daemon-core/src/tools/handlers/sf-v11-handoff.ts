/**
 * sf-v11-handoff — §14.3 Agent handoff validation handler
 */
import { registerHandler } from '../ToolDispatcher';
import {
  validateHandoff,
  writeHandoff,
  validateAllHandoffs,
} from '../lib/agent-handoff-v11';
import type { AgentHandoff } from '../lib/agent-handoff-v11';
import * as path from 'node:path';

registerHandler('sf_v11_handoff', async (args, context, _deps) => {
  const projectRoot = (context?.directory as string) || (context?.worktree as string) || process.cwd();
  const action = (args['action'] as string) || 'validate';

  try {
    if (action === 'validate') {
      const handoff = args['handoff'];
      if (!handoff) {
        return { success: false, error: 'handoff object is required' };
      }
      const result = validateHandoff(handoff);
      return { success: true, action: 'validate', ...result };
    }

    if (action === 'write') {
      const handoff = args['handoff'] as AgentHandoff;
      const workItemId = args['work_item_id'] as string;
      if (!handoff || !workItemId) {
        return { success: false, error: 'handoff and work_item_id are required' };
      }

      // Validate before writing
      const validation = validateHandoff(handoff);
      if (!validation.valid) {
        return { success: false, error: `Handoff validation failed: ${validation.errors.join('; ')}` };
      }

      const wiDir = path.join(projectRoot, '.specforge', 'work-items', workItemId);
      const filePath = await writeHandoff(wiDir, handoff);
      return { success: true, action: 'write', path: filePath };
    }

    if (action === 'validate_all') {
      const workItemId = args['work_item_id'] as string;
      if (!workItemId) {
        return { success: false, error: 'work_item_id is required' };
      }
      const wiDir = path.join(projectRoot, '.specforge', 'work-items', workItemId);
      const result = await validateAllHandoffs(wiDir);
      return { success: true, action: 'validate_all', ...result };
    }

    return { success: false, error: `Unknown action: ${action}. Use 'validate', 'write', or 'validate_all'.` };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
});
