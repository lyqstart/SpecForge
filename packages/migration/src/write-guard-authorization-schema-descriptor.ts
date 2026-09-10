import {
  WRITE_GUARD_AUTHORIZATION_SCHEMA_VERSION,
  validateCurrentWriteGuardAuthorizationRecordValue,
} from '@specforge/types';
import type { PersistentFileSchemaDescriptor } from './schema-descriptor-registry';

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
    transitions: [],
  };
}
