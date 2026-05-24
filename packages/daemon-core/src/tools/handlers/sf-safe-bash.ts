import { registerHandler } from '../ToolDispatcher';

registerHandler('sf_safe_bash', async (_args, _context, _deps) => {
  return { success: false, error: 'not implemented', hint: 'Use the CLI safe-bash command instead' };
});
