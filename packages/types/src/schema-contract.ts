import { readFile } from 'node:fs/promises';
import { isAbsolute, relative, resolve, sep } from 'node:path';

import {
  WORK_ITEM_METADATA_SCHEMA_VERSION,
  validateCurrentWorkItemMetadataJson,
} from './work-item-metadata-contract.js';
import {
  USER_DECISION_SCHEMA_VERSION,
  validateCurrentUserDecisionValue,
} from './user-decision-contract.js';
import {
  CANDIDATE_MANIFEST_SCHEMA_VERSION,
  validateCurrentCandidateManifestValue,
} from './candidate-manifest-contract.js';
import {
  GATE_ATTEMPT_SCHEMA_VERSION,
  validateCurrentGateAttemptInputSnapshotValue,
  validateCurrentGateAttemptResultValue,
  validateCurrentGateAttemptStartValue,
  validateCurrentGateReportValue,
} from './gate-attempt-contract.js';
import {
  HARD_STOP_RESOLUTION_SCHEMA_VERSION,
  HARD_STOP_SCHEMA_VERSION,
  validateCurrentHardStopRecordValue,
  validateCurrentHardStopResolutionRecordValue,
  type HardStopScope,
} from './hard-stop-contract.js';
import {
  WRITE_GUARD_AUTHORIZATION_SCHEMA_VERSION,
  validateCurrentWriteGuardAuthorizationRecordValue,
} from './write-guard-authorization-contract.js';
import {
  ATOMIC_SPEC_MERGE_WRITE_PROVENANCE_SCHEMA_VERSION,
  GIT_GOVERNANCE_WRITE_PROVENANCE_SCHEMA_VERSION,
  validateAtomicSpecMergeWriteProvenanceValue,
  validateGitGovernanceWriteProvenanceValue,
} from './control-plane-write-provenance-contract.js';

/**
 * Current persistent-file contract.
 *
 * This contract intentionally has no migration/transition semantics. A file is
 * either current, an optional file is absent, or the boundary fails closed.
 */
export interface PersistentFileSchemaDescriptor {
  id: string;
  owner: string;
  relativePath: string;
  format: 'json' | 'jsonl';
  required: boolean;
  currentSchemaId: string;
  validateCurrent: (value: unknown) => boolean;
}

export type SchemaDescriptorCheckStatus =
  | 'current'
  | 'missing_optional'
  | 'blocked';

export type SchemaDescriptorErrorCode =
  | 'DESCRIPTOR_INVALID'
  | 'DESCRIPTOR_DUPLICATE'
  | 'PATH_OUTSIDE_ROOT'
  | 'FILE_REQUIRED'
  | 'FILE_READ_FAILED'
  | 'FILE_PARSE_FAILED'
  | 'SCHEMA_ID_MISSING'
  | 'SCHEMA_ID_INCONSISTENT'
  | 'SCHEMA_VERSION_MISMATCH'
  | 'VALIDATION_FAILED';

export interface SchemaDescriptorCheck {
  descriptorId: string;
  owner: string;
  relativePath: string;
  status: SchemaDescriptorCheckStatus;
  observedSchemaId?: string;
  currentSchemaId: string;
  errorCode?: SchemaDescriptorErrorCode;
  error?: string;
}

export interface SchemaDescriptorPrecheckResult {
  ok: boolean;
  checks: SchemaDescriptorCheck[];
}

function blocked(
  descriptor: PersistentFileSchemaDescriptor,
  errorCode: SchemaDescriptorErrorCode,
  error: string,
  observedSchemaId?: string,
): SchemaDescriptorCheck {
  return {
    descriptorId: descriptor.id,
    owner: descriptor.owner,
    relativePath: descriptor.relativePath,
    status: 'blocked',
    observedSchemaId,
    currentSchemaId: descriptor.currentSchemaId,
    errorCode,
    error,
  };
}

function descriptorError(descriptor: PersistentFileSchemaDescriptor): string | undefined {
  if (!descriptor.id.trim()) return 'descriptor id is empty';
  if (!descriptor.owner.trim()) return 'descriptor owner is empty';
  if (!descriptor.relativePath.trim()) return 'descriptor relativePath is empty';
  if (!descriptor.currentSchemaId.trim()) return 'descriptor currentSchemaId is empty';
  if (descriptor.format !== 'json' && descriptor.format !== 'jsonl') {
    return `unsupported descriptor format: ${String(descriptor.format)}`;
  }
  return undefined;
}

