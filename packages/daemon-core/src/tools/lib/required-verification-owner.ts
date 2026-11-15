import path from 'node:path';
import { evaluateMergeReport } from '@specforge/types';
import { SPEC_DIR_NAME } from '@specforge/types/directory-layout';
import type {
  ToolInvocationVerifier,
  RequiredVerificationSourceRequest,
} from '@specforge/types/trusted-tool-invocation';
import { RequiredVerificationSourceSchema } from '@specforge/types/required-verification-contract';
import type {
  RequiredProofRecord,
  RequiredVerificationDeclaration,
  RequiredVerificationSourceRecord,
} from '@specforge/types/required-verification-contract';
import type { StateManager } from '../../state/StateManager';
import type { Event } from '../../types';
import {
  canonicalVerificationJson,
  readVerificationFileSnapshot,
  verificationId,
} from '../../verification/owner-store';
import {
  assertRequiredVerificationScope,
  readRequiredVerificationBinding,
} from './required-verification-binding';
import { replayRequiredVerificationHistory } from './required-verification-history';
import { guardHardStop } from './hard-stop-latch';

export interface RequiredVerificationOwnerDependencies {
  toolInvocationVerifier?: ToolInvocationVerifier;
  projectManager: { getProjectStateManager(projectRoot: string): Promise<StateManager> };
}
const candidateStates = new Set([
  'candidate_preparing',
  'candidate_prepared',
  'gates_running',
  'gates_failed',
  'gates_passed',
  'approval_required',
]);
const samePath = (left: string, right: string) =>
  process.platform === 'win32'
    ? path.resolve(left).toLowerCase() === path.resolve(right).toLowerCase()
    : path.resolve(left) === path.resolve(right);
const sameSource = (a: RequiredVerificationSourceRecord, b: RequiredVerificationSourceRecord) =>
  a.userSessionId === b.userSessionId &&
  a.userMessageId === b.userMessageId &&
  a.userTextSha256 === b.userTextSha256;

/** Runtime owner only. Mutating callers must hold the shared project operation barrier. */
export class RequiredVerificationOwner {
  constructor(private readonly deps: RequiredVerificationOwnerDependencies) {}

  private async state(projectRoot: string, workItemId: string) {
    const manager = await this.deps.projectManager.getProjectStateManager(projectRoot);
    if (
      typeof manager.readRequiredVerificationHistory !== 'function' ||
      typeof manager.appendRequiredVerificationEvent !== 'function'
    )
      throw new Error('REQUIRED_VERIFICATION_OWNER_UNAVAILABLE');
    const events = await manager.readRequiredVerificationHistory(workItemId);
    if (events.length > 1024) throw new Error('REQUIRED_VERIFICATION_HISTORY_BUDGET');
    return { manager, events, ...replayRequiredVerificationHistory(events, workItemId) };
  }

  private async source(projectRoot: string, input: RequiredVerificationSourceRequest) {
    const verifier = this.deps.toolInvocationVerifier;
    if (!verifier?.readRequiredVerificationSource || !samePath(input.directory, projectRoot))
      throw new Error('REQUIRED_VERIFICATION_SOURCE_UNAVAILABLE');
    const proof = RequiredVerificationSourceSchema.parse(
      await verifier.readRequiredVerificationSource(input)
    );
    if (
      !samePath(proof.directory, projectRoot) ||
      proof.sessionId !== input.sessionId ||
      proof.callId !== input.callId ||
      proof.tool !== input.tool ||
      proof.inputSha256 !== verificationId(canonicalVerificationJson(input.args))
    )
      throw new Error('REQUIRED_VERIFICATION_SOURCE_BINDING_INVALID');
    return proof;
  }

