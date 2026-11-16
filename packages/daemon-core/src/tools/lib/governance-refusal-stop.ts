import type { ToolDeps, ToolInvokeRequest } from '../ToolDispatcher';
import type { RequiredVerificationSourceRequest } from '@specforge/types/trusted-tool-invocation';
import { canonicalVerificationJson, verificationId } from '../../verification/owner-store';
import { setHardStop, checkHardStop, isHardStopRecoveryTool } from './hard-stop-latch';
import { readAuthoritativeWorkItems } from './authoritative-work-items';
import { recordDaemonObservation } from '../../observability/observability-recorder';
import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { SPEC_DIR_NAME } from '@specforge/types/directory-layout';

export const GOVERNANCE_READ_POLICY_STOP = 'GOVERNANCE_READ_POLICY_REFUSAL';
export const GOVERNANCE_ORIGINAL_READ_STOP = 'GOVERNANCE_ORIGINAL_READ_UNAVAILABLE';
export type GovernanceStopDependencies = Pick<
  ToolDeps,
  'toolInvocationVerifier' | 'projectManager'
>;

function invocation(
  directory: string,
  tool: string,
  args: Record<string, unknown>,
  context: ToolInvokeRequest['context']
): RequiredVerificationSourceRequest {
  if (typeof context?.sessionID !== 'string' || typeof context?.callID !== 'string')
    throw new Error('GOVERNANCE_STOP_CALL_IDENTITY_REQUIRED');
  return { directory, tool, args, sessionId: context.sessionID, callId: context.callID };
}

/** Only the typed D18 governance-read refusal is terminal; ordinary I/O failures are not. */
export async function stopGovernanceReadRefusal(
  deps: GovernanceStopDependencies,
  projectRoot: string,
  workItemId: string,
  args: Record<string, unknown>,
  context: ToolInvokeRequest['context'],
  result: unknown
) {
  if (
    !result ||
    typeof result !== 'object' ||
    !('stderr' in result) ||
    result.stderr !== 'READ_PATH_REQUIRES_CONTROLLED_OWNER'
  )
    return result;
  return stopGovernanceReadFailure(
    deps,
    projectRoot,
    workItemId,
    args,
    context,
    result,
    'sf_safe_bash',
    GOVERNANCE_READ_POLICY_STOP
  );
}

export async function stopGovernanceReadFailure(
  deps: GovernanceStopDependencies,
  projectRoot: string,
  workItemId: string,
  args: Record<string, unknown>,
  context: ToolInvokeRequest['context'],
  result: Record<string, unknown>,
  tool: 'sf_safe_bash' | 'sf_governance_read',
  policyCode: typeof GOVERNANCE_READ_POLICY_STOP | typeof GOVERNANCE_ORIGINAL_READ_STOP
) {
  const input = invocation(projectRoot, tool, args, context);
  const runtime = deps.toolInvocationVerifier;
  if (!runtime?.readRequiredVerificationSource)
    throw new Error('GOVERNANCE_STOP_SOURCE_UNAVAILABLE');
  const proof = await runtime.readRequiredVerificationSource(input);
  if (
    proof.sessionId !== input.sessionId ||
    proof.callId !== input.callId ||
    proof.directory !== projectRoot ||
    proof.tool !== input.tool ||
    proof.inputSha256 !== verificationId(canonicalVerificationJson(args))
  )
    throw new Error('GOVERNANCE_STOP_SOURCE_MISMATCH');
  const record = setHardStop(projectRoot, workItemId, policyCode, tool, 'work_item', {
    policy_code: policyCode,
    triggering_agent: proof.agent,
    blocked_action: JSON.stringify({
      sessionId: proof.sessionId,
      userSessionId: proof.userSessionId,
      userMessageId: proof.userMessageId,
      callId: proof.callId,
    }),
    blocked_target: String(args.command ?? args.artifact).slice(0, 500),
    blocked_step: 'governance_original_read',
    resume_step:
      'Resolve the refusal through its owner, then read the original with sf_governance_read.',
    retry_original_action: false,
    safe_alternative_tool: 'sf_governance_read',
  });
  let cancellation: unknown;
  try {
    if (!runtime.stopGovernanceInvocation) throw new Error('GOVERNANCE_STOP_RUNTIME_UNAVAILABLE');
    cancellation = {
      acknowledged: true,
      ...(await runtime.stopGovernanceInvocation(input, proof)),
    };
  } catch (error) {
    cancellation = {
      acknowledged: false,
      error: error instanceof Error ? error.message : 'GOVERNANCE_STOP_FAILED',
    };
  }
  const stopped = {
    ...result,
    success: false,
    rejected: true,
    policy_violation: true,
    retry_allowed: false,
    hard_stop: true,
    work_item_id: workItemId,
    hard_stop_record: record,
    cancellation,
  };
  recordDaemonObservation({
    context,
    category: 'hardstop',
    phase: 'governance.policy_refusal.stop',
    tool_name: tool,
    work_item_id: workItemId,
    status: 'denied',
    payload: stopped,
    // The cancellation result is a control decision, not optional debug content.
    // Preserve its bounded receipt even with payload capture disabled.
    metadata: {
      hard_stop_id: record.hard_stop_id,
      policy_code: policyCode,
      cancellation,
    },
    force: true,
  });
  return stopped;
}

