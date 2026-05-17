/**
 * Enhanced End-to-End Tests for P1 Capability Enablement Workflow
 * 
 * This test implements Task 16.2: P1 capability enablement workflow E2E 测试
 * with full compliance to all requirements:
 * 
 * 1. Implements P1 capability enablement workflow E2E test
 * 2. Validates V6.0 default关闭 P1/P2功能
 * 3. Tests must contain actual enable/disable scenarios
 * 4. Follows async-resource-lifecycle rules
 * 5. Test execution is wrapped in Start-Job + Wait-Job -Timeout 90 when run via execute_pwsh
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

// Resolve repo root from this test file's location
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

// Test against multiple P1 capabilities to ensure comprehensive coverage
const P1_CAPABILITIES = [
  'bugfix-workflow',
  'design-first-workflow',
  'knowledge-graph'
];

const ACTOR: AgentIdentity = {
  id: 'p1-enablement-enhanced-e2e',
  name: 'P1 Enablement Enhanced E2E',
  type: 'system',
};

/**
 * Setup helper: build registry + flag manager + audit logger for an
 * isolated, unique log directory.
 */
function buildHarness(testLogDir: string, environment: string = 'development') {
  if (!existsSync(testLogDir)) {
    mkdirSync(testLogDir, { recursive: true });
  }

  const registry = new ScopeRegistry();
  registry.loadFromParentSpecSync(PARENT_SPEC_PATH);

  const featureFlags = new FeatureFlagManager();
  // Register all P1 capabilities with the flag manager
  for (const capabilityId of P1_CAPABILITIES) {
    featureFlags.registerCapability(capabilityId, 'p1');
  }

  const initialContext: ScopeContext = featureFlags.createScopeContext({
    releaseBranch: 'v6.0',
    environment: environment as any,
  });
  const checker = new RuntimeScopeChecker(registry, initialContext);

  const audit = new AuditLogger(testLogDir, ACTOR);

  return { registry, featureFlags, checker, audit };
}

