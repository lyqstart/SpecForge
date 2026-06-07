/**
 * sf-v11-extension — Patch 1 Extension Subflow handler
 */
import { registerHandler } from '../ToolDispatcher';
import {
  validateExtensionRequest,
  writeExtensionRequest,
  readExtensionRequest,
  generateExtensionDelta,
  generateExtensionCandidate,
  runExtensionGate,
  recoverMainFlow,
} from '../lib/extension-subflow-v11';
import * as path from 'node:path';

registerHandler('sf_v11_extension', async (args, context, _deps) => {
  const projectRoot = (context?.directory as string) || (context?.worktree as string) || process.cwd();
  const action = (args['action'] as string) || 'request';

  try {
    const workItemId = args['work_item_id'] as string;
    if (!workItemId) {
      return { success: false, error: 'work_item_id is required' };
    }

    const wiDir = path.join(projectRoot, '.specforge', 'work-items', workItemId);

    if (action === 'request') {
      const request = args['request'];
      if (!request) {
        return { success: false, error: 'request object is required' };
      }
      const validation = validateExtensionRequest(request);
      if (!validation.valid) {
        return { success: false, error: `Invalid request: ${validation.errors.join('; ')}` };
      }
      const filePath = await writeExtensionRequest(wiDir, request as any);
      return { success: true, action: 'request', path: filePath };
    }

    if (action === 'read_request') {
      const request = await readExtensionRequest(wiDir);
      return { success: true, action: 'read_request', request };
    }

    if (action === 'generate_delta') {
      const currentRegistry = args['current_registry'] as Record<string, unknown>;
      const namespace = args['namespace'] as string;
      const key = args['key'] as string;
      const value = args['value'];
      const reason = (args['reason'] as string) || '';

      if (!currentRegistry || !namespace || !key) {
        return { success: false, error: 'current_registry, namespace, key are required' };
      }

      const result = await generateExtensionDelta({
        wiDir, currentRegistry, proposedNamespace: namespace,
        proposedKey: key, proposedValue: value, reason,
      });
      return { success: true, action: 'generate_delta', delta_path: result.filePath };
    }

    if (action === 'generate_candidate') {
      const currentRegistry = args['current_registry'] as Record<string, unknown>;
      const namespace = args['namespace'] as string;
      const key = args['key'] as string;
      const value = args['value'];

      if (!currentRegistry || !namespace || !key) {
        return { success: false, error: 'current_registry, namespace, key are required' };
      }

      const result = await generateExtensionCandidate({
        wiDir, currentRegistry, namespace, key, value,
      });
      return { success: true, action: 'generate_candidate', candidate_path: result.candidatePath };
    }

    if (action === 'run_gate') {
      const candidatePath = args['candidate_path'] as string;
      const currentRegistryPath = path.join(
        projectRoot, '.specforge', 'project', 'extension_registry.json',
      );
      const result = await runExtensionGate({ wiDir, candidatePath, currentRegistryPath });
      return { success: true, action: 'run_gate', ...result };
    }

    if (action === 'recover') {
      const extensionCompleted = args['extension_completed'] as boolean;
      const previousStatus = (args['previous_status'] as string) || 'candidate_preparing';
      const result = await recoverMainFlow({ wiDir, extensionCompleted, previousStatus });
      return { success: true, action: 'recover', ...result };
    }

    return { success: false, error: `Unknown action: ${action}.` };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
});
