import {
  HARD_STOP_RESOLUTION_SCHEMA_VERSION,
  HARD_STOP_SCHEMA_VERSION,
  validateCurrentHardStopRecordValue,
  validateCurrentHardStopResolutionRecordValue,
  type HardStopScope,
} from '@specforge/types';

import type { PersistentFileSchemaDescriptor } from './schema-descriptor-registry';

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
    transitions: [],
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
    transitions: [],
  };
}
