import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = resolve(import.meta.dirname, '../../..');

describe('current Permission and Write Guard ownership boundary', () => {
  it('keeps Permission Engine independent of Daemon implementation', () => {
    const permissionPackage = JSON.parse(
      readFileSync(resolve(ROOT, 'packages/permission-engine/package.json'), 'utf8'),
    ) as { dependencies?: Record<string, string> };

    expect(permissionPackage.dependencies).not.toHaveProperty('@specforge/daemon-core');
  });

  it('keeps write enforcement out of Workflow Runtime', () => {
    const retiredWorkflowRuntimeSurfaces = [
      'packages/workflow-runtime/src/v11/runtime/WriteGuard.ts',
      'packages/workflow-runtime/tests/v11/unit/write-guard.test.ts',
      'packages/workflow-runtime/tests/v11/property/write-guard.property.test.ts',
    ] as const;

    for (const relativePath of retiredWorkflowRuntimeSurfaces) {
      expect(existsSync(resolve(ROOT, relativePath)), relativePath).toBe(false);
    }

    const legacyBarrel = readFileSync(
      resolve(ROOT, 'packages/workflow-runtime/src/v11/index.ts'),
      'utf8',
    );
    expect(legacyBarrel).not.toContain("./runtime/WriteGuard.js");
    expect(legacyBarrel).not.toContain('CodePermissionService');
    expect(legacyBarrel).not.toContain('ChangedFilesAudit');
  });

  it('keeps current write decisions and enforcement at the Daemon boundary', () => {
    const daemonWriteGuard = readFileSync(
      resolve(ROOT, 'packages/daemon-core/src/tools/lib/write-guard-v11.ts'),
      'utf8',
    );
    const daemonHttp = readFileSync(
      resolve(ROOT, 'packages/daemon-core/src/http/HTTPServer.ts'),
      'utf8',
    );
    const pluginClient = readFileSync(
      resolve(ROOT, 'packages/service-management/src/plugin/reconnecting-daemon-client.ts'),
      'utf8',
    );

    expect(daemonWriteGuard).toContain("from '@specforge/permission-engine'");
    expect(daemonWriteGuard).toContain('return decideWritePermission(ctx, targetPath, operation);');
    expect(daemonHttp).toContain('const result = checkWrite(wiCtx, targetPath');
    expect(pluginClient).toContain('/api/v1/v11/write-guard/check');
  });

  it('does not retain an unconsumed parallel Daemon write-policy evaluator', () => {
    const retiredDaemonSurfaces = [
      'packages/daemon-core/src/tools/lib/command-write-audit.ts',
      'packages/daemon-core/src/tools/lib/write-policy.ts',
    ] as const;

    for (const relativePath of retiredDaemonSurfaces) {
      expect(existsSync(resolve(ROOT, relativePath)), relativePath).toBe(false);
    }

    const daemonWriteGuard = readFileSync(
      resolve(ROOT, 'packages/daemon-core/src/tools/lib/write-guard-v11.ts'),
      'utf8',
    );
    expect(daemonWriteGuard).toContain('export interface WritePolicyRule');
    expect(daemonWriteGuard).not.toContain('DEFAULT_WRITE_POLICY_RULES');
    expect(daemonWriteGuard).not.toContain('export function evaluatePolicy(');
  });
});
