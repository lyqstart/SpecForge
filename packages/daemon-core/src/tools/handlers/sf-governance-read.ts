import { registerHandler } from '../ToolDispatcher';
import { readAuthoritativeWorkItems } from '../lib/authoritative-work-items';
import { readGovernanceArtifact } from '../lib/governance-artifact-read';
import { canonicalVerificationJson, verificationId } from '../../verification/owner-store';
import {
  stopGovernanceReadFailure,
  GOVERNANCE_ORIGINAL_READ_STOP,
} from '../lib/governance-refusal-stop';

const READERS = new Set(['sf-orchestrator', 'sf-requirements', 'sf-design', 'sf-task-planner']);

registerHandler('sf_governance_read', async (args, context, deps) => {
  try {
    const directory = context?.directory;
    const sessionId = context?.sessionID;
    const callId = context?.callID;
    const verifier = deps.toolInvocationVerifier;
    if (
      typeof directory !== 'string' ||
      typeof sessionId !== 'string' ||
      typeof callId !== 'string' ||
      !verifier?.readRequiredVerificationSource ||
      typeof args.work_item_id !== 'string' ||
      typeof args.artifact !== 'string'
    )
      throw new Error('GOVERNANCE_READ_CALL_IDENTITY_REQUIRED');
    const proof = await verifier.readRequiredVerificationSource({
      directory,
      sessionId,
      callId,
      tool: 'sf_governance_read',
      args,
    });
    if (
      proof.directory !== directory ||
      proof.sessionId !== sessionId ||
      proof.callId !== callId ||
      proof.tool !== 'sf_governance_read' ||
      proof.inputSha256 !== verificationId(canonicalVerificationJson(args)) ||
      !READERS.has(proof.agent) ||
      proof.agent !== context?.agent
    )
      throw new Error('GOVERNANCE_READ_CALL_BINDING_INVALID');
    const states = await readAuthoritativeWorkItems(deps, directory);
    if (!states.some(item => item.work_item_id === args.work_item_id))
      throw new Error('GOVERNANCE_READ_WORK_ITEM_UNAVAILABLE');
    try {
      return await readGovernanceArtifact(directory, {
        work_item_id: args.work_item_id,
        artifact: args.artifact,
        offset: args.offset as number | undefined,
        version: args.version as string | undefined,
      });
    } catch (error) {
      return await stopGovernanceReadFailure(
        deps,
        directory,
        args.work_item_id,
        args,
        context,
        {
          success: false,
          error: error instanceof Error ? error.message : 'GOVERNANCE_READ_FAILED',
        },
        'sf_governance_read',
        GOVERNANCE_ORIGINAL_READ_STOP
      );
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'GOVERNANCE_READ_FAILED',
      retry_allowed: false,
    };
  }
});
