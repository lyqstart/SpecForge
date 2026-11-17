import * as fs from 'node:fs/promises';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { SPEC_DIR_NAME } from '@specforge/types/directory-layout';
import { RequiredVerificationSourceSchema } from '@specforge/types/required-verification-contract';
import {
  canonicalVerificationJson,
  assertVerificationPath,
  readVerificationFile,
} from '../../verification/owner-store';
import { captureImplementationBaseline } from './implementation-baseline';
import {
  computeCandidateHash,
  validateApprovedUserDecisionForClose,
} from './governance-invariants-v11';
import {
  checkProjectGovernanceConsistency,
  checkProjectGovernanceContracts,
  checkProjectGovernanceTrace,
  readSuccessfulProjectSpecMergeHistoryEvidence,
} from './project-governance-v2';
import {
  prepareUserDecisionInvalidation,
  commitPreparedUserDecisionInvalidation,
} from './user-decision-recorder-v11';
import { commitPreparedCandidateRebase } from './candidate-manifest-owner';
import { guardHardStop } from './hard-stop-latch';
import { assertPreservedRecoveryTask } from './preserved-recovery-task';
import { assertApprovedCandidateIdentity } from './approved-candidate-identity';
import {
  PreimplementationRecoveryRecordSchema,
  type PreimplementationRecoveryProof as Proof,
  type PreimplementationRecoveryRecord as RecordValue,
} from './preimplementation-recovery-contract';
export { assertPreservedRecoveryTask } from './preserved-recovery-task';

