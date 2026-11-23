import path from 'node:path';
import * as fs from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { RequiredVerificationSourceSchema } from '@specforge/types/required-verification-contract';
import {
  canonicalVerificationJson as canonical,
  assertVerificationPath,
  readVerificationFile,
} from '../../verification/owner-store';
import { PreimplementationRecoveryRecordSchema } from './preimplementation-recovery-contract';

const hash = (bytes: Uint8Array | string) => createHash('sha256').update(bytes).digest('hex');
const REGISTRY = '.specforge/project/extension_registry.json';
function requireFact(value: unknown, code: string): asserts value {
  if (!value) throw new Error('RECOVERED_CONTRACT_' + code);
}
function object(value: unknown): Record<string, unknown> {
  requireFact(value && typeof value === 'object' && !Array.isArray(value), 'OBJECT_REQUIRED');
  return value as Record<string, unknown>;
}
function registryEntry(manifest: Record<string, unknown>) {
  requireFact(Array.isArray(manifest.entries), 'MANIFEST_ENTRIES_REQUIRED');
  const entries = manifest.entries.map(object).filter(e => e.target_path === REGISTRY);
  requireFact(
    entries.length === 1 && entries[0].operation === 'replace',
    'REGISTRY_ENTRY_REQUIRED'
  );
  return entries[0];
}

