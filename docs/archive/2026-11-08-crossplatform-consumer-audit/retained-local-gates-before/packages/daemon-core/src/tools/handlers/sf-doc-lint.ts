import { registerHandler } from '../ToolDispatcher';
import { lintDocument } from '../lib/sf_doc_lint_core';
import type { DocType } from '../lib/sf_doc_lint_core';

registerHandler('sf_doc_lint', async (args, context, _deps) => {
  const workItemId = args['work_item_id'] as string;
  const docType = args['doc_type'] as string;

  if (!workItemId || !docType) {
    return { success: false, error: 'work_item_id and doc_type required' };
  }

  const baseDir = (context?.directory as string) || (context?.worktree as string) || process.cwd();

  try {
    const result = await lintDocument(workItemId, docType as DocType, baseDir);
    return { success: true, ...result };
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
});
