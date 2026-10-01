import { describe, expect, it } from 'vitest';

import {
  flattenRootTestRoleRegistry,
  listTrackedRootTests,
  loadRootTestRoleRegistry,
  selectRootTests,
  validateRootTestRoleRegistry,
} from '../../../scripts/run-root-tests.mjs';

describe('root test role registry', () => {
  it('classifies every tracked root test exactly once', () => {
    const registry = loadRootTestRoleRegistry();
    const tracked = listTrackedRootTests();

    expect(validateRootTestRoleRegistry(registry, tracked)).toEqual({
      CURRENT_HERMETIC: 58,
      CURRENT_ENVIRONMENTAL: 1,
      MIGRATED_DUPLICATE: 14,
      HISTORICAL_EVIDENCE: 110,
    });
  });

  it('keeps the default selection separate from environment and evidence roles', () => {
    const registry = loadRootTestRoleRegistry();
    const roles = flattenRootTestRoleRegistry(registry);
    const selected = new Set(selectRootTests(registry, 'current'));

    expect(selected).toEqual(new Set(roles.CURRENT_HERMETIC));
    expect(selected.has('tests/e2e/daemon-wiring.test.ts')).toBe(false);
    expect(selected.has('tests/e2e/v5-cleanup-verification.test.ts')).toBe(false);
  });

  it('requires an explicit replacement for every migrated duplicate', () => {
    const registry = loadRootTestRoleRegistry();

    for (const entry of registry.roles.MIGRATED_DUPLICATE.entries) {
      expect(entry.replacement.length).toBeGreaterThan(0);
      expect(entry.rationale.length).toBeGreaterThan(0);
    }
  });

  it('selects only environmental tests compatible with the requested host', () => {
    const registry = loadRootTestRoleRegistry();

    expect(selectRootTests(registry, 'environmental', 'win32')).toEqual([]);
    expect(selectRootTests(registry, 'environmental', 'linux')).toEqual([
      'tests/integration/service-management/linux-systemd-full-lifecycle.test.ts',
    ]);
  });
});
