import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { produceRepositoryOwnerSnapshotReports } from '../../../scripts/lib/release-owner-snapshot-producers';
import { buildReleaseOwnerSnapshot } from '../src/release-owner-snapshot';
import { produceOwnerSnapshotSurfaceReports } from '../src/owner-snapshot-surface-producers';
import { projectReleaseAuthority } from '../src/release-authority-projection';
import { ReleaseSetValidator } from '../src/release-set-validator';

const candidateRoot = fileURLToPath(new URL('../../../', import.meta.url));
const productSpecPath = 'docs/product-specification/specforge-product-specification.md';

function read(relativePath: string): string {
  return readFileSync(resolve(candidateRoot, relativePath), 'utf8');
}

describe('current repository owner snapshot producers', () => {
  it('enumerates actual daemon, workflow and installer owners with source hashes', async () => {
    const produced = await produceRepositoryOwnerSnapshotReports({
      candidateRoot,
      releaseId: 'specforge-v6-current',
      candidateId: 'main-45a0cfee',
    });

    expect(produced.errors).toEqual([]);
    expect(produced.reports).toHaveLength(3);
    expect(produced.reports.every((report) => report.complete)).toBe(true);

    const daemon = produced.reports.find((report) => report.owner === 'daemon_tool_registry');
    const workflow = produced.reports.find((report) => report.owner === 'workflow_registry');
    const installer = produced.reports.find((report) => report.owner === 'installer_registry');

    expect(daemon?.items.length).toBeGreaterThan(0);
    expect(daemon?.items.some((item) => item.id === 'tool:sf_state_read')).toBe(true);
    expect(daemon?.items.some((item) => item.id === 'tool:sf_v11_gate_run')).toBe(false);
    expect(workflow?.items).toHaveLength(1);
    expect(workflow?.items.some((item) => item.id === 'workflow:feature_spec')).toBe(true);
    expect(installer?.items.some((item) => item.id === 'agent:sf-extension')).toBe(false);
    expect(installer?.items.some((item) => item.id === 'agent:sf-analyst')).toBe(true);

    const snapshot = buildReleaseOwnerSnapshot(produced.reports);
    expect(snapshot.ok).toBe(true);

    const surfaces = produceOwnerSnapshotSurfaceReports(produced.reports);
    expect(surfaces.errors).toEqual([]);
    expect(surfaces.reports).toHaveLength(2);
  });

  it('has no current authority drift on dynamic registry and installer asset surfaces', async () => {
    const authority = projectReleaseAuthority({
      releaseId: 'specforge-v6-current',
      productSpecification: { path: productSpecPath, content: read(productSpecPath) },
    });
    const produced = await produceRepositoryOwnerSnapshotReports({
      candidateRoot,
      releaseId: 'specforge-v6-current',
      candidateId: 'main-45a0cfee',
    });
    const surfaces = produceOwnerSnapshotSurfaceReports(produced.reports);
    expect(authority.ok, authority.errors.join('\n')).toBe(true);
    expect(produced.errors).toEqual([]);
    expect(surfaces.errors).toEqual([]);

    const verdict = new ReleaseSetValidator().validate(
      authority.document?.items ?? [],
      {
        complete: true,
        enumeratedSurfaces: [
          'clean_build',
          'dynamic_registry',
          'installer_asset',
          'package_export',
          'release_manifest',
          'runtime_entry',
        ],
        items: surfaces.reports?.flatMap((report) => report.items) ?? [],
      },
    );
    const selectedSuffixes = ['@dynamic_registry', '@installer_asset'];
    const selectedMissing = verdict.missingRequired.filter((entry) => (
      selectedSuffixes.some((suffix) => entry.endsWith(suffix))
    ));
    const selectedUnexpected = verdict.unexpectedExcluded.filter((entry) => (
      selectedSuffixes.some((suffix) => entry.endsWith(suffix))
    ));

    expect({
      missingRequired: selectedMissing,
      unexpectedExcluded: selectedUnexpected,
    }).toEqual({
      missingRequired: [],
      unexpectedExcluded: [],
    });
  });
});
