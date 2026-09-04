import { describe, expect, it } from 'vitest';
import { produceOwnerSnapshotSurfaceReports } from '../src/owner-snapshot-surface-producers';
import type { OwnerReleaseSnapshotReport } from '../src/release-owner-snapshot';

function reports(): OwnerReleaseSnapshotReport[] {
  return [
    {
      schemaVersion: '1.0',
      releaseId: 'specforge-v6-current',
      candidateId: 'candidate-sha256',
      owner: 'daemon_tool_registry',
      producer: 'daemon-tool-registry-owner-snapshot',
      complete: true,
      sources: [{ path: 'daemon/tools/index.ts', sha256: 'a'.repeat(64) }],
      items: [{
        id: 'tool:sf_state_read',
        sourcePath: 'daemon/tools/index.ts',
        dependencies: [],
      }],
    },
    {
      schemaVersion: '1.0',
      releaseId: 'specforge-v6-current',
      candidateId: 'candidate-sha256',
      owner: 'workflow_registry',
      producer: 'workflow-runtime-owner-snapshot',
      complete: true,
      sources: [{ path: 'configs/workflows/builtin/feature_spec.json', sha256: 'b'.repeat(64) }],
      items: [{
        id: 'workflow:feature_spec',
        sourcePath: 'configs/workflows/builtin/feature_spec.json',
        dependencies: [],
      }],
    },
    {
      schemaVersion: '1.0',
      releaseId: 'specforge-v6-current',
      candidateId: 'candidate-sha256',
      owner: 'installer_registry',
      producer: 'installer-registry-owner-snapshot',
      complete: true,
      sources: [
        { path: 'setup/agents/sf-orchestrator.md', sha256: 'c'.repeat(64) },
        { path: 'setup/tools/sf_state_read.ts', sha256: 'd'.repeat(64) },
      ],
      items: [
        {
          id: 'tool:sf_state_read',
          sourcePath: 'setup/tools/sf_state_read.ts',
          dependencies: [],
        },
        {
          id: 'agent:sf-orchestrator',
          sourcePath: 'setup/agents/sf-orchestrator.md',
          dependencies: [],
        },
      ],
    },
  ];
}

describe('produceOwnerSnapshotSurfaceReports', () => {
  it('builds complete dynamic-registry and installer-asset reports from validated owners', () => {
    const result = produceOwnerSnapshotSurfaceReports(reports().reverse());

    expect(result.errors).toEqual([]);
    expect(result.reports?.map((report) => report.surface)).toEqual([
      'dynamic_registry',
      'installer_asset',
    ]);
    expect(result.reports?.every((report) => report.complete)).toBe(true);
  });

  it('uses daemon tools, workflow definitions and installer agents for dynamic registry', () => {
    const result = produceOwnerSnapshotSurfaceReports(reports());
    const dynamic = result.reports?.find((report) => report.surface === 'dynamic_registry');

    expect(dynamic?.items.map((item) => item.id)).toEqual([
      'agent:sf-orchestrator',
      'tool:sf_state_read',
      'workflow:feature_spec',
    ]);
    expect(dynamic?.items.find((item) => item.id === 'tool:sf_state_read')?.path)
      .toBe('daemon/tools/index.ts');
  });

  it('uses installer-owned items only for installer asset evidence', () => {
    const result = produceOwnerSnapshotSurfaceReports(reports());
    const installer = result.reports?.find((report) => report.surface === 'installer_asset');

    expect(installer?.items.map((item) => item.id)).toEqual([
      'agent:sf-orchestrator',
      'tool:sf_state_read',
    ]);
    expect(installer?.items.find((item) => item.id === 'tool:sf_state_read')?.sha256)
      .toBe('d'.repeat(64));
  });

  it('does not emit surfaces when owner validation fails', () => {
    const source = reports();
    source[0] = { ...source[0], producer: 'caller-self-report' };
    const result = produceOwnerSnapshotSurfaceReports(source);

    expect(result.reports).toBeUndefined();
    expect(result.errors).toContain(
      'owner_snapshot:daemon_tool_registry:producer:caller-self-report:expected:daemon-tool-registry-owner-snapshot',
    );
  });
});