/** A historical classification is not a new registry edit. Only the D32 owner proof can establish this. */
export async function checkRecoveredContractCarryForward(input: {
  projectRoot: string;
  workItemDir: string;
  classificationFiles: string[];
  readRecoveryHistory?: () => Promise<unknown[]>;
}): Promise<{ passed: boolean; details: string; inputFiles: string[] }> {
  const inputs = new Map<string, Buffer>();
  const read = async (file: string) => {
    const bytes = await readVerificationFile(file);
    const prior = inputs.get(file);
    requireFact(!prior || prior.equals(bytes), 'INPUT_DRIFT');
    inputs.set(file, bytes);
    return bytes;
  };
  try {
    const root = path.resolve(input.projectRoot),
      wi = path.resolve(input.workItemDir);
    const id = path.basename(wi);
    requireFact(wi === path.join(root, '.specforge/work-items', id), 'WORK_ITEM_PATH_INVALID');
    const record = PreimplementationRecoveryRecordSchema.parse(
      JSON.parse(
        (await read(path.join(wi, 'preimplementation_spec_recovery.json'))).toString('utf8')
      )
    );
    const proof = record.proof;
    requireFact(
      record.status === 'applied' && record.work_item_id === id && proof.work_item_id === id,
      'APPLIED_OWNER_RECORD_REQUIRED'
    );
    const source = RequiredVerificationSourceSchema.parse(record.source);
    requireFact(
      source.agent === 'sf-orchestrator' &&
        source.tool === 'sf_state_transition' &&
        path.resolve(source.directory) === root &&
        source.userCreatedAt >= proof.blocked_at,
      'SOURCE_IDENTITY_INVALID'
    );
    requireFact(
      record.authorization_line ===
        `SPECFORGE_PREIMPLEMENTATION_RECOVERY_V1 ${id} ${proof.blocked_event_id} ${proof.binding_sha256}`,
      'AUTHORIZATION_BINDING_INVALID'
    );
    const { binding_sha256, ...core } = proof;
    requireFact(
      hash(canonical(core)) === binding_sha256 &&
        hash(canonical(proof.state_history)) === proof.history_sha256,
      'PROOF_BINDING_INVALID'
    );
    requireFact(input.readRecoveryHistory, 'HISTORY_OWNER_REQUIRED');
    const history = await input.readRecoveryHistory();
    const priorCount = proof.state_history.length;
    requireFact(
      canonical(history.slice(0, priorCount)) === canonical(proof.state_history),
      'HISTORY_PREFIX_CHANGED'
    );
    const blocked = object(history[priorCount - 1]);
    const blockedPayload = object(blocked.payload);
    requireFact(
      blocked.eventId === proof.blocked_event_id &&
        blocked.ts === proof.blocked_at &&
        blockedPayload.from_state === 'implementation_ready' &&
        blockedPayload.to_state === 'blocked',
      'BLOCKED_EVENT_INVALID'
    );
    const recovery = object(history[priorCount]);
    const payload = object(recovery.payload);
    const context = object(payload.transition_context);
    const binding = object(context.preimplementation_recovery);
    requireFact(
      recovery.actor === 'sf-orchestrator' &&
        recovery.action === 'state.transition' &&
        payload.work_item_id === id &&
        payload.from_state === 'blocked' &&
        payload.to_state === 'candidate_preparing' &&
        context.source === 'preimplementation_spec_recovery' &&
        binding.blocked_event_id === proof.blocked_event_id &&
        binding.binding_sha256 === proof.binding_sha256 &&
        binding.archive_manifest_sha256 === record.archive_manifest_sha256,
      'RECOVERY_EVENT_INVALID'
    );
    requireFact(
      !history.some(event =>
        [
          'implementation_running',
          'implementation_done',
          'verification_running',
          'verification_done',
          'closed',
        ].includes(String(object(object(event).payload).to_state))
      ),
      'IMPLEMENTATION_ALREADY_STARTED'
    );

    const archive = path.join(wi, record.archive);
    const archiveManifest = await read(path.join(archive, 'manifest.json'));
    requireFact(
      hash(archiveManifest) === record.archive_manifest_sha256 &&
        canonical(JSON.parse(archiveManifest.toString('utf8'))) === canonical(proof),
      'ARCHIVE_MANIFEST_CHANGED'
    );
    const snapshots = new Map<string, Buffer>();
    const currentFormalFiles: string[] = [];
    const walkFormal = async (directory: string) => {
      await assertVerificationPath(directory);
      for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
        const file = path.join(directory, entry.name);
        await assertVerificationPath(file);
        if (entry.isDirectory()) await walkFormal(file);
        else {
          requireFact(entry.isFile() && currentFormalFiles.length < 4096, 'FORMAL_INPUT_INVALID');
          currentFormalFiles.push(path.relative(root, file).replace(/\\/g, '/'));
        }
      }
    };
    await walkFormal(path.join(root, '.specforge/project'));
    requireFact(
      canonical(currentFormalFiles.sort()) ===
        canonical(
          Object.keys(proof.inputs)
            .filter(name => name.startsWith('.specforge/project/'))
            .sort()
        ),
      'FORMAL_INPUT_SET_CHANGED'
    );
    for (const [name, identity] of Object.entries(proof.inputs)) {
      requireFact(
        name.startsWith('.specforge/') &&
          !name.includes('\\') &&
          !name.includes(':') &&
          name.split('/').every(part => part && part !== '.' && part !== '..'),
        'ARCHIVE_PATH_INVALID'
      );
      const bytes = await read(path.join(archive, 'snapshot', name));
      requireFact(
        bytes.length === identity.size && hash(bytes) === identity.sha256,
        'ARCHIVE_BYTES_CHANGED'
      );
      snapshots.set(name, bytes);
      // The inherited classification applies only to this unchanged formal generation.
      if (name.startsWith('.specforge/project/'))
        requireFact((await read(path.join(root, name))).equals(bytes), 'FORMAL_GENERATION_CHANGED');
    }
    const snapshot = (name: string) => {
      const bytes = snapshots.get(name);
      requireFact(bytes, 'ARCHIVED_INPUT_MISSING');
      return bytes;
    };
    const wiRelative = `.specforge/work-items/${id}/`;
    const specBytes = await read(path.join(root, '.specforge/project/spec_manifest.json'));
    const spec = object(JSON.parse(specBytes.toString('utf8')));
    requireFact(
      hash(specBytes) === proof.spec_sha256 &&
        spec.project_spec_version === proof.project_spec_version &&
        spec.last_merged_work_item === id,
      'BASE_CHANGED'
    );
    requireFact(
      snapshot(wiRelative + 'candidate_manifest.json').toString('utf8') === record.manifest.before,
      'ARCHIVED_MANIFEST_CHANGED'
    );
    const before = object(JSON.parse(record.manifest.before));
    const after = object(JSON.parse(record.manifest.after));
    requireFact(
      canonical(after) ===
        canonical({
          ...before,
          base_spec_version: proof.project_spec_version,
          project_spec_precondition_sha256: 'sha256:' + proof.spec_sha256,
        }),
      'REBASE_PLAN_CHANGED'
    );
    const current = object(
      JSON.parse((await read(path.join(wi, 'candidate_manifest.json'))).toString('utf8'))
    );
    requireFact(
      current.work_item_id === id &&
        current.base_spec_version === after.base_spec_version &&
        current.project_spec_precondition_sha256 === after.project_spec_precondition_sha256,
      'CANDIDATE_BASE_CHANGED'
    );
    const entry = registryEntry(current);
    requireFact(canonical(entry) === canonical(registryEntry(before)), 'REGISTRY_ENTRY_CHANGED');
    requireFact(
      typeof entry.candidate_path === 'string' &&
        !entry.candidate_path.includes('\\') &&
        !entry.candidate_path.includes(':') &&
        !entry.candidate_path.startsWith('/') &&
        entry.candidate_path.split('/').every(part => part && part !== '.' && part !== '..'),
      'CANDIDATE_PATH_INVALID'
    );
    const registry = snapshot(REGISTRY);
    requireFact(
      registry.equals(snapshot(wiRelative + entry.candidate_path)) &&
        registry.equals(await read(path.join(wi, entry.candidate_path))),
      'REGISTRY_NOT_EXACT_CARRY_FORWARD'
    );
    requireFact(input.classificationFiles.length > 0, 'CLASSIFICATION_REQUIRED');
    for (const file of input.classificationFiles) {
      const relative = path.relative(wi, file).replace(/\\/g, '/');
      requireFact(
        ['trigger_result.json', 'change_classification.md'].includes(relative),
        'CLASSIFICATION_PATH_INVALID'
      );
      requireFact(
        (await read(file)).equals(snapshot(wiRelative + relative)),
        'CLASSIFICATION_CHANGED'
      );
    }
    const task = await read(path.join(wi, 'candidates/tasks.md'));
    requireFact(
      hash(task) === proof.task_sha256 && task.equals(snapshot(wiRelative + 'candidates/tasks.md')),
      'FROZEN_TASK_CHANGED'
    );
    requireFact(
      canonical(await input.readRecoveryHistory()) === canonical(history),
      'HISTORY_DRIFT'
    );
    for (const [file, bytes] of inputs)
      requireFact((await readVerificationFile(file)).equals(bytes), 'INPUT_DRIFT');
    return {
      passed: true,
      details: `D32 exact carry-forward; recovery_event=${String(recovery.eventId)}; binding_sha256=${proof.binding_sha256}`,
      inputFiles: [...inputs.keys()],
    };
  } catch (error) {
    return {
      passed: false,
      details: error instanceof Error ? error.message : 'RECOVERED_CONTRACT_PROOF_INVALID',
      inputFiles: [...inputs.keys()],
    };
  }
}