function resolveWithinRoot(root: string, relativePath: string): string | undefined {
  if (isAbsolute(relativePath)) return undefined;
  const absoluteRoot = resolve(root);
  const absolutePath = resolve(
    absoluteRoot,
    ...relativePath.replace(/\\/g, '/').split('/'),
  );
  const fromRoot = relative(absoluteRoot, absolutePath);
  if (
    !fromRoot
    || fromRoot === '..'
    || fromRoot.startsWith(`..${sep}`)
    || isAbsolute(fromRoot)
  ) {
    return undefined;
  }
  return absolutePath;
}

function parseVersionedValues(
  content: string,
  format: PersistentFileSchemaDescriptor['format'],
): { values?: unknown[]; error?: string } {
  try {
    if (format === 'json') return { values: [JSON.parse(content) as unknown] };
    const lines = content.split(/\r?\n/).filter((line) => line.trim().length > 0);
    if (lines.length === 0) return { error: 'JSONL file is empty' };
    return { values: lines.map((line) => JSON.parse(line) as unknown) };
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}

function readSchemaIds(
  values: readonly unknown[],
): { schemaId?: string; errorCode?: SchemaDescriptorErrorCode } {
  const ids: string[] = [];
  for (const value of values) {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      return { errorCode: 'SCHEMA_ID_MISSING' };
    }
    const schemaId = (value as Record<string, unknown>).schema_version;
    if (typeof schemaId !== 'string' || !schemaId.trim()) {
      return { errorCode: 'SCHEMA_ID_MISSING' };
    }
    ids.push(schemaId);
  }
  if (new Set(ids).size !== 1) {
    return { errorCode: 'SCHEMA_ID_INCONSISTENT' };
  }
  return { schemaId: ids[0] };
}

async function checkDescriptor(
  root: string,
  descriptor: PersistentFileSchemaDescriptor,
): Promise<SchemaDescriptorCheck> {
  const invalid = descriptorError(descriptor);
  if (invalid) return blocked(descriptor, 'DESCRIPTOR_INVALID', invalid);

  const filePath = resolveWithinRoot(root, descriptor.relativePath);
  if (!filePath) {
    return blocked(
      descriptor,
      'PATH_OUTSIDE_ROOT',
      'descriptor path escapes the supplied root',
    );
  }

  let content: string;
  try {
    content = await readFile(filePath, 'utf8');
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === 'ENOENT' && !descriptor.required) {
      return {
        descriptorId: descriptor.id,
        owner: descriptor.owner,
        relativePath: descriptor.relativePath,
        status: 'missing_optional',
        currentSchemaId: descriptor.currentSchemaId,
      };
    }
    return blocked(
      descriptor,
      code === 'ENOENT' ? 'FILE_REQUIRED' : 'FILE_READ_FAILED',
      code === 'ENOENT'
        ? 'required persistent file is missing'
        : 'persistent file could not be read',
    );
  }

  const parsed = parseVersionedValues(content, descriptor.format);
  if (!parsed.values) {
    return blocked(
      descriptor,
      'FILE_PARSE_FAILED',
      parsed.error ?? 'parse failed',
    );
  }

  const schema = readSchemaIds(parsed.values);
  if (!schema.schemaId) {
    return blocked(
      descriptor,
      schema.errorCode ?? 'SCHEMA_ID_MISSING',
      'schema_version is missing or inconsistent',
    );
  }

  if (schema.schemaId !== descriptor.currentSchemaId) {
    return blocked(
      descriptor,
      'SCHEMA_VERSION_MISMATCH',
      `unsupported schema_version "${schema.schemaId}"; expected "${descriptor.currentSchemaId}"`,
      schema.schemaId,
    );
  }

  if (!parsed.values.every((value) => descriptor.validateCurrent(value))) {
    return blocked(
      descriptor,
      'VALIDATION_FAILED',
      'current-schema validation failed',
      schema.schemaId,
    );
  }

  return {
    descriptorId: descriptor.id,
    owner: descriptor.owner,
    relativePath: descriptor.relativePath,
    status: 'current',
    observedSchemaId: schema.schemaId,
    currentSchemaId: descriptor.currentSchemaId,
  };
}

