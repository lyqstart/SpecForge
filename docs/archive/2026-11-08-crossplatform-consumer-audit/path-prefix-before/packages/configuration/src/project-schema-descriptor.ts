import type { PersistentFileSchemaDescriptor } from '@specforge/types/schema-contract'

import { CONFIG_SCHEMA_VERSION } from './constants'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Current project configuration contract consumed before Daemon accepts a
 * project context. The registry itself verifies the root schema_version.
 */
export const PROJECT_CONFIG_SCHEMA_DESCRIPTOR: PersistentFileSchemaDescriptor = {
  id: 'project-config',
  owner: '@specforge/configuration/project',
  relativePath: '.specforge/config/project.json',
  format: 'json',
  required: true,
  currentSchemaId: CONFIG_SCHEMA_VERSION,
  validateCurrent: isRecord,
}
