/** One contract for Report, Evidence, Verification, Formal Version and Close. */
import type { VerificationExecutionReceipt } from './verification-plan';
export interface ExecutionEvidenceSubject {
  receiptId: string;
  projectRoot: string;
  workItemId: string;
  taskId: string;
  verificationType: string;
  commandIndex: number;
  command: string;
  purpose: 'implementation' | 'formal';
}
export interface ExecutionEvidenceConsumer {
  consume(input: ExecutionEvidenceSubject): Promise<VerificationExecutionReceipt>;
}
const object = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);
const digest = (value: unknown): value is string =>
  typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);

export async function inspectExecutionEvidence(input: {
  projectRoot: string;
  workItemId: string;
  report?: unknown;
  manifest?: unknown;
  consumer?: ExecutionEvidenceConsumer;
  purpose?: 'implementation' | 'formal';
  historicalClosed?: boolean;
}): Promise<string[]> {
  const reasons: string[] = [],
    report = object(input.report) ? input.report : null,
    manifest = object(input.manifest) ? input.manifest : null;
  const commands =
    report && Array.isArray(report.verification_commands) ? report.verification_commands : [];
  const entries = manifest && Array.isArray(manifest.entries) ? manifest.entries : [];
  // This is a live acceptance check. Post-close drift alone cannot prove a defect existed at the original Close.
  // Retrospective recovery needs its closure-time immutable evidence; the existing historical owner retains that duty.
  if (input.historicalClosed) return reasons;
  const accepted = new Map<string, ExecutionEvidenceSubject>(),
    commandIds = new Set<string>(),
    evidenceIds = new Set<string>();
  async function inspect(value: unknown, label: string): Promise<string | null> {
    if (
      !object(value) ||
      !digest(value.execution_receipt_id) ||
      typeof value.task_id !== 'string' ||
      !new RegExp('^TASK-' + input.workItemId + '-[0-9]{3}$').test(value.task_id) ||
      !['unit', 'property', 'integration', 'e2e', 'regression'].includes(
        String(value.verification_type)
      ) ||
      !Number.isSafeInteger(value.command_index) ||
      (value.command_index as number) < 0 ||
      (value.command_index as number) > 63 ||
      typeof value.command !== 'string'
    ) {
      reasons.push('execution_reference_invalid:' + label);
      return null;
    }
    const subject: ExecutionEvidenceSubject = {
      receiptId: value.execution_receipt_id,
      projectRoot: input.projectRoot,
      workItemId: input.workItemId,
      taskId: value.task_id,
      verificationType: value.verification_type as string,
      commandIndex: value.command_index as number,
      command: value.command,
      purpose: input.purpose ?? 'formal',
    };
    if (!input.consumer) {
      reasons.push('execution_owner_unavailable:' + label);
      return null;
    }
    const prior = accepted.get(subject.receiptId);
    if (prior && JSON.stringify(prior) !== JSON.stringify(subject)) {
      reasons.push('execution_receipt_reused_for_another_subject:' + label);
      return null;
    }
    try {
      if (!prior) await input.consumer.consume(subject);
      accepted.set(subject.receiptId, subject);
      return subject.receiptId;
    } catch {
      reasons.push('execution_receipt_rejected:' + label);
      return null;
    }
  }
  for (const [index, value] of commands.entries()) {
    if (!object(value) || value.status !== 'pass') continue;
    if (value.execution_kind === 'manual-observation/v1') {
      const refs = Array.isArray(value.evidence_refs) ? value.evidence_refs : [];
      const claimsExecution = [
        'execution_receipt_id',
        'task_id',
        'verification_type',
        'command_index',
      ].some(key => Object.prototype.hasOwnProperty.call(value, key));
      if (
        claimsExecution ||
        typeof value.command !== 'string' ||
        !value.command.startsWith('manual:') ||
        refs.length === 0 ||
        !manifest ||
        refs.some(
          id =>
            !entries.some(
              e =>
                object(e) &&
                (e.evidence_id ?? e.id) === id &&
                e.status === 'passed' &&
                e.evidence_type === 'manual_acceptance'
            )
        )
      )
        reasons.push('manual_observation_reference_invalid:' + index);
      continue;
    }
    const id = await inspect(value, 'command-' + index);
    if (id) {
      if (commandIds.has(id)) reasons.push('execution_receipt_duplicate_command:' + index);
      commandIds.add(id);
    }
  }
  for (const [index, value] of entries.entries()) {
    if (!object(value) || value.execution_receipt_id === undefined) continue;
    const id = await inspect(value, 'evidence-' + index);
    if (id) {
      evidenceIds.add(id);
      if (
        value.path !== 'verification-owner:receipt:' + id ||
        value.hash !== 'sha256:' + id ||
        value.hash_domain !== 'canonical-json:verification-execution/v1' ||
        value.status !== 'passed'
      )
        reasons.push('execution_evidence_identity_invalid:' + index);
    }
  }
  if (report && manifest)
    for (const id of commandIds)
      if (!evidenceIds.has(id)) reasons.push('execution_receipt_missing_from_manifest:' + id);
  return reasons;
}