export async function precheckSchemaDescriptors(
  root: string,
  descriptors: readonly PersistentFileSchemaDescriptor[],
): Promise<SchemaDescriptorPrecheckResult> {
  const seen = new Set<string>();
  const checks: SchemaDescriptorCheck[] = [];

  for (const descriptor of descriptors) {
    if (seen.has(descriptor.id)) {
      checks.push(
        blocked(
          descriptor,
          'DESCRIPTOR_DUPLICATE',
          'descriptor id is duplicated',
        ),
      );
      continue;
    }
    seen.add(descriptor.id);
    checks.push(await checkDescriptor(root, descriptor));
  }

  return {
    ok: checks.every((check) => check.status !== 'blocked'),
    checks,
  };
}

export function createWorkItemMetadataSchemaDescriptor(
  workItemId: string,
): PersistentFileSchemaDescriptor {
  return {
    id: `work-item-metadata-${workItemId}`,
    owner: '@specforge/types/work-item-metadata',
    relativePath: 'work_item.json',
    format: 'json',
    required: true,
    currentSchemaId: WORK_ITEM_METADATA_SCHEMA_VERSION,
    validateCurrent: (value: unknown): boolean => {
      if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        return false;
      }
      return validateCurrentWorkItemMetadataJson(
        JSON.stringify(value),
        workItemId,
      ).valid;
    },
  };
}

export function createUserDecisionSchemaDescriptor(
  workItemId: string,
): PersistentFileSchemaDescriptor {
  return {
    id: `user-decision-${workItemId}`,
    owner: '@specforge/daemon-core/user-decision-recorder',
    relativePath: 'user_decision.json',
    format: 'json',
    required: false,
    currentSchemaId: USER_DECISION_SCHEMA_VERSION,
    validateCurrent: (value: unknown): boolean =>
      validateCurrentUserDecisionValue(value, workItemId).valid,
  };
}

export function createCandidateManifestSchemaDescriptor(
  workItemId: string,
): PersistentFileSchemaDescriptor {
  return {
    id: `candidate-manifest-${workItemId}`,
    owner: '@specforge/daemon-core/candidate-prepare-freeze-transaction',
    relativePath: 'candidate_manifest.json',
    format: 'json',
    required: true,
    currentSchemaId: CANDIDATE_MANIFEST_SCHEMA_VERSION,
    validateCurrent: (value: unknown): boolean =>
      validateCurrentCandidateManifestValue(value, workItemId).valid,
  };
}

function gateAttemptIdentityMatches(
  value: unknown,
  workItemId: string,
  attemptId: string,
): boolean {
  return typeof value === 'object'
    && value !== null
    && !Array.isArray(value)
    && (value as Record<string, unknown>).work_item_id === workItemId
    && (value as Record<string, unknown>).attempt_id === attemptId;
}

export function createGateAttemptStartSchemaDescriptor(
  workItemId: string,
  attemptId: string,
): PersistentFileSchemaDescriptor {
  return {
    id: `gate-attempt-start-${workItemId}-${attemptId}`,
    owner: '@specforge/daemon-core/gate-attempt-transaction',
    relativePath: 'attempt-start.json',
    format: 'json',
    required: true,
    currentSchemaId: GATE_ATTEMPT_SCHEMA_VERSION,
    validateCurrent: (value: unknown): boolean =>
      gateAttemptIdentityMatches(value, workItemId, attemptId)
      && validateCurrentGateAttemptStartValue(value).valid,
  };
}

export function createGateAttemptResultSchemaDescriptor(
  workItemId: string,
  attemptId: string,
): PersistentFileSchemaDescriptor {
  return {
    id: `gate-attempt-result-${workItemId}-${attemptId}`,
    owner: '@specforge/daemon-core/gate-attempt-transaction',
    relativePath: 'attempt-result.json',
    format: 'json',
    required: true,
    currentSchemaId: GATE_ATTEMPT_SCHEMA_VERSION,
    validateCurrent: (value: unknown): boolean =>
      gateAttemptIdentityMatches(value, workItemId, attemptId)
      && validateCurrentGateAttemptResultValue(value).valid,
  };
}

export function createGateAttemptInputSnapshotSchemaDescriptor(
  workItemId: string,
  attemptId: string,
): PersistentFileSchemaDescriptor {
  return {
    id: `gate-attempt-input-snapshot-${workItemId}-${attemptId}`,
    owner: '@specforge/daemon-core/gate-attempt-transaction',
    relativePath: 'input-snapshot.json',
    format: 'json',
    required: true,
    currentSchemaId: GATE_ATTEMPT_SCHEMA_VERSION,
    validateCurrent: (value: unknown): boolean =>
      gateAttemptIdentityMatches(value, workItemId, attemptId)
      && validateCurrentGateAttemptInputSnapshotValue(value).valid,
  };
}

