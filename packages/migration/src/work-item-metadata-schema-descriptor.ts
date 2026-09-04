import {
  WORK_ITEM_METADATA_SCHEMA_VERSION,
  validateCurrentWorkItemMetadataJson,
} from '@specforge/types'

import type { PersistentFileSchemaDescriptor } from './schema-descriptor-registry'

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
      if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
      return validateCurrentWorkItemMetadataJson(JSON.stringify(value), workItemId).valid
    },
    transitions: [],
  }
}
