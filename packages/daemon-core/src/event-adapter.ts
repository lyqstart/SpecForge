/**
 * Event type adapter — safely converts daemon-core Event to observability Event.
 *
 * Fixes C4 (Event type incompatibility): daemon-core Event.actor is optional
 * string, while observability Event.actor is required AgentIdentity | null.
 * This adapter fills in missing required fields with sensible defaults,
 * eliminating the unsafe `as unknown as` cast.
 *
 * Pure function — zero side effects, zero I/O.
 */

import type { Event as DaemonEvent } from './types';
import type { Event as ObservabilityEvent } from '@specforge/observability';
import type { AgentIdentity } from '@specforge/observability';

/**
 * Safely convert a daemon-core Event to an observability Event.
 * Fills in required fields that may be missing in daemon-core Event
 * with sensible defaults.
 *
 * Field mapping:
 * - actor: string → AgentIdentity (with defaults), else null
 * - schema_version: default '1.0'
 * - monotonicSeq: default 0
 * - projectId: default ''
 * - category: default 'system'
 * - workItemId: default null
 * - payload: passed through as-is
 * - payloadBlobRef: not set (daemon-core events don't use CAS blobs)
 *
 * Errors: none — always returns a valid ObservabilityEvent (defensive defaults)
 */
export function toObservabilityEvent(event: DaemonEvent): ObservabilityEvent {
  const actor: AgentIdentity | null =
    typeof event.actor === 'string'
      ? {
          sessionId: event.actor,
          agentRole: 'system',
          workflowRole: 'orchestrator',
          parentSessionId: null,
          workItemId: event.projectId || '',
          spawnIntentId: '',
        }
      : null;

  return {
    schema_version: '1.0',
    eventId: event.eventId,
    ts: event.ts,
    monotonicSeq: event.monotonicSeq || 0,
    projectId: event.projectId || '',
    workItemId: event.workItemId || null,
    actor,
    category: (event.category as ObservabilityEvent['category']) || 'system',
    action: event.action,
    payload: event.payload,
    // payloadBlobRef: not set — daemon-core events don't use CAS blobs
  };
}
