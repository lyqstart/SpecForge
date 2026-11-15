import {
  RequiredRegistrationRecordSchema,
  RequiredProofRecordSchema,
  RequiredConsumptionRecordSchema,
  requiredVerificationPathIdentity,
} from '@specforge/types/required-verification-contract';
import type {
  RequiredProofRecord,
  RequiredVerificationSourceRecord,
} from '@specforge/types/required-verification-contract';
import type { RequiredVerificationDeclaration } from '@specforge/types/required-verification-contract';
import type { Event } from '../../types';
import { canonicalVerificationJson, verificationId } from '../../verification/owner-store';

export interface ActiveRequiredVerification {
  key: string;
  registrationEventId: string;
  requirement: RequiredVerificationDeclaration['requirements'][number];
  generation: string;
  specSha256: string;
  proof?: RequiredProofRecord;
}
export function requiredVerificationHistorySha256(events: Event[]): string {
  return verificationId(canonicalVerificationJson(events));
}

/** Strict replay: unknown, stale, forged-role and out-of-order records never mean no stop. */
export function replayRequiredVerificationHistory(events: Event[], workItemId: string) {
  const active = new Map<string, ActiveRequiredVerification>();
  const registrations: {
    eventId: string;
    source: RequiredVerificationSourceRecord;
    declaration: RequiredVerificationDeclaration;
  }[] = [];
  let lastUserCreatedAt = -1;
  const consumptions: { eventId: string; mergeTransitionEventId: string }[] = [];
  for (const [index, event] of events.entries()) {
    if (
      event.projectId !== workItemId ||
      event.actor !== 'required_verification_owner' ||
      event.metadata.source !== 'daemon' ||
      event.payload.work_item_id !== workItemId
    )
      throw new Error('REQUIRED_VERIFICATION_HISTORY_IDENTITY');
    if (
      event.action === 'required_verification.registered' ||
      event.action === 'required_verification.replaced'
    ) {
      const record = RequiredRegistrationRecordSchema.parse(event.payload);
      const { source, declaration } = record;
      if (
        declaration.work_item_id !== workItemId ||
        canonicalVerificationJson(source.declaration) !== canonicalVerificationJson(declaration) ||
        source.userCreatedAt > Date.parse(source.observedAt) ||
        Date.parse(source.observedAt) > event.ts ||
        registrations.some(
          item =>
            item.source.userSessionId === source.userSessionId &&
            item.source.userMessageId === source.userMessageId
        )
      )
        throw new Error('REQUIRED_VERIFICATION_REGISTRATION_SOURCE_INVALID');
      if (event.action === 'required_verification.replaced') {
        if (
          !declaration.replacement ||
          declaration.replacement.prior_history_sha256 !==
            requiredVerificationHistorySha256(events.slice(0, index)) ||
          source.userCreatedAt <= lastUserCreatedAt
        )
          throw new Error('REQUIRED_VERIFICATION_REPLACEMENT_SOURCE_INVALID');
        active.clear();
      } else if (declaration.replacement) {
        throw new Error('REQUIRED_VERIFICATION_REPLACEMENT_ACTION_REQUIRED');
      }
      for (const requirement of declaration.requirements) {
        if (
          [...active.values()].some(
            item =>
              item.requirement.id === requirement.id ||
              requiredVerificationPathIdentity(item.requirement.path) ===
                requiredVerificationPathIdentity(requirement.path)
          )
        )
          throw new Error('REQUIRED_VERIFICATION_ACTIVE_DUPLICATE');
        const key = event.eventId + ':' + requirement.id;
        active.set(key, {
          key,
          registrationEventId: event.eventId,
          requirement,
          generation: declaration.candidate_generation,
          specSha256: declaration.project_spec_manifest_sha256,
        });
      }
      registrations.push({ eventId: event.eventId, source, declaration });
      lastUserCreatedAt = Math.max(lastUserCreatedAt, source.userCreatedAt);
    } else if (event.action === 'required_verification.proof') {
      const proof = RequiredProofRecordSchema.parse(event.payload);
      const item = active.get(proof.requirement_key);
      if (
        !item ||
        proof.generation !== item.generation ||
        proof.source.agent !== item.requirement.owner ||
        !['sf_handoff', 'sf_v11_handoff'].includes(proof.source.tool) ||
        proof.source.userCreatedAt > Date.parse(proof.source.observedAt) ||
        Date.parse(proof.source.observedAt) > event.ts
      )
        throw new Error('REQUIRED_VERIFICATION_PROOF_BINDING_INVALID');
      if (
        proof.outcome === 'passed' &&
        (!proof.identity ||
          proof.actual_sha256 !== item.requirement.expected_sha256 ||
          proof.failure_code !== undefined)
      )
        throw new Error('REQUIRED_VERIFICATION_PASSED_PROOF_INVALID');
      if (proof.outcome !== 'passed' && !proof.failure_code)
        throw new Error('REQUIRED_VERIFICATION_FAILURE_DIAGNOSTIC_REQUIRED');
      item.proof = proof;
    } else if (event.action === 'required_verification.consumed') {
      const record = RequiredConsumptionRecordSchema.parse(event.payload);
      if (
        active.size === 0 ||
        [...active.values()].some(item => item.proof?.outcome !== 'passed') ||
        record.prior_history_sha256 !== requiredVerificationHistorySha256(events.slice(0, index)) ||
        consumptions.some(item => item.mergeTransitionEventId === record.merge_transition_event_id)
      )
        throw new Error('REQUIRED_VERIFICATION_CONSUMPTION_INVALID');
      consumptions.push({
        eventId: event.eventId,
        mergeTransitionEventId: record.merge_transition_event_id,
      });
      active.clear();
    } else {
      throw new Error('REQUIRED_VERIFICATION_HISTORY_ACTION_UNSUPPORTED');
    }
  }
  return {
    active: [...active.values()],
    registrations,
    consumptions,
    historySha256: requiredVerificationHistorySha256(events),
    lastEventId: events.at(-1)?.eventId ?? null,
  };
}