  private async append(
    state: Awaited<ReturnType<RequiredVerificationOwner['state']>>,
    workItemId: string,
    action: 'registered' | 'replaced' | 'proof' | 'consumed',
    payload: Record<string, unknown>
  ) {
    const preflight: Event = {
      eventId: 'required-preflight',
      ts: Date.now(),
      projectId: workItemId,
      actor: 'required_verification_owner',
      action: 'required_verification.' + action,
      payload: { ...payload, work_item_id: workItemId },
      metadata: { schemaVersion: '1.0', source: 'daemon' },
    };
    replayRequiredVerificationHistory([...state.events, preflight], workItemId);
    return state.manager.appendRequiredVerificationEvent(
      workItemId,
      action,
      payload,
      state.lastEventId
    );
  }

  async captureSource(projectRoot: string, input: RequiredVerificationSourceRequest) {
    const source = await this.source(projectRoot, input),
      declaration = source.declaration;
    if (!declaration) return { registered: false, source };
    if (
      !guardHardStop(projectRoot, declaration.work_item_id, 'sf_required_verification_capture')
        .allowed
    )
      throw new Error('HARD_STOP_ACTIVE');
    if (
      typeof input.args.work_item_id === 'string' &&
      input.args.work_item_id !== declaration.work_item_id
    )
      throw new Error('REQUIRED_VERIFICATION_SOURCE_WORK_ITEM_MISMATCH');
    const state = await this.state(projectRoot, declaration.work_item_id);
    const existing = state.registrations.find(item => sameSource(item.source, source));
    if (existing) {
      if (
        canonicalVerificationJson(existing.declaration) !== canonicalVerificationJson(declaration)
      )
        throw new Error('REQUIRED_VERIFICATION_SOURCE_DECLARATION_CHANGED');
      const mergeReceiptRecovery =
        ['sf_merge_run', 'sf_v11_merge'].includes(input.tool) &&
        input.args.work_item_id === declaration.work_item_id &&
        state.manager.getState(declaration.work_item_id)?.current_state === 'merged';
      if (
        !mergeReceiptRecovery &&
        state.active.some(item => item.registrationEventId === existing.eventId)
      )
        assertRequiredVerificationScope(
          declaration,
          await readRequiredVerificationBinding(projectRoot, declaration.work_item_id)
        );
      return {
        registered: true,
        registration_event_id: existing.eventId,
        idempotent: true,
        source,
      };
    }
    const workflow = state.manager.getState(declaration.work_item_id);
    if (!workflow || !candidateStates.has(workflow.current_state))
      throw new Error('REQUIRED_VERIFICATION_CANDIDATE_STATE_REQUIRED');
    const binding = await readRequiredVerificationBinding(projectRoot, declaration.work_item_id);
    assertRequiredVerificationScope(declaration, binding);
    if (state.events.length >= 1024) throw new Error('REQUIRED_VERIFICATION_HISTORY_BUDGET');
    if (declaration.replacement) {
      if (
        declaration.replacement.prior_history_sha256 !== state.historySha256 ||
        state.registrations.some(item => item.source.userCreatedAt >= source.userCreatedAt)
      )
        throw new Error('REQUIRED_VERIFICATION_REPLACEMENT_SOURCE_INVALID');
    } else if (
      state.active.length + declaration.requirements.length > 16 ||
      declaration.requirements.some(requirement =>
        state.active.some(
          item =>
            item.requirement.id === requirement.id ||
            item.requirement.path.toLowerCase() === requirement.path.toLowerCase()
        )
      )
    ) {
      throw new Error('REQUIRED_VERIFICATION_ACTIVE_DUPLICATE_OR_BUDGET');
    }
    const event = await this.append(
      state,
      declaration.work_item_id,
      declaration.replacement ? 'replaced' : 'registered',
      { contract: 'required-verification-record/v1', declaration, source }
    );
    return { registered: true, registration_event_id: event.eventId, idempotent: false, source };
  }

  async inspect(projectRoot: string, workItemId: string) {
    const state = await this.state(projectRoot, workItemId);
    const binding = await readRequiredVerificationBinding(projectRoot, workItemId);
    return {
      work_item_id: workItemId,
      candidate_generation: binding.generation,
      project_spec_manifest_sha256: binding.specSha256,
      history_sha256: state.historySha256,
      requirements: state.active.map(item => ({
        key: item.key,
        ...item.requirement,
        last_recorded_outcome: item.proof?.outcome ?? 'pending',
      })),
      freshness_checked: false,
    };
  }

