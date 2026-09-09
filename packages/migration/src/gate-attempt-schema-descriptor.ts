import {
  GATE_ATTEMPT_SCHEMA_VERSION,
  validateCurrentGateAttemptInputSnapshotValue,
  validateCurrentGateAttemptResultValue,
  validateCurrentGateAttemptStartValue,
  validateCurrentGateReportValue,
} from '@specforge/types';

import type { PersistentFileSchemaDescriptor } from './schema-descriptor-registry';

function identityMatches(
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
      identityMatches(value, workItemId, attemptId)
      && validateCurrentGateAttemptStartValue(value).valid,
    transitions: [],
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
      identityMatches(value, workItemId, attemptId)
      && validateCurrentGateAttemptResultValue(value).valid,
    transitions: [],
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
      identityMatches(value, workItemId, attemptId)
      && validateCurrentGateAttemptInputSnapshotValue(value).valid,
    transitions: [],
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
    transitions: [],
  };
}
