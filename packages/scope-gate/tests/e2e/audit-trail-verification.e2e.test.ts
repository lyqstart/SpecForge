/**
 * End-to-End Tests for Audit Trail Completeness Verification
 *
 * Validates that the audit logger records a complete, consistent trail
 * of all scope-related events with:
 *   1. Event completeness: all event types (scope_violation,
 *      feature_flag_change, scope_check) are recorded with correct
 *      payloads
 *   2. Timestamp monotonicity: all timestamps are non-decreasing
 *   3. eventId uniqueness: no duplicate event IDs
 *   4. Field completeness: every event has eventId, timestamp, type,
 *      payload, and actor fields
 *
 * Requirements: 3.5, 3.6 (Audit logging)
 * Task: 16.4 Audit trail completeness verification
 *
 * Uses vitest pool: 'forks' for process isolation per
 * async-resource-coding-standards.md (T2/T4).
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import { existsSync, mkdirSync, rmSync } from 'fs';
import { dirname, join, resolve } from 'path';
import { fileURLToPath } from 'url';
import { randomUUID } from 'crypto';

import { ScopeRegistry } from '../../src/scope-registry.js';
import { RuntimeScopeChecker } from '../../src/runtime-checker.js';
import { FeatureFlagManager } from '../../src/feature-flag-manager.js';
import { AuditLogger } from '../../src/audit-logger.js';
import {
  ScopeBoundaryViolationError,
  ScopeError,
} from '../../src/types.js';
import type {
  ScopeContext,
  ScopeEvent,
  ScopeViolationAttempt,
  FeatureFlagChange,
  AgentIdentity,
  CapabilityDefinition,
  ScopeTag,
} from '../../src/types.js';

// --------------------------------------------------------------------
// Path setup — resolve repo root from this file so the suite runs the
// same whether `bun test` is invoked at the workspace root or in the
// scope-gate package.
// --------------------------------------------------------------------

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = resolve(__dirname, '..', '..', '..', '..');
const PARENT_SPEC_PATH = resolve(
  REPO_ROOT,
  '.kiro',
  'specs',
  'v6-architecture-overview',
);

const ACTOR: AgentIdentity = {
  id: 'audit-trail-e2e',
  name: 'Audit Trail E2E',
  type: 'system',
};

// --------------------------------------------------------------------
// Test capability fixture — defined explicitly so the validator and
// runtime checker share the exact same set, regardless of what REQ-25
// happens to ship today.
// --------------------------------------------------------------------

function makeCap(
  id: string,
  scopeTag: ScopeTag,
  dependencies: string[] = [],
): CapabilityDefinition {
  return {
    id,
    displayName: `Capability ${id}`,
    scopeTag,
    entryPoints: [],
    dependencies,
    description: `Description for ${id}`,
  };
}

const FIXTURE_CAPS: CapabilityDefinition[] = [
  makeCap('test-p0-core', 'p0'),
  makeCap('test-p1-bugfix', 'p1'),
  makeCap('test-p1-design', 'p1'),
  makeCap('test-p2-webui', 'p2'),
];

// We test against this P1 capability id.
const P1_CAPABILITY_ID = 'test-p1-bugfix';
const P1_FLAG_NAME = `enable_${P1_CAPABILITY_ID}`;

// --------------------------------------------------------------------
// Helper functions
// --------------------------------------------------------------------

/**
 * Build a complete harness for testing.
 */
function buildHarness(testLogDir: string) {
  if (!existsSync(testLogDir)) {
    mkdirSync(testLogDir, { recursive: true });
  }

  const registry = new ScopeRegistry();
  // Register fixture capabilities
  for (const cap of FIXTURE_CAPS) {
    registry.registerCapability(cap);
  }

  const featureFlags = new FeatureFlagManager();
  featureFlags.registerCapability(P1_CAPABILITY_ID, 'p1');

  const initialContext: ScopeContext = featureFlags.createScopeContext({
    releaseBranch: 'v6.0',
    environment: 'development',
  });
  const checker = new RuntimeScopeChecker(registry, initialContext);

  const audit = new AuditLogger(testLogDir, ACTOR);

  return { registry, featureFlags, checker, audit };
}

/**
 * Read the events.jsonl produced by the audit logger and parse each
 * line as a ScopeEvent (with timestamp coerced to Date for ordering
 * checks).
 *
 * **重要**：调用前先 `audit.flushNow()` 确保 buffer 落盘——
 * AuditLogger 默认 `enableTimer: false`（安全默认），buffer 不会自动 flush。
 */