export function createGateAttemptReportSchemaDescriptor(
  workItemId: string,
  attemptId: string,
  gateId: string,
): PersistentFileSchemaDescriptor {
  return {
    id: `gate-attempt-report-${workItemId}-${attemptId}-${gateId}`,
    owner: '@specforge/daemon-core/gate-attempt-transaction',
    relativePath: `gates/${gateId}.json`,
    format: 'json',
    required: true,
    currentSchemaId: GATE_ATTEMPT_SCHEMA_VERSION,
    validateCurrent: (value: unknown): boolean => {
      const validated = validateCurrentGateReportValue(value);
      return validated.valid
        && validated.value?.work_item_id === workItemId
        && validated.value?.gate_id === gateId;
    },
  };
}

export function createHardStopLatchSchemaDescriptor(
  workItemId: string,
  scope: HardStopScope = 'work_item',
): PersistentFileSchemaDescriptor {
  return {
    id: `hard-stop-latch-${scope}-${workItemId}`,
    owner: '@specforge/daemon-core/hard-stop-transaction',
    relativePath: 'hard_stop.json',
    format: 'json',
    required: false,
    currentSchemaId: HARD_STOP_SCHEMA_VERSION,
    validateCurrent: (value: unknown): boolean => {
      const validated = validateCurrentHardStopRecordValue(value);
      return validated.valid
        && validated.value?.scope === scope
        && validated.value.work_item_id === workItemId;
    },
  };
}

export function createHardStopResolutionLogSchemaDescriptor(
  workItemId: string,
): PersistentFileSchemaDescriptor {
  return {
    id: `hard-stop-resolution-log-${workItemId}`,
    owner: '@specforge/daemon-core/hard-stop-transaction',
    relativePath: 'hard_stop_resolution.jsonl',
    format: 'jsonl',
    required: false,
    currentSchemaId: HARD_STOP_RESOLUTION_SCHEMA_VERSION,
    validateCurrent: (value: unknown): boolean => {
      const validated = validateCurrentHardStopResolutionRecordValue(value);
      return validated.valid
        && validated.value?.work_item_id === workItemId
        && validated.value.scope === 'work_item'
        && validated.value.original_hard_stop.work_item_id === workItemId
        && validated.value.original_hard_stop.scope === 'work_item'
        && validated.value.original_hard_stop.hard_stop_id === validated.value.hard_stop_id;
    },
  };
}

export function createWriteGuardAuthorizationLogSchemaDescriptor(): PersistentFileSchemaDescriptor {
  return {
    id: 'write-guard-authorization-log',
    owner: '@specforge/daemon-core/write-guard-authorization-log',
    relativePath: 'write_guard_authorizations.jsonl',
    format: 'jsonl',
    required: false,
    currentSchemaId: WRITE_GUARD_AUTHORIZATION_SCHEMA_VERSION,
    validateCurrent: (value: unknown): boolean =>
      validateCurrentWriteGuardAuthorizationRecordValue(value).valid,
  };
}

export function createAtomicSpecMergeWriteProvenanceSchemaDescriptor(): PersistentFileSchemaDescriptor {
  return {
    id: 'atomic-spec-merge-write-provenance',
    owner: '@specforge/daemon-core/atomic-spec-merge-write-provenance',
    relativePath: 'atomic_spec_merge_controlled_writes.json',
    format: 'json',
    required: false,
    currentSchemaId: ATOMIC_SPEC_MERGE_WRITE_PROVENANCE_SCHEMA_VERSION,
    validateCurrent: validateAtomicSpecMergeWriteProvenanceValue,
  };
}

export function createGitGovernanceWriteProvenanceSchemaDescriptor(): PersistentFileSchemaDescriptor {
  return {
    id: 'git-governance-write-provenance',
    owner: '@specforge/daemon-core/git-governance-write-provenance',
    relativePath: 'git_governance_controlled_writes.json',
    format: 'json',
    required: false,
    currentSchemaId: GIT_GOVERNANCE_WRITE_PROVENANCE_SCHEMA_VERSION,
    validateCurrent: validateGitGovernanceWriteProvenanceValue,
  };
}