/** Enforce the persisted terminal stop for the affected live delegation chain only. */
export async function checkGovernanceRefusalStop(
  deps: GovernanceStopDependencies,
  projectRoot: string,
  tool: string,
  args: Record<string, unknown>,
  context: ToolInvokeRequest['context']
): Promise<{ allowed: boolean; reason?: string }> {
  if (isHardStopRecoveryTool(tool)) return { allowed: true };
  // This hook also runs before project initialization. Inspect existing latches
  // without initializing a project merely to determine that no stop exists.
  const ids = await readdir(path.join(projectRoot, SPEC_DIR_NAME, 'work-items')).catch(error => {
    if (error.code === 'ENOENT') return [] as string[];
    throw error;
  });
  const stops = ids
    .filter(id => /^WI-\d{4,}$/.test(id))
    .map(id => checkHardStop(projectRoot, id).record)
    .filter(
      record =>
        record &&
        [GOVERNANCE_READ_POLICY_STOP, GOVERNANCE_ORIGINAL_READ_STOP].includes(
          record.policy_code ?? ''
        )
    );
  if (!stops.length) return { allowed: true };
  try {
    const items = await readAuthoritativeWorkItems(deps, projectRoot);
    if (stops.some(stop => !items.some(item => item.work_item_id === stop!.work_item_id)))
      throw new Error('GOVERNANCE_STOP_STATE_UNAVAILABLE');
    const input = invocation(projectRoot, tool, args, context);
    const runtime = deps.toolInvocationVerifier;
    if (!runtime?.readRequiredVerificationSource)
      throw new Error('GOVERNANCE_STOP_SOURCE_UNAVAILABLE');
    const proof = await runtime.readRequiredVerificationSource(input);
    if (
      proof.sessionId !== input.sessionId ||
      proof.callId !== input.callId ||
      proof.directory !== projectRoot ||
      proof.tool !== tool ||
      proof.inputSha256 !== verificationId(canonicalVerificationJson(args))
    )
      throw new Error('GOVERNANCE_STOP_SOURCE_MISMATCH');
    for (const stop of stops) {
      const bound = JSON.parse(stop!.blocked_action ?? 'null');
      if (!bound || typeof bound.userSessionId !== 'string')
        throw new Error('GOVERNANCE_STOP_BINDING_INVALID');
      if (proof.userSessionId === bound.userSessionId)
        return {
          allowed: false,
          reason:
            stop!.policy_code +
            ': resolve the existing HardStop; do not continue this invocation chain.',
        };
    }
    return { allowed: true };
  } catch {
    return { allowed: false, reason: 'GOVERNANCE_STOP_SOURCE_UNAVAILABLE' };
  }
}
