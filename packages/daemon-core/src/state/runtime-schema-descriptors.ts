import type { PersistentFileSchemaDescriptor } from '@specforge/migration'
import type { ProjectState } from '../types'

const RUNTIME_SCHEMA_VERSION = '1.0' as const

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function isCurrentRuntimeEvent(value: unknown): boolean {
  if (!isRecord(value)) return false
  return (
    value.schema_version === RUNTIME_SCHEMA_VERSION
    && typeof value.eventId === 'string'
    && value.eventId.length > 0
    && typeof value.ts === 'number'
    && Number.isInteger(value.monotonicSeq)
    && (value.monotonicSeq as number) > 0
    && typeof value.projectId === 'string'
    && value.projectId.length > 0
    && typeof value.actor === 'string'
    && value.actor.length > 0
    && typeof value.category === 'string'
    && value.category.length > 0
    && typeof value.action === 'string'
    && value.action.length > 0
    && isRecord(value.payload)
  )
}

export function serializeRuntimeCheckpoint(
  state: ProjectState,
): Omit<ProjectState, 'schemaVersion'> & { schema_version: '1.0' } {
  const { schemaVersion: _schemaVersion, ...checkpoint } = state
  return { ...checkpoint, schema_version: RUNTIME_SCHEMA_VERSION }
}

export function deserializeRuntimeCheckpoint(value: unknown): ProjectState {
  if (!isRecord(value) || value.schema_version !== RUNTIME_SCHEMA_VERSION) {
    throw new Error('RUNTIME_CHECKPOINT_SCHEMA_INVALID')
  }
  const { schema_version: _schemaVersion, ...checkpoint } = value
  return {
    ...(checkpoint as unknown as Omit<ProjectState, 'schemaVersion'>),
    schemaVersion: RUNTIME_SCHEMA_VERSION,
  }
}

export const RUNTIME_SCHEMA_DESCRIPTORS: readonly PersistentFileSchemaDescriptor[] = [
  {
    id: 'runtime-checkpoint',
    owner: '@specforge/daemon-core/state-manager',
    relativePath: 'state.json',
    format: 'json',
    required: false,
    currentSchemaId: RUNTIME_SCHEMA_VERSION,
    validateCurrent: (value: unknown): boolean => {
      if (!isRecord(value)) return false
      return (
        Number.isInteger(value.stateVersion)
        && (value.stateVersion as number) >= 0
        && typeof value.projectPath === 'string'
        && value.projectPath.length > 0
        && Array.isArray(value.activeSessions)
        && Array.isArray(value.workItems)
        && typeof value.lastEventId === 'string'
        && typeof value.lastEventTs === 'number'
      )
    },
    transitions: [],
  },
  {
    id: 'runtime-wal',
    owner: '@specforge/daemon-core/wal',
    relativePath: 'events.jsonl',
    format: 'jsonl',
    required: false,
    currentSchemaId: RUNTIME_SCHEMA_VERSION,
    validateCurrent: isCurrentRuntimeEvent,
    transitions: [],
  },
]