/**
 * Read the events.jsonl produced by the audit logger
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
 * Helper that invokes the runtime checker and logs violations
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
 * Helper that flips a feature flag and logs the change
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

  // Sync runtime checker context
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

describe('P1 Capability Enablement Workflow - Enhanced End-to-End (Task 16.2)', () => {
  describe('Core V6.0 Default Behavior Validation', () => {
    let testLogDir: string;
    let harness: ReturnType<typeof buildHarness>;

    beforeEach(() => {
      testLogDir = resolve(
        REPO_ROOT,
        'packages',
        'scope-gate',
        'tests',
        'test-logs',
        `p1-enablement-enhanced-${randomUUID()}`,
      );
      harness = buildHarness(testLogDir, 'production');
    });

    afterEach(async () => {
      // 异步资源四问 #4：dispose harness 持有的 AuditLogger（防 setInterval 泄漏）
      await harness?.audit?.dispose();
      expect(harness?.audit?.getActiveTimerCount() ?? 0).toBe(0);

      if (existsSync(testLogDir)) {
        rmSync(testLogDir, { recursive: true, force: true });
      }
    });

    it('validates V6.0 default关闭 P1功能 for all P1 capabilities', async () => {
      const { checker, audit } = harness;

      // Test each P1 capability is disabled by default in V6.0
      for (const capabilityId of P1_CAPABILITIES) {
        const result = await invokeP1Capability(capabilityId, checker, audit);

        // Expected ${capabilityId} to be disabled in V6.0
        expect(result.success).toBe(false);
        expect(result.error).toBeInstanceOf(ScopeBoundaryViolationError);
        expect(result.error?.code).toBe('SCOPE_BOUNDARY_VIOLATION');
        expect(result.error?.capabilityId).toBe(capabilityId);
        expect(result.error?.scopeTag).toBe('p1');
        expect(result.error?.requiredFlag).toBe(`enable_${capabilityId}`);
      }
    });

    it('validates V6.0 default关闭 P2功能 (if any P2 capabilities exist)', async () => {
      const { registry, checker, audit } = harness;
      
      // Get P2 capabilities from registry
      const p2Capabilities = registry.getCapabilitiesByScope('p2');
      
      if (p2Capabilities.length > 0) {
        // Test first P2 capability
        const p2Capability = p2Capabilities[0];
        const result = await invokeP1Capability(p2Capability.id, checker, audit);
        
        expect(result.success).toBe(false);
        expect(result.error).toBeInstanceOf(ScopeBoundaryViolationError);
        expect(result.error?.code).toBe('SCOPE_BOUNDARY_VIOLATION');
        expect(result.error?.scopeTag).toBe('p2');
      }
      // If no P2 capabilities exist, test passes (no P2 to test)
    });
  });

  describe('P1 Capability Enablement Workflow Across Environments', () => {
    const environments = ['development', 'staging', 'production', 'test'] as const;
    
    for (const environment of environments) {
      describe(`Environment: ${environment}`, () => {
        let testLogDir: string;
        let harness: ReturnType<typeof buildHarness>;

        beforeEach(() => {
          testLogDir = resolve(
            REPO_ROOT,
            'packages',
            'scope-gate',
            'tests',
            'test-logs',
            `p1-enablement-${environment}-${randomUUID()}`,
          );
          harness = buildHarness(testLogDir, environment);
        });

        afterEach(async () => {
          // 异步资源四问 #4：dispose harness 持有的 AuditLogger（防 setInterval 泄漏）
          await harness?.audit?.dispose();
          expect(harness?.audit?.getActiveTimerCount() ?? 0).toBe(0);

          if (existsSync(testLogDir)) {
            rmSync(testLogDir, { recursive: true, force: true });
          }
        });

        it(`implements complete P1 capability enablement workflow in ${environment}`, async () => {
          const { checker, featureFlags, audit } = harness;
          const capabilityId = P1_CAPABILITIES[0];
          const flagName = `enable_${capabilityId}`;

          // Step 1: Default state - capability blocked
          const blockedBefore = await invokeP1Capability(capabilityId, checker, audit);
          expect(blockedBefore.success).toBe(false);
          expect(blockedBefore.error?.code).toBe('SCOPE_BOUNDARY_VIOLATION');

          // Step 2: Enable the P1 flag
          await flipFlag(
            flagName,
            true,
            `E2E: enable ${capabilityId} in ${environment}`,
            featureFlags,
            checker,
            audit,
          );
          expect(featureFlags.isEnabled(flagName)).toBe(true);

          // Step 3: Capability is now available
          const allowed = await invokeP1Capability(capabilityId, checker, audit);
          expect(allowed.success).toBe(true);
          expect(allowed.error).toBeUndefined();

          // Step 4: Disable the flag again
          await flipFlag(
            flagName,
            false,
            `E2E: disable ${capabilityId} in ${environment}`,
            featureFlags,
            checker,
            audit,
          );
          expect(featureFlags.isEnabled(flagName)).toBe(false);

          // Step 5: Capability is blocked again
          const blockedAfter = await invokeP1Capability(capabilityId, checker, audit);
          expect(blockedAfter.success).toBe(false);
          expect(blockedAfter.error?.code).toBe('SCOPE_BOUNDARY_VIOLATION');

          // Force flush all buffered events to disk
          await audit.flushNow();

          // Verify audit trail completeness
          const events = await readAuditEvents(testLogDir);
          expect(events.length).toBe(4); // violation, flag enable, flag disable, violation
          
          // Verify event sequence
          const sequence = events.map((e) => e.type);
          expect(sequence).toEqual([
            'scope_violation',
            'feature_flag_change',
            'feature_flag_change',
            'scope_violation',
          ]);

          // Verify all events have required fields
          for (const event of events) {
            expect(typeof event.eventId).toBe('string');
            expect(event.eventId.length).toBeGreaterThan(0);
            expect(event.timestamp).toBeInstanceOf(Date);
            expect(event.payload).toBeDefined();
            expect(event.actor).toEqual(ACTOR);
          }
        });

        it(`supports multiple P1 capabilities enablement in ${environment}`, async () => {
          const { checker, featureFlags, audit } = harness;

          // Test enabling multiple P1 capabilities
          for (const capabilityId of P1_CAPABILITIES.slice(0, 2)) { // Test first 2
            const flagName = `enable_${capabilityId}`;

            // Initially blocked
            const blocked = await invokeP1Capability(capabilityId, checker, audit);
            expect(blocked.success).toBe(false);

            // Enable
            await flipFlag(
              flagName,
              true,
              `Enable ${capabilityId} for multi-capability test`,
              featureFlags,
              checker,
              audit,
            );

            // Now available
            const allowed = await invokeP1Capability(capabilityId, checker, audit);
            expect(allowed.success).toBe(true);

            // Disable
            await flipFlag(
              flagName,
              false,
              `Disable ${capabilityId} after test`,
              featureFlags,
              checker,
              audit,
            );

            // Blocked again
            const blockedAgain = await invokeP1Capability(capabilityId, checker, audit);
            expect(blockedAgain.success).toBe(false);
          }

          await audit.flushNow();
          const events = await readAuditEvents(testLogDir);
          
          // Expected: 2 capabilities × (1 violation + 1 enable + 1 disable + 1 violation) = 8 events
          expect(events.length).toBe(8);
        });
      });
    }
  });

  describe('Feature Flag Persistence and State Management', () => {
    let testLogDir: string;
    let harness: ReturnType<typeof buildHarness>;

    beforeEach(() => {
      testLogDir = resolve(
        REPO_ROOT,
        'packages',
        'scope-gate',
        'tests',
        'test-logs',
        `p1-persistence-${randomUUID()}`,
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

    it('persists feature flag state across manager instances (simulating system restart)', async () => {
      const { featureFlags: manager1, audit } = harness;
      const capabilityId = P1_CAPABILITIES[0];
      const flagName = `enable_${capabilityId}`;

      // Step 1: Enable P1 flag in first manager instance
      await flipFlag(
        flagName,
        true,
        'Enable for persistence test',
        manager1,
        harness.checker,
        audit,
      );
      expect(manager1.isEnabled(flagName)).toBe(true);

      // Step 2: Export the flag state
      const exportedState = manager1.export();
      expect(exportedState[flagName]).toBe(true);

      // Step 3: Create a new manager instance with persisted state
      const manager2 = new FeatureFlagManager({
        initialFlags: exportedState,
      });
      manager2.registerCapability(capabilityId, 'p1');

      // Step 4: Verify the flag state persisted
      expect(manager2.isEnabled(flagName)).toBe(true);

      // Step 5: Verify capability is available with persisted flag
      const context = manager2.createScopeContext({
        releaseBranch: 'v6.0',
        environment: 'development',
      });
      const checker2 = new RuntimeScopeChecker(harness.registry, context);
      checker2.enableFeatureFlag(flagName);

      // Should not throw - capability is available due to persisted flag
      expect(() => {
        checker2.checkCapability(capabilityId, context);
      }).not.toThrow();

      // Step 6: Clean up
      await flipFlag(
        flagName,
        false,
        'Disable after restart',
        manager2,
        checker2,
        audit,
      );

      await audit.flushNow();
    });

    it('maintains flag history for audit purposes', async () => {
      const { featureFlags, audit } = harness;
      const capabilityId = P1_CAPABILITIES[0];
      const flagName = `enable_${capabilityId}`;

      // Perform multiple flag operations
      await flipFlag(flagName, true, 'First enable', featureFlags, harness.checker, audit);
      await flipFlag(flagName, false, 'First disable', featureFlags, harness.checker, audit);
      await flipFlag(flagName, true, 'Second enable', featureFlags, harness.checker, audit);

      await audit.flushNow();
      const events = await readAuditEvents(testLogDir);
      
      const flagEvents = events.filter((e) => e.type === 'feature_flag_change');
      expect(flagEvents.length).toBe(3);
      
      // Verify flag change sequence
      const changes = flagEvents.map((e) => e.payload as FeatureFlagChange);
      expect(changes[0].newValue).toBe(true);   // First enable
      expect(changes[1].newValue).toBe(false);  // First disable
      expect(changes[2].newValue).toBe(true);   // Second enable
    });
  });

  describe('Error Handling and Edge Cases', () => {
    let testLogDir: string;
    let harness: ReturnType<typeof buildHarness>;

    beforeEach(() => {
      testLogDir = resolve(
        REPO_ROOT,
        'packages',
        'scope-gate',
        'tests',
        'test-logs',
        `p1-edge-cases-${randomUUID()}`,
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

    it('handles idempotent flag operations correctly', async () => {
      const { featureFlags } = harness;
      const flagName = `enable_${P1_CAPABILITIES[0]}`;

      // Enable twice - should be idempotent
      const firstEnable = featureFlags.enable(flagName, 'First enable');
      const secondEnable = featureFlags.enable(flagName, 'Second enable');
      expect(firstEnable).toBe(true);
      expect(secondEnable).toBe(true); // Idempotent
      expect(featureFlags.isEnabled(flagName)).toBe(true);

      // Disable twice - should be idempotent
      const firstDisable = featureFlags.disable(flagName, 'First disable');
      const secondDisable = featureFlags.disable(flagName, 'Second disable');
      expect(firstDisable).toBe(true);
      expect(secondDisable).toBe(true); // Idempotent
      expect(featureFlags.isEnabled(flagName)).toBe(false);
    });

    it('provides clear error messages for scope violations', async () => {
      const { checker, audit } = harness;
      const capabilityId = P1_CAPABILITIES[0];

      const result = await invokeP1Capability(capabilityId, checker, audit);
      
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.error?.message).toContain(capabilityId);
      expect(result.error?.message).toContain('P1');
      expect(result.error?.message).toContain('feature flag');
      expect(result.error?.requiredFlag).toBe(`enable_${capabilityId}`);
    });
  });
});

// Note: This test follows async-resource-lifecycle rules through:
// 1. vitest.config.ts has pool: 'forks' for process isolation
// 2. testTimeout, hookTimeout, teardownTimeout are configured
// 3. Proper cleanup in afterEach hooks
// 4. No Promise.race or setTimeout without cleanup
// 
// When this test is run via execute_pwsh, it should be wrapped with:
// Start-Job + Wait-Job -Timeout 90 to prevent hanging