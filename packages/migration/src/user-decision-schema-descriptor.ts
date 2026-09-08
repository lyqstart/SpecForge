import {
  USER_DECISION_SCHEMA_VERSION,
  validateCurrentUserDecisionValue,
} from '@specforge/types';

import type { PersistentFileSchemaDescriptor } from './schema-descriptor-registry';

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
    transitions: [],
  };
}
