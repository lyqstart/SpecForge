/**
 * Event Adapter unit tests — TASK-6 regression coverage for CP-4 / C4.
 *
 * Covers:
 *   C4  — Event type adapter correctly converts daemon Event → observability Event
 *   CP-4 — toObservabilityEvent supplies defaults for all required fields
 */

import { describe, it, expect } from 'vitest';
import { toObservabilityEvent } from '../../src/event-adapter';
import type { Event as DaemonEvent } from '../../src/types';
import type { Event as ObservabilityEvent, AgentIdentity } from '@specforge/observability';

/**
 * Minimal daemon-core Event factory.
 */
function makeDaemonEvent(overrides: Partial<DaemonEvent> = {}): DaemonEvent {
  return {
    eventId: 'ev-001',
    ts: 1700000000000,
    projectId: 'proj-hash',
    workItemId: 'WI-025',
    actor: 'agent-session-abc',
    category: 'state',
    action: 'state.transition',
    payload: { from: 'design', to: 'tasks' },
    metadata: { schemaVersion: '1.0', source: 'daemon' },
    ...overrides,
  };
}

// ═══════════════════════════════════════════════════════════════════
// CP-4: Required field defaults
// ═══════════════════════════════════════════════════════════════════

describe('toObservabilityEvent — CP-4 required field defaults', () => {
  it('should set schema_version default to "1.0" when daemon event lacks it', () => {
    const daemonEv = makeDaemonEvent({ schema_version: undefined });
    const obsEv = toObservabilityEvent(daemonEv);
    expect(obsEv.schema_version).toBe('1.0');
  });

  it('should set monotonicSeq default to 0 when daemon event lacks it', () => {
    const daemonEv = makeDaemonEvent({ monotonicSeq: undefined });
    const obsEv = toObservabilityEvent(daemonEv);
    expect(obsEv.monotonicSeq).toBe(0);
  });

  it('should preserve monotonicSeq from daemon event when provided', () => {
    const daemonEv = makeDaemonEvent({ monotonicSeq: 42 });
    const obsEv = toObservabilityEvent(daemonEv);
    expect(obsEv.monotonicSeq).toBe(42);
  });

  it('should set projectId default to "" when daemon event lacks it', () => {
    const daemonEv = makeDaemonEvent({ projectId: undefined });
    const obsEv = toObservabilityEvent(daemonEv);
    expect(obsEv.projectId).toBe('');
  });

  it('should set category default to "system" when daemon event lacks it', () => {
    const daemonEv = makeDaemonEvent({ category: undefined });
    const obsEv = toObservabilityEvent(daemonEv);
    expect(obsEv.category).toBe('system');
  });

  it('should set workItemId to null when daemon event lacks it', () => {
    const daemonEv = makeDaemonEvent({ workItemId: undefined });
    const obsEv = toObservabilityEvent(daemonEv);
    expect(obsEv.workItemId).toBeNull();
  });

  it('should preserve workItemId from daemon event when provided', () => {
    const daemonEv = makeDaemonEvent({ workItemId: 'WI-001' });
    const obsEv = toObservabilityEvent(daemonEv);
    expect(obsEv.workItemId).toBe('WI-001');
  });

  it('should NOT set payloadBlobRef (daemon-core events don\'t use CAS)', () => {
    const daemonEv = makeDaemonEvent();
    const obsEv = toObservabilityEvent(daemonEv);
    expect(obsEv).not.toHaveProperty('payloadBlobRef');
  });
});

// ═══════════════════════════════════════════════════════════════════
// C4: Actor type conversion
// ═══════════════════════════════════════════════════════════════════

describe('toObservabilityEvent — C4 actor conversion', () => {
  it('should convert string actor to AgentIdentity object', () => {
    const daemonEv = makeDaemonEvent({ actor: 'session-xyz' });
    const obsEv = toObservabilityEvent(daemonEv);

    expect(obsEv.actor).not.toBeNull();
    const actor = obsEv.actor as AgentIdentity;
    expect(typeof actor).toBe('object');
    expect(actor.sessionId).toBe('session-xyz');
  });

  it('should set AgentIdentity default fields when converting from string', () => {
    const daemonEv = makeDaemonEvent({ actor: 'test-session', projectId: 'p1' });
    const obsEv = toObservabilityEvent(daemonEv);
    const actor = obsEv.actor as AgentIdentity;

    expect(actor.agentRole).toBe('system');
    expect(actor.workflowRole).toBe('orchestrator');
    expect(actor.parentSessionId).toBeNull();
    expect(actor.workItemId).toBe('p1'); // from event.projectId
    expect(actor.spawnIntentId).toBe('');
  });

  it('should set actor to null when daemon event actor is not a string', () => {
    const daemonEv = makeDaemonEvent({ actor: undefined });
    const obsEv = toObservabilityEvent(daemonEv);
    expect(obsEv.actor).toBeNull();
  });

  it('should set actor to null when daemon event actor is a number (not string)', () => {
    const daemonEv = makeDaemonEvent({ actor: 123 as unknown as string });
    const obsEv = toObservabilityEvent(daemonEv);
    expect(obsEv.actor).toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════════
// Payload passthrough
// ═══════════════════════════════════════════════════════════════════

describe('toObservabilityEvent — payload passthrough', () => {
  it('should pass payload through unchanged', () => {
    const payload = { from: 'intake', to: 'requirements', nested: { key: 'val' } };
    const daemonEv = makeDaemonEvent({ payload });
    const obsEv = toObservabilityEvent(daemonEv);
    expect(obsEv.payload).toEqual(payload);
    // Reference equality not required — value equality is fine for defensive copy
  });

  it('should handle empty payload', () => {
    const daemonEv = makeDaemonEvent({ payload: {} });
    const obsEv = toObservabilityEvent(daemonEv);
    expect(obsEv.payload).toEqual({});
  });

  it('should handle null-like payload gracefully', () => {
    const daemonEv = makeDaemonEvent({
      // daemon-core Event.payload is Record<string, unknown>, but defensive
      payload: {} as Record<string, unknown>,
    });
    const obsEv = toObservabilityEvent(daemonEv);
    expect(obsEv.payload).toBeDefined();
  });
});

// ═══════════════════════════════════════════════════════════════════
// Identity fields
// ═══════════════════════════════════════════════════════════════════

describe('toObservabilityEvent — identity fields', () => {
  it('should preserve eventId and ts', () => {
    const daemonEv = makeDaemonEvent({ eventId: 'ev-unique', ts: 1717000000000 });
    const obsEv = toObservabilityEvent(daemonEv);
    expect(obsEv.eventId).toBe('ev-unique');
    expect(obsEv.ts).toBe(1717000000000);
  });

  it('should preserve action verb', () => {
    const daemonEv = makeDaemonEvent({ action: 'state.transition' });
    const obsEv = toObservabilityEvent(daemonEv);
    expect(obsEv.action).toBe('state.transition');
  });

  it('should preserve explicit category', () => {
    const daemonEv = makeDaemonEvent({ category: 'session' });
    const obsEv = toObservabilityEvent(daemonEv);
    expect(obsEv.category).toBe('session');
  });
});
