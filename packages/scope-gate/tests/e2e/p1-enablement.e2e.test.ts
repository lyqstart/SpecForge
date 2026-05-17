/**
 * End-to-End Tests for P1 Capability Enablement Workflow
 *
 * Simulates a development environment switching a P1 capability between
 * disabled (default V6.0) and enabled (via FeatureFlagManager) states,
 * then disabled again, while validating that:
 *
 *   1. Default V6.0 environment: invoking a P1 capability through the
 *      RuntimeScopeChecker raises SCOPE_BOUNDARY_VIOLATION.
 *   2. After FeatureFlagManager.enable('enable_<capability>'), the same
 *      capability is available and invocation succeeds.
 *   3. After FeatureFlagManager.disable(...), invocation throws again.
 *   4. The full lifecycle (flag enable, flag disable, scope check pass,
 *      scope check fail) is recorded in events.jsonl with monotonically
 *      non-decreasing timestamps and complete audit metadata.
 *
 * Requirements: 3.5, 3.6 (Audit logging + scope enforcement)
 * Validates Property 15: P1 capabilities disabled by default in V6.0,
 *           enabled only via explicit feature flags.
 *
 * Task: 16.2 P1 capability enablement workflow
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

// Resolve repo root from this test file's location so the test runs
// correctly whether `bun test` is invoked from packages/scope-gate or
// from the workspace root.
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = resolve(__dirname, '..', '..', '..', '..');
import { ScopeRegistry } from '../../src/scope-registry.js';
import { RuntimeScopeChecker } from '../../src/runtime-checker.js';
import { FeatureFlagManager } from '../../src/feature-flag-manager.js';
import { AuditLogger } from '../../src/audit-logger.js';
import { ScopeBoundaryViolationError } from '../../src/types.js';
import type {
  ScopeContext,
  ScopeEvent,
  ScopeViolationAttempt,
  FeatureFlagChange,
  AgentIdentity,
} from '../../src/types.js';

const PARENT_SPEC_PATH = resolve(
  REPO_ROOT,
  '.kiro',
  'specs',
  'v6-architecture-overview',
);

// We test against this P1 capability id (loaded from REQ-25).
const P1_CAPABILITY_ID = 'bugfix-workflow';
const P1_FLAG_NAME = `enable_${P1_CAPABILITY_ID}`;

const ACTOR: AgentIdentity = {
  id: 'p1-enablement-e2e',
  name: 'P1 Enablement E2E',
  type: 'system',
};

/**
 * Setup helper: build registry + flag manager + audit logger for an
 * isolated, unique log directory.
 */
