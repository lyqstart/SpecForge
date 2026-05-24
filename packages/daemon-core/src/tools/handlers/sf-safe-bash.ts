import { registerHandler } from '../ToolDispatcher';
import { safeBashExecute } from '../lib/sf_safe_bash_core';

registerHandler('sf_safe_bash', async (args, context, _deps) => {
  const baseDir = (context?.directory as string) || (context?.worktree as string) || process.cwd();

  const result = await safeBashExecute(
    {
      command: args['command'] as string,
      cwd: args['cwd'] as string | undefined,
      timeoutMs: args['timeoutMs'] as number | undefined,
      env: args['env'] as Record<string, string> | undefined,
      stdin: args['stdin'] as string | undefined,
      outputLimit: args['outputLimit'] as number | undefined,
    },
    baseDir
  );

  return result;
});