  async verify(
    projectRoot: string,
    input: RequiredVerificationSourceRequest,
    workItemId: string,
    requirementKey: string
  ) {
    if (!guardHardStop(projectRoot, workItemId, 'sf_required_verification_proof').allowed)
      throw new Error('HARD_STOP_ACTIVE');
    if (
      !['sf_handoff', 'sf_v11_handoff'].includes(input.tool) ||
      input.args.action !== 'verify_required' ||
      input.args.work_item_id !== workItemId ||
      input.args.requirement_key !== requirementKey
    )
      throw new Error('REQUIRED_VERIFICATION_PROOF_CALL_REQUIRED');
    const source = await this.source(projectRoot, input);
    const state = await this.state(projectRoot, workItemId);
    const item = state.active.find(entry => entry.key === requirementKey);
    if (!item || source.agent !== item.requirement.owner)
      throw new Error('REQUIRED_VERIFICATION_PROOF_OWNER_MISMATCH');
    if (state.events.length >= 1024) throw new Error('REQUIRED_VERIFICATION_HISTORY_BUDGET');
    const proof: Omit<RequiredProofRecord, 'work_item_id'> = {
      contract: 'required-verification-record/v1',
      requirement_key: requirementKey,
      generation: item.generation,
      outcome: 'unavailable',
      source,
    };
    try {
      const binding = await readRequiredVerificationBinding(projectRoot, workItemId);
      assertRequiredVerificationScope(this.declarationFor(item, workItemId), binding);
      const snapshot = await readVerificationFileSnapshot(
        path.join(binding.workItemDir, item.requirement.path),
        2 * 1024 * 1024
      );
      proof.actual_sha256 = verificationId(snapshot.bytes);
      proof.identity = snapshot.identity;
      proof.outcome =
        proof.actual_sha256 === item.requirement.expected_sha256 ? 'passed' : 'failed';
      if (proof.outcome !== 'passed') proof.failure_code = 'REQUIRED_VERIFICATION_HASH_MISMATCH';
      else {
        const currentSource = await this.source(projectRoot, input);
        if (!sameSource(source, currentSource) || currentSource.agent !== item.requirement.owner)
          throw new Error('REQUIRED_VERIFICATION_SOURCE_CHANGED');
        proof.source = currentSource;
      }
    } catch (error) {
      proof.outcome = 'unavailable';
      const code = error instanceof Error ? error.message.split(':')[0] : '';
      proof.failure_code = /^[A-Z0-9_]{1,128}$/.test(code)
        ? code
        : 'REQUIRED_VERIFICATION_UNAVAILABLE';
    }
    const event = await this.append(state, workItemId, 'proof', proof);
    return {
      success: proof.outcome === 'passed',
      outcome: proof.outcome,
      proof_event_id: event.eventId,
      requirement_key: requirementKey,
      actual_sha256: proof.actual_sha256,
      failure_code: proof.failure_code,
    };
  }

  private declarationFor(
    item: ReturnType<typeof replayRequiredVerificationHistory>['active'][number],
    workItemId: string
  ): RequiredVerificationDeclaration {
    return {
      schema_version: '1.0',
      profile: 'candidate-exact-file-sha256/v1',
      work_item_id: workItemId,
      project_spec_manifest_sha256: item.specSha256,
      candidate_generation: item.generation,
      requirements: [item.requirement],
    };
  }