function buildHarness(testLogDir: string) {
  if (!existsSync(testLogDir)) {
    mkdirSync(testLogDir, { recursive: true });
  }

  const registry = new ScopeRegistry();
  registry.loadFromParentSpecSync(PARENT_SPEC_PATH);

  const featureFlags = new FeatureFlagManager();
  // Register the P1 capability with the flag manager so master-flag
  // semantics work and the flag carries the right scope tag.
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
 */
async function readAuditEvents(logDir: string): Promise<ScopeEvent[]> {
  const file = join(logDir, 'events.jsonl');
  const content = await fs.readFile(file, 'utf-8');
  return content
    .split('\n')
    .filter((line) => line.trim().length > 0)
    .map((line) => {
      const event = JSON.parse(line) as ScopeEvent;
      return {
        ...event,
        timestamp: new Date(event.timestamp),
      };
    });
}

/**
 * Helper that invokes the runtime checker and, on failure, logs a
 * scope_violation event. Mirrors how a real entry point would wrap a
 * call site (the runtime checker itself does not write to disk).
 */
async function invokeP1Capability(
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
 * Helper that flips a feature flag through the manager, syncs the
 * change to the runtime checker context, and writes the corresponding
 * feature_flag_change audit event. Returns the change record actually
 * persisted (so tests can assert on shape).
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

  // Sync runtime checker context with the latest set of enabled flags
  // so subsequent capability checks observe the new state.
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

describe('P1 Capability Enablement Workflow - End-to-End', () => {
  let testLogDir: string;
  let harness: ReturnType<typeof buildHarness>;

  beforeEach(() => {
    testLogDir = resolve(
      REPO_ROOT,
      'packages',
      'scope-gate',
      'tests',
      'test-logs',
      `p1-enablement-${randomUUID()}`,
    );
    harness = buildHarness(testLogDir);
  });

  afterEach(async () => {
    // 异步资源四问 #4：dispose harness 持有的 AuditLogger（防 setInterval 泄漏）
    await harness?.audit?.dispose();
    expect(harness?.audit?.getActiveTimerCount() ?? 0).toBe(0);

    if (existsSync(testLogDir)) {
      rmSync(testLogDir, { recursive: true, force: true });
    }
  });

  it('throws SCOPE_BOUNDARY_VIOLATION when P1 capability is invoked in default V6.0 environment', async () => {
    const { checker, audit } = harness;

    const result = await invokeP1Capability(P1_CAPABILITY_ID, checker, audit);

    expect(result.success).toBe(false);
    expect(result.error).toBeInstanceOf(ScopeBoundaryViolationError);
    expect(result.error?.code).toBe('SCOPE_BOUNDARY_VIOLATION');
    expect(result.error?.capabilityId).toBe(P1_CAPABILITY_ID);
    expect(result.error?.scopeTag).toBe('p1');
    expect(result.error?.requiredFlag).toBe(P1_FLAG_NAME);
  });

  it('makes P1 capability available after FeatureFlagManager.enable, then unavailable after disable', async () => {
    const { checker, featureFlags, audit } = harness;

    // Step 1: default state - capability blocked.
    const blockedBefore = await invokeP1Capability(
      P1_CAPABILITY_ID,
      checker,
      audit,
    );
    expect(blockedBefore.success).toBe(false);

    // Step 2: enable the P1 flag.
    await flipFlag(
      P1_FLAG_NAME,
      true,
      'E2E: enable bugfix-workflow for development',
      featureFlags,
      checker,
      audit,
    );
    expect(featureFlags.isEnabled(P1_FLAG_NAME)).toBe(true);

    // Step 3: capability is now available.
    const allowed = await invokeP1Capability(P1_CAPABILITY_ID, checker, audit);
    expect(allowed.success).toBe(true);
    expect(allowed.error).toBeUndefined();

    // Step 4: disable the flag again.
    await flipFlag(
      P1_FLAG_NAME,
      false,
      'E2E: disable bugfix-workflow after testing',
      featureFlags,
      checker,
      audit,
    );
    expect(featureFlags.isEnabled(P1_FLAG_NAME)).toBe(false);

    // Step 5: capability is blocked again.
    const blockedAfter = await invokeP1Capability(
      P1_CAPABILITY_ID,
      checker,
      audit,
    );
    expect(blockedAfter.success).toBe(false);
    expect(blockedAfter.error?.code).toBe('SCOPE_BOUNDARY_VIOLATION');
  });

  it('records the full enable -> use -> disable lifecycle in events.jsonl with monotonic timestamps', async () => {
    const { checker, featureFlags, audit } = harness;

    // 1. Initial blocked attempt.
    await invokeP1Capability(P1_CAPABILITY_ID, checker, audit);

    // 2. Enable.
    await flipFlag(
      P1_FLAG_NAME,
      true,
      'E2E: enable bugfix-workflow',
      featureFlags,
      checker,
      audit,
    );

    // 3. Successful invocation while enabled — no violation written
    //    (this is what we assert: only blocked attempts produce a
    //    violation event, and the flag-change record proves the gate
    //    transitioned cleanly).
    const allowed = await invokeP1Capability(P1_CAPABILITY_ID, checker, audit);
    expect(allowed.success).toBe(true);

    // 4. Disable.
    await flipFlag(
      P1_FLAG_NAME,
      false,
      'E2E: disable bugfix-workflow',
      featureFlags,
      checker,
      audit,
    );

    // 5. Final blocked attempt.
    await invokeP1Capability(P1_CAPABILITY_ID, checker, audit);

    // Force flush all buffered events to disk before reading
    await audit.flushNow();

    // Read all events from events.jsonl.
    const events = await readAuditEvents(testLogDir);

    // We expect exactly 4 events: violation, flag enable, flag disable, violation.
    // (The successful invocation does not emit an event.)
    expect(events.length).toBe(4);

    // Audit completeness: every event has eventId, timestamp, type, payload, actor.
    for (const event of events) {
      expect(typeof event.eventId).toBe('string');
      expect(event.eventId.length).toBeGreaterThan(0);
      expect(event.timestamp).toBeInstanceOf(Date);
      expect(['scope_violation', 'feature_flag_change']).toContain(event.type);
      expect(event.payload).toBeDefined();
      expect(event.actor).toEqual(ACTOR);
    }

    // Type sequence: violation -> flag enable -> flag disable -> violation.
    const sequence = events.map((e) => e.type);
    expect(sequence).toEqual([
      'scope_violation',
      'feature_flag_change',
      'feature_flag_change',
      'scope_violation',
    ]);

    // Both violation events must reference the P1 capability.
    for (const event of events.filter((e) => e.type === 'scope_violation')) {
      const violation = event.payload as ScopeViolationAttempt;
      expect(violation.capabilityId).toBe(P1_CAPABILITY_ID);
      expect(violation.scopeTag).toBe('p1');
      expect(violation.context.releaseBranch).toBe('v6.0');
    }

    // Flag-change events must reference the right flag with the right
    // before/after values.
    const flagEvents = events.filter(
      (e) => e.type === 'feature_flag_change',
    );
    expect(flagEvents.length).toBe(2);
    const enableEvent = flagEvents[0]!.payload as FeatureFlagChange;
    expect(enableEvent.flag).toBe(P1_FLAG_NAME);
    expect(enableEvent.oldValue).toBe(false);
    expect(enableEvent.newValue).toBe(true);
    expect(enableEvent.userId).toBe(ACTOR.id);

    const disableEvent = flagEvents[1]!.payload as FeatureFlagChange;
    expect(disableEvent.flag).toBe(P1_FLAG_NAME);
    expect(disableEvent.oldValue).toBe(true);
    expect(disableEvent.newValue).toBe(false);
    expect(disableEvent.userId).toBe(ACTOR.id);

    // Timestamp monotonicity: each event's timestamp must be >= previous.
    for (let i = 1; i < events.length; i++) {
      const prev = events[i - 1]!.timestamp.getTime();
      const curr = events[i]!.timestamp.getTime();
      expect(curr).toBeGreaterThanOrEqual(prev);
    }

    // Event IDs are unique (no collisions across the lifecycle).
    const eventIds = new Set(events.map((e) => e.eventId));
    expect(eventIds.size).toBe(events.length);
  });

  it('queryScopeEvents filters by event type, capability id, and actor across the full workflow', async () => {
    const { checker, featureFlags, audit } = harness;

    // Run the full lifecycle.
    await invokeP1Capability(P1_CAPABILITY_ID, checker, audit);
    await flipFlag(
      P1_FLAG_NAME,
      true,
      'E2E: enable for query test',
      featureFlags,
      checker,
      audit,
    );
    await flipFlag(
      P1_FLAG_NAME,
      false,
      'E2E: disable for query test',
      featureFlags,
      checker,
      audit,
    );
    await invokeP1Capability(P1_CAPABILITY_ID, checker, audit);

    // Force flush all buffered events to disk before querying
    await audit.flushNow();

    // Query: only scope violations.
    const violations = await audit.queryScopeEvents({
      eventType: 'scope_violation',
    });
    expect(violations.length).toBe(2);
    for (const v of violations) {
      expect(v.type).toBe('scope_violation');
    }

    // Query: only feature-flag changes.
    const flagChanges = await audit.queryScopeEvents({
      eventType: 'feature_flag_change',
    });
    expect(flagChanges.length).toBe(2);

    // Query: by capability id (only matches scope_violation events).
    const byCap = await audit.queryScopeEvents({
      capabilityId: P1_CAPABILITY_ID,
    });
    expect(byCap.length).toBe(2);
    for (const v of byCap) {
      expect(v.type).toBe('scope_violation');
      const payload = v.payload as ScopeViolationAttempt;
      expect(payload.capabilityId).toBe(P1_CAPABILITY_ID);
    }

    // Query: by actor id matches every event we wrote.
    const byActor = await audit.queryScopeEvents({ actorId: ACTOR.id });
    expect(byActor.length).toBe(4);
    for (const e of byActor) {
      expect(e.actor?.id).toBe(ACTOR.id);
    }
  });

  it('persists feature flag state across manager instances (simulating restart)', async () => {
    const { featureFlags: manager1, audit } = harness;

    // Step 1: Enable P1 flag in first manager instance
    await flipFlag(
      P1_FLAG_NAME,
      true,
      'E2E: enable for persistence test',
      manager1,
      harness.checker,
      audit,
    );
    expect(manager1.isEnabled(P1_FLAG_NAME)).toBe(true);

    // Step 2: Export the flag state (simulating persistence to storage)
    const exportedState = manager1.export();
    expect(exportedState[P1_FLAG_NAME]).toBe(true);

    // Step 3: Create a new manager instance (simulating restart)
    const manager2 = new FeatureFlagManager({
      initialFlags: exportedState,
    });
    manager2.registerCapability(P1_CAPABILITY_ID, 'p1');

    // Step 4: Verify the flag state persisted across restart
    expect(manager2.isEnabled(P1_FLAG_NAME)).toBe(true);

    // Step 5: Verify capability is still available with persisted flag
    const context = manager2.createScopeContext({
      releaseBranch: 'v6.0',
      environment: 'development',
    });
    const checker2 = new RuntimeScopeChecker(harness.registry, context);
    checker2.enableFeatureFlag(P1_FLAG_NAME);

    // Should not throw - capability is available due to persisted flag
    expect(() => {
      checker2.checkCapability(P1_CAPABILITY_ID, context);
    }).not.toThrow();

    // Step 6: Verify we can disable the flag in the new instance
    await flipFlag(
      P1_FLAG_NAME,
      false,
      'E2E: disable after restart',
      manager2,
      checker2,
      audit,
    );
    expect(manager2.isEnabled(P1_FLAG_NAME)).toBe(false);

    // Force flush to ensure all events are written
    await audit.flushNow();

    // Step 7: Verify the full lifecycle is recorded in audit trail
    const allEvents = await audit.queryScopeEvents({});
    const flagChangeEvents = allEvents.filter(
      (e) => e.type === 'feature_flag_change',
    );
    expect(flagChangeEvents.length).toBe(2);

    // First change: enable
    const enableEvent = flagChangeEvents[0]!.payload as FeatureFlagChange;
    expect(enableEvent.flag).toBe(P1_FLAG_NAME);
    expect(enableEvent.oldValue).toBe(false);
    expect(enableEvent.newValue).toBe(true);

    // Second change: disable
    const disableEvent = flagChangeEvents[1]!.payload as FeatureFlagChange;
    expect(disableEvent.flag).toBe(P1_FLAG_NAME);
    expect(disableEvent.oldValue).toBe(true);
    expect(disableEvent.newValue).toBe(false);
  });

  it('handles invalid flag operations with appropriate errors', async () => {
    const { featureFlags } = harness;

    // Test 1: Attempting to enable an already-enabled flag returns true
    // (idempotent operation - flag is already in desired state)
    featureFlags.enable(P1_FLAG_NAME, 'First enable');
    const secondEnable = featureFlags.enable(P1_FLAG_NAME, 'Second enable');
    expect(secondEnable).toBe(true); // Idempotent - already enabled

    // Test 2: Attempting to disable an already-disabled flag returns true
    // (idempotent operation - flag is already in desired state)
    featureFlags.disable(P1_FLAG_NAME, 'First disable');
    const secondDisable = featureFlags.disable(P1_FLAG_NAME, 'Second disable');
    expect(secondDisable).toBe(true); // Idempotent - already disabled

    // Test 3: Attempting to check a non-existent capability throws
    const context = featureFlags.createScopeContext({
      releaseBranch: 'v6.0',
      environment: 'development',
    });
    const checker = new RuntimeScopeChecker(harness.registry, context);

    expect(() => {
      checker.checkCapability('non-existent-capability', context);
    }).toThrow();

    // Test 4: Attempting to enable a non-existent flag still works
    // (flags are created on demand)
    const result = featureFlags.enable('new_flag', 'Create new flag');
    expect(result).toBe(true);
    expect(featureFlags.isEnabled('new_flag')).toBe(true);

    // Test 5: Verify flag history is maintained for all operations
    const history = featureFlags.getHistory();
    expect(history.length).toBeGreaterThan(0);
    // All history entries should have the required fields
    for (const entry of history) {
      expect(entry.flag).toBeDefined();
      expect(typeof entry.oldValue).toBe('boolean');
      expect(typeof entry.newValue).toBe('boolean');
      expect(entry.timestamp).toBeInstanceOf(Date);
    }

    // Test 6: Verify that attempting to enable a capability without
    // the required flag still throws SCOPE_BOUNDARY_VIOLATION
    const newChecker = new RuntimeScopeChecker(harness.registry, context);
    expect(() => {
      newChecker.checkCapability(P1_CAPABILITY_ID, context);
    }).toThrow(ScopeBoundaryViolationError);
  });
});
