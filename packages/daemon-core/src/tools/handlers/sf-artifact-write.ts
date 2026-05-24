import path from 'path';
import { registerHandler } from '../ToolDispatcher';
import { writeArtifact } from '../lib/sf_artifact_write_core';

registerHandler('sf_artifact_write', async (args, context, _deps) => {
  const baseDir = (context?.directory as string) || (context?.worktree as string) || process.cwd();

  const result = await writeArtifact(
    {
      work_item_id: args['work_item_id'] as string,
      file_type: args['file_type'] as any,
      content: args['content'] as string,
      run_id: args['run_id'] as string | undefined,
      template: args['template'] as any,
      agent_content: args['agent_content'] as string | undefined,
    },
    baseDir
  );

  return result;
});