async function readAuditEvents(logDir: string, audit?: AuditLogger): Promise<ScopeEvent[]> {
  // 如果提供了 audit，先强制 flush buffer 到磁盘
  if (audit) {
    await audit.flushNow();
  }
  const file = join(logDir, 'events.jsonl');
  const content = await fs.readFile(file, 'utf-8');
  return content
    .split('\n')
    .filter((line) => line.trim().length > 0)
    .map((line) => {
      const event = JSON.parse(line) as ScopeEvent;
      return {
        ...event,
        timestamp: typeof event.timestamp === 'string'
          ? new Date(event.timestamp)
          : event.timestamp,
      };
    });
}

/**
 * Invoke a P1 capability, catching any ScopeBoundaryViolationError
 * and logging it to the audit trail. Returns whether the call succeeded.
 */
async function invokeWithAudit(
  capabilityId: string,
  checker: RuntimeScopeChecker,
  audit: AuditLogger,
): Promise<{ success: boolean; error?: ScopeBoundaryViolationError }> {
  const context = checker.getCurrentContext();
  try {
    checker.checkCapability(capabilityId, context);
    return { success: true };
  } catch (err) {
    if (err instanceof ScopeBoundaryViolationError) {
      const violation: ScopeViolationAttempt = {
        capabilityId: err.capabilityId,
        scopeTag: err.scopeTag,
        context,
        timestamp: new Date(),
      };
      await audit.logViolationAttempt(violation);
      return { success: false, error: err };
    }
    throw err;
  }
}

/**
 * Flip a feature flag and log the change.
 */
async function flipFlag(
  flag: string,
  enabled: boolean,
  reason: string,
  featureFlags: FeatureFlagManager,
  checker: RuntimeScopeChecker,
  audit: AuditLogger,
): Promise<FeatureFlagChange> {
  const previous = featureFlags.isEnabled(flag);
  const ok = enabled
    ? featureFlags.enable(flag, reason, ACTOR.id)
    : featureFlags.disable(flag, reason, ACTOR.id);
  expect(ok).toBe(true);

  if (enabled) {
    checker.enableFeatureFlag(flag);
  } else {
    checker.disableFeatureFlag(flag);
  }

  const change: FeatureFlagChange = {
    flag,
    oldValue: previous,
    newValue: enabled,
    reason,
    userId: ACTOR.id,
    timestamp: new Date(),
  };
  await audit.logFeatureFlagChange(change);
  return change;
}

// --------------------------------------------------------------------
// Test suite
// --------------------------------------------------------------------

