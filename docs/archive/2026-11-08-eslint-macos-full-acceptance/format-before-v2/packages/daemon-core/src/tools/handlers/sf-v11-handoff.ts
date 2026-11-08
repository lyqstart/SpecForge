/**
 * sf-v11-handoff — §14.3 Agent handoff validation handler
 */
import { registerHandler } from '../ToolDispatcher';
import {
  validateHandoff,
  writeHandoff,
  validateAllHandoffs,
  recordHandoffValidationState,
} from '../lib/agent-handoff-v11';
import type { AgentHandoff } from '../lib/agent-handoff-v11';
import { validateWorkItemId } from '../lib/work-item-id-validator';
import { readWorkItemMetadata } from '../lib/work-item-metadata';
import { workItemRoot } from '@specforge/types/directory-layout';

function normalizeAgentName(value: unknown): string {
  return String(value ?? '').trim().toLowerCase().replace(/_/g, '-');
}

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
      const idError = validateWorkItemId(workItemId);
      if (idError) return { success: false, error: idError };
      const wiDir = workItemRoot(projectRoot, workItemId);
      await readWorkItemMetadata(wiDir, workItemId);
      if (handoff.work_item_id !== workItemId) {
        return {
          success: false,
          error: 'HANDOFF_WORK_ITEM_MISMATCH',
          message: `handoff.work_item_id=${handoff.work_item_id} does not match work_item_id=${workItemId}`,
        };
      }
      const callerAgent = normalizeAgentName(context?.agent);
      const handoffAgent = normalizeAgentName(handoff.agent);
      if (!callerAgent || callerAgent !== handoffAgent) {
        return {
          success: false,
          error: 'HANDOFF_AGENT_OWNER_MISMATCH',
          caller_agent: callerAgent || 'unknown',
          handoff_agent: handoffAgent || 'unknown',
        };
      }

      // Validate before writing
      const validation = validateHandoff(handoff);
      if (!validation.valid) {
        return { success: false, error: `Handoff validation failed: ${validation.errors.join('; ')}` };
      }
      const filePath = await writeHandoff(wiDir, handoff);
      return { success: true, action: 'write', path: filePath };
    }

    if (action === 'validate_all') {
      const workItemId = args['work_item_id'] as string;
      if (!workItemId) {
        return { success: false, error: 'work_item_id is required' };
      }
      const idError = validateWorkItemId(workItemId);
      if (idError) return { success: false, error: idError };
      const wiDir = workItemRoot(projectRoot, workItemId);
      await readWorkItemMetadata(wiDir, workItemId);
      const expectedAgent = args['expected_agent']
        ? normalizeAgentName(args['expected_agent'])
        : undefined;
      const expectedStage = args['expected_stage'] as string | undefined;
      const createdAfter = args['created_after'] as string | undefined;
      if (createdAfter && Number.isNaN(Date.parse(createdAfter))) {
        return { success: false, error: 'created_after must be a valid ISO-8601 timestamp' };
      }
      const result = await validateAllHandoffs(wiDir, {
        expectedAgent,
        expectedStage,
        createdAfter,
      });
      const hasExpectation = Boolean(expectedAgent || expectedStage || createdAfter);
      const complete = result.invalid === 0 && result.total > 0 && (!hasExpectation || result.matching > 0);
      const error = complete
        ? undefined
        : result.total === 0
          ? 'HANDOFFS_REQUIRED'
          : result.invalid > 0
            ? 'HANDOFF_COLLECTION_INVALID'
            : 'HANDOFF_EXPECTATION_NOT_MET';
      await recordHandoffValidationState(
        wiDir,
        { expectedAgent, expectedStage, createdAfter },
        { success: complete, ...result, error },
      );
      return {
        success: complete,
        action: 'validate_all',
        ...result,
        error,
      };
    }

    return { success: false, error: `Unknown action: ${action}. Use 'validate', 'write', or 'validate_all'.` };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
});