const RECORD = 'preimplementation_spec_recovery.json';
const PREFIX = 'SPECFORGE_PREIMPLEMENTATION_RECOVERY_V1';
const hash = (value: Uint8Array | string) => createHash('sha256').update(value).digest('hex');
const json = (value: unknown) => JSON.stringify(value, null, 2) + '\n';
function requireFact(value: unknown, code: string): asserts value {
  if (!value) throw new Error('PREIMPLEMENTATION_RECOVERY_' + code);
}
async function readOptional(file: string): Promise<Buffer | null> {
  try {
    return await readVerificationFile(file);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
}
async function atomic(file: string, text: string) {
  await assertVerificationPath(file, true);
  const pending = path.join(path.dirname(file), 'recovery_generations');
  await assertVerificationPath(pending, true);
  await fs.mkdir(pending, { recursive: true });
  const temporary = path.join(pending, '.record-' + randomUUID());
  const handle = await fs.open(temporary, 'wx');
  try {
    await handle.writeFile(text);
    await handle.sync();
  } finally {
    await handle.close();
  }
  await fs.rename(temporary, file);
}
type Input = {
  deps: any;
  context: any;
  args: Record<string, unknown>;
  projectRoot: string;
  workItemId: string;
};

async function collect(root: string, wi: string) {
  const bytes = new Map<string, Buffer>();
  let size = 0;
  async function walk(directory: string) {
    await assertVerificationPath(directory);
    for (const entry of (await fs.readdir(directory, { withFileTypes: true })).sort((a, b) =>
      a.name.localeCompare(b.name)
    )) {
      if (directory === wi && (entry.name === 'recovery_generations' || entry.name === RECORD))
        continue;
      const file = path.join(directory, entry.name);
      await assertVerificationPath(file);
      if (entry.isDirectory()) await walk(file);
      else {
        const content = await readVerificationFile(file);
        size += content.length;
        requireFact(size <= 128 * 1024 * 1024 && bytes.size < 4096, 'EVIDENCE_BUDGET');
        bytes.set(path.relative(root, file).replace(/\\/g, '/'), content);
      }
    }
  }
  await walk(path.join(root, SPEC_DIR_NAME, 'project'));
  await walk(wi);
  return bytes;
}

async function history(input: Input) {
  const manager = await input.deps.projectManager.getProjectStateManager(input.projectRoot);
  requireFact(
    typeof manager.readWorkItemTransitionHistory === 'function',
    'HISTORY_OWNER_REQUIRED'
  );
  const events = await manager.readWorkItemTransitionHistory(input.workItemId);
  return { manager, events, last: events.at(-1) };
}

async function inspect(input: Input) {
  const root = path.resolve(input.projectRoot),
    wi = path.join(root, SPEC_DIR_NAME, 'work-items', input.workItemId);
  const { events, last } = await history(input);
  requireFact(
    last?.payload.from_state === 'implementation_ready' && last.payload.to_state === 'blocked',
    'PRIOR_STATE_INVALID'
  );
  requireFact(
    !events.some((event: any) =>
      [
        'implementation_running',
        'implementation_done',
        'verification_running',
        'verification_done',
        'closed',
      ].some(state => state === event.payload.to_state)
    ),
    'IMPLEMENTATION_ALREADY_STARTED'
  );
  requireFact(
    events.some(
      (event: any) => event.payload.from_state === 'merging' && event.payload.to_state === 'merged'
    ),
    'MERGE_EVENT_MISSING'
  );
  const files = await collect(root, wi);
  const read = (relative: string) => {
    const value = files.get(path.relative(root, path.join(wi, relative)).replace(/\\/g, '/'));
    requireFact(value, 'EVIDENCE_MISSING:' + relative);
    return value;
  };
  const metadata = JSON.parse(read('work_item.json').toString('utf8'));
  requireFact(
    metadata.code_change_allowed === false &&
      Array.isArray(metadata.allowed_write_files) &&
      metadata.allowed_write_files.length === 0,
    'PERMISSION_NOT_REVOKED'
  );
  const approval = await validateApprovedUserDecisionForClose({
    projectRoot: root,
    workItemDir: wi,
    workItemId: input.workItemId,
    candidateManifestPath: path.join(wi, 'candidate_manifest.json'),
    userDecisionPath: path.join(wi, 'user_decision.json'),
  });
  const decision = JSON.parse(read('user_decision.json').toString('utf8'));
  await assertApprovedCandidateIdentity(root, wi, input.workItemId);
  requireFact(
    approval.valid && decision.candidate_hash === (await computeCandidateHash(wi)),
    'APPROVED_CANDIDATE_CHANGED'
  );
  const specBytes = files.get(`${SPEC_DIR_NAME}/project/spec_manifest.json`)!;
  const spec = JSON.parse(specBytes.toString('utf8'));
  const merged = await readSuccessfulProjectSpecMergeHistoryEvidence({
    projectRoot: root,
    workItemDir: wi,
    workItemId: input.workItemId,
  });
  requireFact(
    merged &&
      spec.last_merged_work_item === input.workItemId &&
      spec.project_spec_version === merged.project_spec_version,
    'MERGED_SPEC_IDENTITY_INVALID'
  );
  const baseline = JSON.parse(read('implementation_baseline.json').toString('utf8'));
  const currentBaseline = await captureImplementationBaseline(root, input.workItemId);
  requireFact(baseline.snapshot_id === currentBaseline.snapshot_id, 'IMPLEMENTATION_BYTES_CHANGED');
  const log = files.get(
    path.relative(root, path.join(wi, 'write_guard_log.jsonl')).replace(/\\/g, '/')
  );
  if (log)
    for (const line of log.toString('utf8').split(/\r?\n/).filter(Boolean)) {
      const entry = JSON.parse(line) as Record<string, unknown>;
      requireFact(
        typeof entry.allowed === 'boolean' && typeof entry.path === 'string',
        'WRITE_HISTORY_INVALID'
      );
      if (entry.allowed) {
        const relative = path.relative(root, path.resolve(root, entry.path)).replace(/\\/g, '/');
        requireFact(relative.startsWith(SPEC_DIR_NAME + '/'), 'IMPLEMENTATION_WRITE_RECORDED');
      }
    }
  const checks = await Promise.all(
    [
      checkProjectGovernanceConsistency,
      checkProjectGovernanceContracts,
      checkProjectGovernanceTrace,
    ].map(check => check({ projectRoot: root, workItemDir: wi, workItemId: input.workItemId }))
  );
  const invalidity = checks.flatMap(result =>
    result.checks.filter(check => !check.passed).map(check => check.check_id)
  );
  requireFact(invalidity.length > 0, 'INVALIDITY_NOT_PROVEN');
  const inputs = Object.fromEntries(
    [...files].map(([name, content]) => [name, { sha256: hash(content), size: content.length }])
  );
  const core = {
    schema_version: 'preimplementation-recovery/v1' as const,
    work_item_id: input.workItemId,
    blocked_event_id: last.eventId,
    blocked_at: last.ts,
    history_sha256: hash(canonicalVerificationJson(events)),
    state_history: events,
    project_spec_version: spec.project_spec_version,
    spec_sha256: hash(specBytes),
    baseline_id: baseline.snapshot_id,
    task_sha256: hash(read('candidates/tasks.md')),
    invalidity,
    inputs,
  };
  const proof: Proof = { ...core, binding_sha256: hash(canonicalVerificationJson(core)) };
  await assertInputs(input, proof);
  return { proof, files };
}

async function assertInputs(input: Input, proof: Proof, record?: RecordValue) {
  const root = path.resolve(input.projectRoot),
    wi = path.join(root, SPEC_DIR_NAME, 'work-items', input.workItemId);
  const current = await collect(root, wi);
  requireFact(current.size === Object.keys(proof.inputs).length, 'INPUT_SET_CHANGED');
  for (const [name, expected] of Object.entries(proof.inputs)) {
    const bytes = current.get(name);
    const target =
      name === path.relative(root, path.join(wi, 'user_decision.json')).replace(/\\/g, '/')
        ? record?.decision
        : name === path.relative(root, path.join(wi, 'candidate_manifest.json')).replace(/\\/g, '/')
          ? record?.manifest
          : undefined;
    requireFact(
      bytes &&
        (hash(bytes) === expected.sha256 || (target && bytes.toString('utf8') === target.after)),
      'INPUT_CHANGED:' + name
    );
  }
  const { events, last } = await history(input);
  requireFact(
    last?.eventId === proof.blocked_event_id &&
      hash(canonicalVerificationJson(events)) === proof.history_sha256,
    'HISTORY_CHANGED'
  );
  requireFact(
    (await captureImplementationBaseline(root, input.workItemId)).snapshot_id === proof.baseline_id,
    'IMPLEMENTATION_BYTES_CHANGED'
  );
  requireFact(
    guardHardStop(root, input.workItemId, 'sf_state_transition').allowed,
    'HARD_STOP_ACTIVE'
  );
}

async function authorize(input: Input, proof: Proof) {
  const verifier = input.deps.toolInvocationVerifier;
  requireFact(
    verifier?.readRequiredVerificationSource && typeof input.context?.callID === 'string',
    'SOURCE_REQUIRED'
  );
  const source = RequiredVerificationSourceSchema.parse(
    await verifier.readRequiredVerificationSource({
      directory: input.projectRoot,
      sessionId: input.context.sessionID,
      messageId: input.context.messageID,
      callId: input.context.callID,
      tool: 'sf_state_transition',
      args: input.args,
    })
  );
  const text = input.args.user_authorization_text;
  const line = `${PREFIX} ${input.workItemId} ${proof.blocked_event_id} ${proof.binding_sha256}`;
  requireFact(
    typeof text === 'string' &&
      Buffer.byteLength(text) <= 128 * 1024 &&
      text.split(/\r?\n/).filter(value => value.startsWith(PREFIX)).length === 1 &&
      text.split(/\r?\n/).includes(line),
    'EXPLICIT_CONFIRMATION_REQUIRED'
  );
  requireFact(
    source.agent === 'sf-orchestrator' &&
      source.tool === 'sf_state_transition' &&
      source.callId === input.context.callID &&
      source.sessionId === input.context.sessionID &&
      source.messageId === input.context.messageID &&
      path.resolve(source.directory) === path.resolve(input.projectRoot) &&
      source.inputSha256 === hash(canonicalVerificationJson(input.args)) &&
      source.userTextSha256 === hash(text) &&
      source.userCreatedAt >= proof.blocked_at &&
      source.userCreatedAt <= Date.now(),
    'CONFIRMATION_SOURCE_INVALID'
  );
  return { source, line };
}

async function verifyArchive(wi: string, record: RecordValue) {
  requireFact(
    /^recovery_generations\/preimplementation-[a-f0-9-]+$/.test(record.archive),
    'ARCHIVE_PATH_INVALID'
  );
  const root = path.join(wi, record.archive);
  const manifestBytes = await readVerificationFile(path.join(root, 'manifest.json'));
  requireFact(hash(manifestBytes) === record.archive_manifest_sha256, 'ARCHIVE_MANIFEST_CHANGED');
  const manifest = JSON.parse(manifestBytes.toString('utf8'));
  requireFact(
    canonicalVerificationJson(manifest) === canonicalVerificationJson(record.proof),
    'ARCHIVE_PROOF_CHANGED'
  );
  for (const [name, value] of Object.entries(record.proof.inputs)) {
    requireFact(
      name.startsWith(SPEC_DIR_NAME + '/') && !name.split('/').includes('..'),
      'ARCHIVE_ENTRY_INVALID'
    );
    const bytes = await readVerificationFile(path.join(root, 'snapshot', name));
    requireFact(
      hash(bytes) === value.sha256 && bytes.length === value.size,
      'ARCHIVE_BYTES_CHANGED'
    );
  }
}

/** Called only by the existing state owner under the shared candidate mutation barrier. */
export async function handlePreimplementationSpecRecovery(input: Input) {
  requireFact(input.context?.agent === 'sf-orchestrator', 'OWNER_REQUIRED');
  requireFact(
    input.args.from_state === 'blocked' && input.args.to_state === 'candidate_preparing',
    'TARGET_INVALID'
  );
  const mode = input.args.preimplementation_recovery;
  requireFact(mode === 'inspect' || mode === 'recover', 'MODE_INVALID');
  requireFact(
    input.deps.toolInvocationVerifier?.verifyToolInvocation &&
      input.context?.messageID &&
      input.context?.sessionID,
    'INVOCATION_REQUIRED'
  );
  const invocation = (await input.deps.toolInvocationVerifier.verifyToolInvocation({
    tool: 'sf_state_transition',
    args: input.args,
    directory: input.projectRoot,
    sessionId: input.context.sessionID,
    messageId: input.context.messageID,
  })) as Record<string, unknown>;
  requireFact(
    invocation?.source === 'runtime-tool-invocation/v1' &&
      invocation.agent === 'sf-orchestrator' &&
      invocation.tool === 'sf_state_transition' &&
      invocation.callId === input.context.callID &&
      invocation.sessionId === input.context.sessionID &&
      invocation.messageId === input.context.messageID &&
      typeof invocation.directory === 'string' &&
      path.resolve(invocation.directory) === path.resolve(input.projectRoot) &&
      invocation.inputSha256 === hash(canonicalVerificationJson(input.args)) &&
      typeof invocation.startedAt === 'number' &&
      Number.isSafeInteger(invocation.startedAt) &&
      Date.now() >= invocation.startedAt &&
      Date.now() - invocation.startedAt <= 300000,
    'INVOCATION_INVALID'
  );
  requireFact(
    guardHardStop(input.projectRoot, input.workItemId, 'sf_state_transition').allowed,
    'HARD_STOP_ACTIVE'
  );
  const wi = path.join(input.projectRoot, SPEC_DIR_NAME, 'work-items', input.workItemId);
  const prior = await readOptional(path.join(wi, RECORD));
  let record: RecordValue | undefined = prior
    ? PreimplementationRecoveryRecordSchema.parse(JSON.parse(prior.toString('utf8')))
    : undefined;
  if (record) {
    requireFact(
      record.schema_version === 'preimplementation-recovery/v1' &&
        record.work_item_id === input.workItemId,
      'RECORD_INVALID'
    );
    await verifyArchive(wi, record);
    await assertPreservedRecoveryTask(wi);
    const { last } = await history(input);
    if (
      last?.payload.to_state === 'candidate_preparing' &&
      last.payload.transition_context?.preimplementation_recovery?.binding_sha256 ===
        record.proof.binding_sha256
    ) {
      if (mode === 'recover') {
        record.status = 'applied';
        await atomic(path.join(wi, RECORD), json(record));
      }
      return {
        success: true,
        idempotent: true,
        state_advanced: false,
        current_state: 'candidate_preparing',
      };
    }
    requireFact(record.status === 'prepared', 'RECORD_ALREADY_CONSUMED');
    await assertInputs(input, record.proof, record);
  }
  const inspected = record ? null : await inspect(input);
  const proof = record?.proof ?? inspected!.proof;
  const authorizationLine = `${PREFIX} ${input.workItemId} ${proof.blocked_event_id} ${proof.binding_sha256}`;
  if (mode === 'inspect')
    return {
      success: true,
      state_advanced: false,
      work_item_id: input.workItemId,
      proof,
      authorization_line: authorizationLine,
    };
  const authorization = await authorize(input, proof);
  if (!record) {
    const archive = 'recovery_generations/preimplementation-' + randomUUID();
    const archiveRoot = path.join(wi, archive);
    await assertInputs(input, proof);
    await assertVerificationPath(archiveRoot, true);
    await fs.mkdir(archiveRoot, { recursive: true });
    for (const [name, bytes] of inspected!.files) {
      const file = path.join(archiveRoot, 'snapshot', name);
      await fs.mkdir(path.dirname(file), { recursive: true });
      await fs.writeFile(file, bytes, { flag: 'wx' });
    }
    const manifestText = json(proof);
    await fs.writeFile(path.join(archiveRoot, 'manifest.json'), manifestText, { flag: 'wx' });
    const decision = await prepareUserDecisionInvalidation(
      wi,
      'D32 preimplementation specification repair: ' + proof.binding_sha256
    );
    const manifestBefore = (
      await readVerificationFile(path.join(wi, 'candidate_manifest.json'))
    ).toString('utf8');
    const manifestAfter = {
      ...JSON.parse(manifestBefore),
      base_spec_version: proof.project_spec_version,
      project_spec_precondition_sha256: 'sha256:' + proof.spec_sha256,
    };
    record = {
      schema_version: 'preimplementation-recovery/v1',
      status: 'prepared',
      work_item_id: input.workItemId,
      proof,
      archive,
      archive_manifest_sha256: hash(manifestText),
      decision,
      manifest: { before: manifestBefore, after: json(manifestAfter) },
      source: authorization.source,
      authorization_line: authorization.line,
    };
    await verifyArchive(wi, record);
    await assertInputs(input, proof);
    await atomic(path.join(wi, RECORD), json(record));
  }
  await assertInputs(input, proof, record);
  await commitPreparedUserDecisionInvalidation(wi, record.decision);
  await assertInputs(input, proof, record);
  await commitPreparedCandidateRebase(wi, record.manifest);
  await assertInputs(input, proof, record);
  await assertPreservedRecoveryTask(wi);
  const { manager } = await history(input);
  try {
    await manager.transition(
      input.workItemId,
      'blocked',
      'candidate_preparing',
      'sf-orchestrator',
      'feature_spec',
      {
        evidence:
          'D32 archived invalid merged specification; frozen Task preserved; new Candidate requires explicit user approval',
        transition_context: {
          source: 'preimplementation_spec_recovery',
          preimplementation_recovery: {
            blocked_event_id: proof.blocked_event_id,
            binding_sha256: proof.binding_sha256,
            archive_manifest_sha256: record.archive_manifest_sha256,
          },
        },
      }
    );
  } catch (error) {
    const { last } = await history(input);
    if (
      last?.payload.to_state !== 'candidate_preparing' ||
      last.payload.transition_context?.preimplementation_recovery?.binding_sha256 !==
        proof.binding_sha256
    )
      throw error;
    // WAL may have committed before checkpoint publication failed. Do not replay it.
  }
  record.status = 'applied';
  let finalizePending = false;
  try {
    await atomic(path.join(wi, RECORD), json(record));
  } catch {
    finalizePending = true;
  }
  return {
    success: true,
    state_advanced: true,
    from_state: 'blocked',
    to_state: 'candidate_preparing',
    archive: record.archive,
    frozen_task_sha256: proof.task_sha256,
    candidate_approval_required: true,
    finalize_pending: finalizePending,
  };
}