describe('Audit Trail Completeness Verification - End-to-End', () => {
  let testLogDir: string;
  let harness: ReturnType<typeof buildHarness>;

  beforeEach(() => {
    testLogDir = resolve(
      REPO_ROOT,
      'packages',
      'scope-gate',
      'tests',
      'test-logs',
      `audit-trail-${randomUUID()}`,
    );
    harness = buildHarness(testLogDir);
  });

  afterEach(async () => {
    // 异步资源四问 #4：测试结束必须 dispose harness 持有的 AuditLogger，
    // 防止漏调时未来 enableTimer 改默认值导致 setInterval 泄漏（见
    // docs/engineering-lessons/universal/javascript-explicit-resource-management.md）
    await harness?.audit?.dispose();
    expect(harness?.audit?.getActiveTimerCount() ?? 0).toBe(0);

    if (existsSync(testLogDir)) {
      rmSync(testLogDir, { recursive: true, force: true });
    }
  });

  // ----------------------------------------------------------------
  // Test (a): Event completeness
  // Execute a series of operations (enable flag → check capability →
  // disable flag → check capability), each step produces corresponding
  // event. Verify all events are recorded using queryScopeEvents.
  // ----------------------------------------------------------------

  it('a. records all event types during the full enable → check → disable → check lifecycle', async () => {
    const { checker, featureFlags, audit } = harness;

    // Step 1: Initial blocked attempt (produces scope_violation)
    const blocked1 = await invokeWithAudit(P1_CAPABILITY_ID, checker, audit);
    expect(blocked1.success).toBe(false);

    // Step 2: Enable the feature flag (produces feature_flag_change)
    await flipFlag(
      P1_FLAG_NAME,
      true,
      'E2E: enable for audit test',
      featureFlags,
      checker,
      audit,
    );

    // Step 3: Successful check (no violation event - successful checks don't log)
    const allowed = await invokeWithAudit(P1_CAPABILITY_ID, checker, audit);
    expect(allowed.success).toBe(true);

    // Step 4: Log a validation event to add scope_validation type
    await audit.logValidationResults([
      {
        code: 'ok',
        message: 'All checks passed',
        type: 'info',
      },
    ]);

    // Step 5: Disable the feature flag (produces feature_flag_change)
    await flipFlag(
      P1_FLAG_NAME,
      false,
      'E2E: disable for audit test',
      featureFlags,
      checker,
      audit,
    );

    // Step 6: Final blocked attempt (produces scope_violation)
    const blocked2 = await invokeWithAudit(P1_CAPABILITY_ID, checker, audit);
    expect(blocked2.success).toBe(false);

    // Force flush all buffered events to disk
    await audit.flushNow();

    // Now verify all events were recorded
    const events = await readAuditEvents(testLogDir);

    // We expect: 2 scope_violation + 2 feature_flag_change + 1 scope_validation = 5 events
    expect(events.length).toBe(5);

    // Verify event type counts using queryScopeEvents
    const violations = await audit.queryScopeEvents({
      eventType: 'scope_violation',
    });
    expect(violations.length).toBe(2);

    const flagChanges = await audit.queryScopeEvents({
      eventType: 'feature_flag_change',
    });
    expect(flagChanges.length).toBe(2);

    const validations = await audit.queryScopeEvents({
      eventType: 'scope_validation',
    });
    expect(validations.length).toBe(1);

    // Verify capabilityId filter works
    const byCap = await audit.queryScopeEvents({
      capabilityId: P1_CAPABILITY_ID,
    });
    expect(byCap.length).toBe(2); // Only scope_violation events match capabilityId filter

    // Verify actorId filter works
    const byActor = await audit.queryScopeEvents({ actorId: ACTOR.id });
    expect(byActor.length).toBe(5); // All events match
  });

  // ----------------------------------------------------------------
  // Test (b): Timestamp monotonicity
  // All event timestamps are non-decreasing (same ms allowed)
  // ----------------------------------------------------------------

  it('b. has non-decreasing timestamps across all events', async () => {
    const { checker, featureFlags, audit } = harness;

    // Run full lifecycle (successful checks don't log)
    await invokeWithAudit(P1_CAPABILITY_ID, checker, audit); // violation
    await flipFlag(P1_FLAG_NAME, true, 'enable for monotonicity', featureFlags, checker, audit); // flag change
    await invokeWithAudit(P1_CAPABILITY_ID, checker, audit); // success (no log)
    await flipFlag(P1_FLAG_NAME, false, 'disable for monotonicity', featureFlags, checker, audit); // flag change
    await invokeWithAudit(P1_CAPABILITY_ID, checker, audit); // violation

    const events = await readAuditEvents(testLogDir, audit);
    expect(events.length).toBe(4);

    // Verify timestamps are non-decreasing
    for (let i = 1; i < events.length; i++) {
      const prev = events[i - 1]!.timestamp.getTime();
      const curr = events[i]!.timestamp.getTime();
      expect(curr).toBeGreaterThanOrEqual(prev);
    }

    // Also test with date range filters
    const firstEvent = events[0]!;
    const lastEvent = events[events.length - 1]!;

    const inRange = await audit.queryScopeEvents({
      startDate: firstEvent.timestamp,
      endDate: lastEvent.timestamp,
    });
    expect(inRange.length).toBe(events.length);
  });

  // ----------------------------------------------------------------
  // Test (c): eventId uniqueness
  // Each event's eventId is unique (no duplicates)
  // ----------------------------------------------------------------

  it('c. has unique eventId for every event in the trail', async () => {
    const { checker, featureFlags, audit } = harness;

    // Generate multiple events
    await invokeWithAudit(P1_CAPABILITY_ID, checker, audit); // violation
    await flipFlag(P1_FLAG_NAME, true, 'enable for uniqueness', featureFlags, checker, audit); // flag change
    await invokeWithAudit(P1_CAPABILITY_ID, checker, audit); // success (no log)
    await flipFlag(P1_FLAG_NAME, false, 'disable for uniqueness', featureFlags, checker, audit); // flag change
    await invokeWithAudit(P1_CAPABILITY_ID, checker, audit); // violation
    await audit.logValidationResults([{ code: 'test', message: 'test', type: 'info' }]); // validation

    const events = await readAuditEvents(testLogDir, audit);
    expect(events.length).toBe(5);

    // Collect all eventIds
    const eventIds = events.map((e) => e.eventId);

    // Verify all are unique
    const uniqueIds = new Set(eventIds);
    expect(uniqueIds.size).toBe(eventIds.length);

    // Each eventId should be a non-empty string
    for (const id of eventIds) {
      expect(typeof id).toBe('string');
      expect(id.length).toBeGreaterThan(0);
    }
  });

  // ----------------------------------------------------------------
  // Test (d): Field completeness
  // Each event has eventId, timestamp, type, payload, actor
  // ----------------------------------------------------------------

  it('d. has all required fields (eventId, timestamp, type, payload, actor) on every event', async () => {
    const { checker, featureFlags, audit } = harness;

    // Generate all three event types
    await invokeWithAudit(P1_CAPABILITY_ID, checker, audit); // scope_violation
    await flipFlag(P1_FLAG_NAME, true, 'enable for fields', featureFlags, checker, audit); // feature_flag_change
    await audit.logValidationResults([{ code: 'test', message: 'test', type: 'info' }]); // scope_validation

    const events = await readAuditEvents(testLogDir, audit);
    expect(events.length).toBe(3);

    for (const event of events) {
      // eventId: string, non-empty
      expect(typeof event.eventId).toBe('string');
      expect(event.eventId.length).toBeGreaterThan(0);

      // timestamp: Date instance
      expect(event.timestamp).toBeInstanceOf(Date);

      // type: valid event type
      expect([
        'scope_violation',
        'feature_flag_change',
        'scope_validation',
      ]).toContain(event.type);

      // payload: defined and not null
      expect(event.payload).toBeDefined();
      expect(event.payload).not.toBeNull();

      // actor: defined with required fields
      expect(event.actor).toBeDefined();
      expect(event.actor).not.toBeNull();
      expect(typeof event.actor?.id).toBe('string');
      expect(event.actor?.id.length).toBeGreaterThan(0);
      expect(typeof event.actor?.name).toBe('string');
      expect(['user', 'system', 'agent']).toContain(event.actor?.type);
    }

    // Verify specific payload types for each event type
    const violationEvent = events.find((e) => e.type === 'scope_violation');
    expect(violationEvent).toBeDefined();
    const violationPayload = violationEvent!.payload as ScopeViolationAttempt;
    expect(typeof violationPayload.capabilityId).toBe('string');
    expect(['p1', 'p2']).toContain(violationPayload.scopeTag);
    expect(violationPayload.context).toBeDefined();

    const flagEvent = events.find((e) => e.type === 'feature_flag_change');
    expect(flagEvent).toBeDefined();
    const flagPayload = flagEvent!.payload as FeatureFlagChange;
    expect(typeof flagPayload.flag).toBe('string');
    expect(typeof flagPayload.oldValue).toBe('boolean');
    expect(typeof flagPayload.newValue).toBe('boolean');
    expect(typeof flagPayload.userId).toBe('string');
  });

  // ----------------------------------------------------------------
  // Additional: Query edge cases
  // ----------------------------------------------------------------

  it('handles query edge cases (no matches, multiple filters)', async () => {
    const { checker, featureFlags, audit } = harness;

    // Generate some events
    await invokeWithAudit(P1_CAPABILITY_ID, checker, audit);
    await flipFlag(P1_FLAG_NAME, true, 'enable for edge cases', featureFlags, checker, audit);

    // Query for non-existent capability
    const noMatch = await audit.queryScopeEvents({
      capabilityId: 'non-existent-cap',
    });
    expect(noMatch.length).toBe(0);

    // Query for non-existent event type
    const noTypeMatch = await audit.queryScopeEvents({
      eventType: 'non_existent_type' as any,
    });
    expect(noTypeMatch.length).toBe(0);

    // Query with multiple filters that match
    const multiFilter = await audit.queryScopeEvents({
      eventType: 'feature_flag_change',
      actorId: ACTOR.id,
    });
    expect(multiFilter.length).toBe(1);
    expect(multiFilter[0]!.type).toBe('feature_flag_change');
    expect(multiFilter[0]!.actor?.id).toBe(ACTOR.id);
  });

  // ----------------------------------------------------------------
  // Additional: Empty log handling
  // ----------------------------------------------------------------

  it('returns empty array for queries on non-existent log file', async () => {
    const { audit } = harness;

    // Query on a fresh (non-existent) log directory
    const emptyDir = resolve(testLogDir, 'subdir', 'nested');
    const emptyAudit = new AuditLogger(emptyDir, ACTOR);

    try {
      const results = await emptyAudit.queryScopeEvents({});
      expect(results).toEqual([]);
    } finally {
      await emptyAudit.dispose();
    }
  });

  // ----------------------------------------------------------------
  // Additional: Log statistics
  // ----------------------------------------------------------------

  it('provides accurate log statistics', async () => {
    const { checker, featureFlags, audit } = harness;

    // Generate specific events
    await invokeWithAudit(P1_CAPABILITY_ID, checker, audit); // 1 violation
    await flipFlag(P1_FLAG_NAME, true, 'enable for stats', featureFlags, checker, audit); // 1 flag change
    await invokeWithAudit(P1_CAPABILITY_ID, checker, audit); // success (no log)
    await flipFlag(P1_FLAG_NAME, false, 'disable for stats', featureFlags, checker, audit); // 1 flag change

    const stats = await audit.getLogStats();

    expect(stats.eventCount).toBe(3);
    expect(stats.eventTypes['scope_violation']).toBe(1);
    expect(stats.eventTypes['feature_flag_change']).toBe(2);
    expect(stats.fileSize).toBeGreaterThan(0);
    expect(stats.lastEventTime).toBeDefined();
  });
});