  async assertReady(projectRoot: string, workItemId: string) {
    const state = await this.state(projectRoot, workItemId);
    if (state.active.length === 0) return { history_sha256: state.historySha256, required: 0 };
    const binding = await readRequiredVerificationBinding(projectRoot, workItemId);
    for (const item of state.active) {
      if (item.proof?.outcome !== 'passed')
        throw new Error('REQUIRED_VERIFICATION_PENDING_OR_FAILED');
      assertRequiredVerificationScope(this.declarationFor(item, workItemId), binding);
      const snapshot = await readVerificationFileSnapshot(
        path.join(binding.workItemDir, item.requirement.path),
        2 * 1024 * 1024
      );
      if (
        verificationId(snapshot.bytes) !== item.requirement.expected_sha256 ||
        canonicalVerificationJson(snapshot.identity) !==
          canonicalVerificationJson(item.proof.identity)
      )
        throw new Error('REQUIRED_VERIFICATION_PROOF_STALE');
    }
    const current = await this.state(projectRoot, workItemId);
    if (current.historySha256 !== state.historySha256)
      throw new Error('REQUIRED_VERIFICATION_HISTORY_CHANGED');
    return { history_sha256: state.historySha256, required: state.active.length };
  }

  /** Only the Merge owner calls this after its authoritative successful transition.
   * A crash between transition and append is recovered by verifying the same receipt;
   * no Candidate or Project Spec writes are replayed. */
  async consumeMerged(projectRoot: string, workItemId: string) {
    const state = await this.state(projectRoot, workItemId);
    if (state.active.length === 0) return state.consumptions.at(-1) ?? null;
    const transition = await state.manager.readLastWorkItemTransition(workItemId);
    const context = transition?.payload.transition_context as Record<string, unknown> | undefined;
    const binding = context?.required_verification_merge as Record<string, unknown> | undefined;
    if (
      transition?.actor !== 'merge_runner' ||
      transition.payload.from_state !== 'merging' ||
      transition.payload.to_state !== 'merged' ||
      context?.source !== 'sf_v11_merge' ||
      context.merge_status !== 'success' ||
      binding?.history_sha256 !== state.historySha256
    )
      throw new Error('REQUIRED_VERIFICATION_MERGE_RECEIPT_REQUIRED');
    const wi = path.join(projectRoot, SPEC_DIR_NAME, 'work-items', workItemId);
    const report = await readVerificationFileSnapshot(
      path.join(wi, 'merge_report.md'),
      2 * 1024 * 1024
    );
    const spec = await readVerificationFileSnapshot(
      path.join(projectRoot, SPEC_DIR_NAME, 'project', 'spec_manifest.json'),
      2 * 1024 * 1024
    );
    const verdict = evaluateMergeReport(report.bytes.toString('utf8'), workItemId);
    if (
      !verdict.valid ||
      verdict.status !== 'success' ||
      !(verdict.successful! > 0) ||
      verificationId(report.bytes) !== binding.merge_report_sha256 ||
      verificationId(spec.bytes) !== binding.resulting_spec_sha256
    )
      throw new Error('REQUIRED_VERIFICATION_MERGE_RECEIPT_STALE');
    for (const item of state.active) {
      if (
        item.proof?.outcome !== 'passed' ||
        Date.parse(item.proof.source.observedAt) > transition.ts
      )
        throw new Error('REQUIRED_VERIFICATION_MERGE_PROOF_INVALID');
      const snapshot = await readVerificationFileSnapshot(
        path.join(wi, item.requirement.path),
        2 * 1024 * 1024
      );
      if (
        verificationId(snapshot.bytes) !== item.requirement.expected_sha256 ||
        canonicalVerificationJson(snapshot.identity) !==
          canonicalVerificationJson(item.proof.identity)
      )
        throw new Error('REQUIRED_VERIFICATION_PROOF_STALE');
    }
    const event = await this.append(state, workItemId, 'consumed', {
      contract: 'required-verification-record/v1',
      prior_history_sha256: state.historySha256,
      merge_transition_event_id: transition.eventId,
      merge_report_sha256: binding.merge_report_sha256,
      resulting_spec_sha256: binding.resulting_spec_sha256,
    });
    return { eventId: event.eventId, mergeTransitionEventId: transition.eventId };
  }
}
