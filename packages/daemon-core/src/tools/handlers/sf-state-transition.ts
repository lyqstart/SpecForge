import { access } from "node:fs/promises";
import { registerHandler } from '../ToolDispatcher';
import { SPEC_DIR_NAME } from '@specforge/types/directory-layout';
import { join } from 'node:path';
import { isValidV11Transition, isForbiddenTransition, WI_STATUSES_V11, checkCloseGateEvidenceRequirements } from '../lib/state-machine-v11';
import { WORKFLOW_PATH_TO_TYPE, type WorkflowPath } from '../lib/state_machine';

registerHandler('sf_state_transition', async (args, context, deps) => {
  const workItemId = args['work_item_id'] as string;
  const fromState = (args['from_state'] as string) ?? '';
  const toState = args['to_state'] as string;
  const useV11 = (args['use_v11_state_machine'] as boolean) || !!rawWorkflowPath;

  // v1.1: Accept workflow_path and resolve to internal workflow_type
  const rawWorkflowPath = args['workflow_path'] as string | undefined;
  const rawWorkflowType = args['workflow_type'] as string | undefined;
  let resolvedWorkflowType: string | undefined = rawWorkflowType;

  if (rawWorkflowPath && !rawWorkflowType) {
    // Map v1.1 workflow_path to legacy workflow_type for internal use
    const mapped = WORKFLOW_PATH_TO_TYPE[rawWorkflowPath as WorkflowPath];
    if (mapped) {
      resolvedWorkflowType = mapped;
    } else {
      return {
        success: false,
        error: `Unknown workflow_path: ${rawWorkflowPath}. Valid paths: ${Object.keys(WORKFLOW_PATH_TO_TYPE).join(', ')}`,
      };
    }
  }

  if (!workItemId || toState === undefined) {
    return { success: false, error: 'work_item_id and to_state required' };
  }

  // v1.1 state machine validation (opt-in via use_v11_state_machine flag)
  if (useV11) {
    // Check if target state is a valid v1.1 state
    if (!(WI_STATUSES_V11 as readonly string[]).includes(toState)) {
      return {
        success: false,
        error: `Invalid v1.1 target state "${toState}". Valid states: ${(WI_STATUSES_V11 as readonly string[]).join(', ')}`,
      };
    }

    // Check forbidden transitions
    if (fromState !== '' && isForbiddenTransition(fromState, toState)) {
      return {
        success: false,
        error: `Forbidden v1.1 transition: ${fromState} → ${toState} (§5.2)`,
        forbidden: true,
      };
    }

    // Check valid transition
    if (fromState !== '' && !isValidV11Transition(fromState, toState)) {
      return {
        success: false,
        error: `Invalid v1.1 transition: ${fromState} → ${toState}`,
        valid_from_states: `Use getTransitionTable() to see valid targets from ${fromState}`,
      };
    }

    // v1.2 M1: Close gate evidence requirements — before transitionFull
    // Only checked when transitioning TO closed under v1.1 state machine
    if (toState === 'closed') {
      // Need project path to compute workItemDir for evidence file checks
      const v11ProjectPath = (context?.directory as string) || (context?.worktree as string) || '';
      if (!v11ProjectPath) {
        return {
          success: false,
          error: 'projectPath required for close gate evidence check — provide context.directory or context.worktree',
        };
      }
      const v11WorkItemDir = join(v11ProjectPath, SPEC_DIR_NAME, 'work-items', workItemId);
      const evidenceResult = await checkCloseGateEvidenceRequirements(v11WorkItemDir);
      if (!evidenceResult.met) {
        return {
          success: false,
          error: `Close gate evidence requirements not met. Missing: ${evidenceResult.missing.join(', ')}. ${evidenceResult.descriptions.join('; ')}`,
          missing_evidence: evidenceResult.missing,
        };
      }
    }
  }

  // Guard: when creating a new work item (fromState=''), ensure the project is initialized
  if (fromState === '') {
    const baseDir = (context?.directory as string) || (context?.worktree as string) || process.cwd();
    const manifestPath = join(baseDir, SPEC_DIR_NAME, 'manifest.json');
    try {
      await access(manifestPath);
    } catch {
      return {
        success: false,
        error: 'PROJECT_NOT_INITIALIZED',
        hint: `项目尚未初始化，请在项目根目录运行 SpecForge 初始化流程以创建 ${SPEC_DIR_NAME}/manifest.json`,
        recovery_action: 'execute_startup_flow',
      };
    }
  }

  if (!deps.workflowEngine) {
    return { success: false, error: 'WorkflowEngine not available' };
  }

  // v1.1: Compute workItemDir for evidence prerequisite checks.
  // CRITICAL_STATES (approval_required, merge_ready, merging, post_merge_verified,
  // implementation_ready, verification_done, closed) require workItemDir —
  // transitionFull will throw if missing and the target is critical.
  const projectPath = (context?.directory as string) || (context?.worktree as string) || '';
  const workItemDir = projectPath
    ? join(projectPath, SPEC_DIR_NAME, 'work-items', workItemId)
    : undefined;

  // 1. Validate via WorkflowEngine (manages WorkflowInstance + validates transition rules
  //    + enforces v1.1 evidence prerequisites for CRITICAL_STATES).
  //    If this throws, StateManager.transition is NOT called — no partial state change.
  let result;
  try {
    result = await deps.workflowEngine.transitionFull({
      workItemId,
      fromState,
      toState,
      evidence: (args['evidence'] as string) ?? '',
      workflowType: resolvedWorkflowType,
      transitionContext: args['transition_context'] as Record<string, unknown>,
      actor: context?.agent ? { agentRole: context.agent, sessionId: context?.sessionID } : null,
      workItemDir,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { success: false, error: message };
  }

  // 2. Persist to project-level StateManager (sole persistence path).
  //    This only executes if transitionFull succeeded — guaranteeing evidence was checked.
  if (!projectPath) {
    return { success: false, error: 'projectPath required — provide context.directory or context.worktree' };
  }
  if (!deps.projectManager) {
    return { success: false, error: 'ProjectManager not available' };
  }
  const projectSm = await deps.projectManager.getProjectStateManager(projectPath);
  await projectSm.transition(
    workItemId,
    fromState,
    toState,
    typeof context?.agent === 'string' ? context.agent : 'system',
    (resolvedWorkflowType) || 'feature_spec',
    { evidence: (args['evidence'] as string) ?? '' },
  );

  return { success: true, ...result };
});
