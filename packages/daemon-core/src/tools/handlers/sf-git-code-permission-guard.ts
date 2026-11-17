import { scalarText } from '@specforge/types';
import { registerHandler, getHandler } from '../ToolDispatcher';
import { getCurrentBranch } from '../lib/git-governance-core';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { SPEC_DIR_NAME } from '@specforge/types/directory-layout';
import { gitRepositoryPresent } from '../lib/project-governance-v2';
import { validateWorkItemId } from '../lib/work-item-id-validator';

const codePermissionHandler = getHandler('sf_v11_code_permission');

function isReleaseLikeAction(action: string): boolean {
  return action === 'release' || action === 'enable' || action === 'extend' || action === 'append';
}

registerHandler('sf_code_permission', async (args, context, deps) => {
  const projectRoot =
    (context?.directory as string) || (context?.worktree as string) || process.cwd();
  const action = scalarText(args['action'] || 'check');
  const defaultBranch = scalarText(args['default_branch'] || 'main');

  if (isReleaseLikeAction(action)) {
    const workItemId = scalarText(args['work_item_id']);
    const idError = validateWorkItemId(workItemId);
    if (idError) return { success: false, error: idError };
    // Use the same repository boundary as the scope owner. An unrelated
    // ancestor repository does not make a filesystem project Git-backed.
    let explicitAncestorRepository = false;
    try {
      const contextFile = path.join(
        projectRoot,
        SPEC_DIR_NAME,
        'work-items',
        workItemId,
        'git_context.json'
      );
      const gitContext = JSON.parse(await fs.readFile(contextFile, 'utf8'));
      if (!gitContext || typeof gitContext !== 'object' || Array.isArray(gitContext)) {
        throw new Error('INVALID_GIT_CONTEXT');
      }
      explicitAncestorRepository = gitContext.git_enabled === true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        return { success: false, error: 'CODE_PERMISSION_GIT_CONTEXT_UNREADABLE', hard_stop: true };
      }
    }
    const repositoryPresent = await gitRepositoryPresent(projectRoot, explicitAncestorRepository);
    const currentBranch = repositoryPresent ? await getCurrentBranch(projectRoot) : null;
    if (currentBranch === defaultBranch) {
      return {
        success: false,
        hard_stop: true,
        error: 'MAIN_WRITE_GUARD_BLOCKED',
        message:
          'code_permission cannot be enabled on the default branch. Create a semantic Work Item branch first.',
        current_branch: currentBranch,
        default_branch: defaultBranch,
      };
    }
  }

  if (!codePermissionHandler) {
    return { success: false, error: 'code permission implementation not registered' };
  }
  return codePermissionHandler(args, context, deps);
});
