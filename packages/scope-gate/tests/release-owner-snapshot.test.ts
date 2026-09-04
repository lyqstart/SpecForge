import { describe, expect, it } from 'vitest';
import {
  buildReleaseOwnerSnapshot,
  type OwnerReleaseSnapshotReport,
} from '../src/release-owner-snapshot';

function reports(): OwnerReleaseSnapshotReport[] {
  return [
    {
      schemaVersion: '1.0',
      releaseId: 'specforge-v6-current',
      candidateId: 'candidate-sha256',
      owner: 'daemon_tool_registry',
      producer: 'daemon-tool-registry-owner-snapshot',
      complete: true,
      sources: [{
        path: 'packages/daemon-core/src/tools/handlers/sf-state-read.ts',
        sha256: 'a'.repeat(64),
      }],
      items: [{
        id: 'tool:sf_state_read',
        sourcePath: 'packages/daemon-core/src/tools/handlers/sf-state-read.ts',
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
      sources: [{
        path: 'configs/workflows/builtin/feature_spec.json',
        sha256: 'b'.repeat(64),
      }],
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
      sources: [{
        path: 'setup/userlevel-opencode/agents/sf-orchestrator.md',
        sha256: 'c'.repeat(64),
      }],
      items: [{
        id: 'agent:sf-orchestrator',
        sourcePath: 'setup/userlevel-opencode/agents/sf-orchestrator.md',
        dependencies: [],
      }],
    },
  ];
}

describe('buildReleaseOwnerSnapshot', () => {
  it('assembles exactly three complete owner reports with deterministic ordering', () => {
    const result = buildReleaseOwnerSnapshot(reports().reverse());

    expect(result.ok).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.document?.complete).toBe(true);
    expect(result.document?.owners.map((owner) => owner.owner)).toEqual([
      'daemon_tool_registry',
      'installer_registry',
      'workflow_registry',
    ]);
  });

  it('fails closed when one required owner is missing', () => {
    const result = buildReleaseOwnerSnapshot(
      reports().filter((report) => report.owner !== 'workflow_registry'),
    );

    expect(result.ok).toBe(false);
    expect(result.errors).toContain('owner_snapshot:workflow_registry:producer_missing');
  });

  it('fails closed when an owner has duplicate producers', () => {
    const source = reports();
    const result = buildReleaseOwnerSnapshot([...source, source[0]]);

    expect(result.ok).toBe(false);
    expect(result.errors).toContain('owner_snapshot:daemon_tool_registry:producer_duplicate');
  });

  it('fails closed when an owner reports incomplete enumeration', () => {
    const source = reports();
    source[0] = { ...source[0], complete: false };
    const result = buildReleaseOwnerSnapshot(source);

    expect(result.ok).toBe(false);
    expect(result.errors).toContain('owner_snapshot:daemon_tool_registry:producer_incomplete');
  });

  it('fails closed when release or candidate identity differs', () => {
    const source = reports();
    source[1] = { ...source[1], releaseId: 'other-release', candidateId: 'other-candidate' };
    const result = buildReleaseOwnerSnapshot(source);

    expect(result.ok).toBe(false);
    expect(result.errors).toContain(
      'owner_snapshot:workflow_registry:release_id:other-release:expected:specforge-v6-current',
    );
    expect(result.errors).toContain(
      'owner_snapshot:workflow_registry:candidate_id:other-candidate:expected:candidate-sha256',
    );
  });

  it('fails closed when a report is not emitted by the canonical owner producer', () => {
    const source = reports();
    source[2] = { ...source[2], producer: 'caller-self-report' };
    const result = buildReleaseOwnerSnapshot(source);

    expect(result.ok).toBe(false);
    expect(result.errors).toContain(
      'owner_snapshot:installer_registry:producer:caller-self-report:expected:installer-registry-owner-snapshot',
    );
  });

  it('fails closed when a source hash is malformed', () => {
    const source = reports();
    source[0] = {
      ...source[0],
      sources: [{ ...source[0].sources[0], sha256: 'not-a-sha256' }],
    };
    const result = buildReleaseOwnerSnapshot(source);

    expect(result.ok).toBe(false);
    expect(result.errors).toContain('owner_snapshot_report:0:sources.0.sha256:invalid');
  });

  it('fails closed when an item is not bound to a hashed owner source', () => {
    const source = reports();
    source[0] = {
      ...source[0],
      items: [{ ...source[0].items[0], sourcePath: 'caller/asserted-tool.ts' }],
    };
    const result = buildReleaseOwnerSnapshot(source);

    expect(result.ok).toBe(false);
    expect(result.errors).toContain(
      'owner_snapshot:daemon_tool_registry:item:tool:sf_state_read:source_unbound:caller/asserted-tool.ts',
    );
  });

  it('fails closed on duplicate IDs within one owner report', () => {
    const source = reports();
    source[0] = { ...source[0], items: [...source[0].items, source[0].items[0]] };
    const result = buildReleaseOwnerSnapshot(source);

    expect(result.ok).toBe(false);
    expect(result.errors).toContain(
      'owner_snapshot:daemon_tool_registry:item_id:tool:sf_state_read:duplicate',
    );
  });

  it('fails closed when an owner emits an item outside its namespace', () => {
    const source = reports();
    source[1] = {
      ...source[1],
      items: [{ ...source[1].items[0], id: 'tool:sf_state_read' }],
    };
    const result = buildReleaseOwnerSnapshot(source);

    expect(result.ok).toBe(false);
    expect(result.errors).toContain(
      'owner_snapshot:workflow_registry:item_id:tool:sf_state_read:namespace_invalid',
    );
  });

  it('fails closed when a source path is absolute or escapes the candidate root', () => {
    const source = reports();
    source[2] = {
      ...source[2],
      sources: [{ path: '../outside.md', sha256: 'c'.repeat(64) }],
      items: [{ ...source[2].items[0], sourcePath: '../outside.md' }],
    };
    const result = buildReleaseOwnerSnapshot(source);

    expect(result.ok).toBe(false);
    expect(result.errors).toContain(
      'owner_snapshot:installer_registry:source_path:../outside.md:unsafe',
    );
  });
});
