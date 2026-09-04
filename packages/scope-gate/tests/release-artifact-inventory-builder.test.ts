import { describe, expect, it } from 'vitest';
import {
  buildReleaseArtifactInventory,
  type ArtifactSurfaceReport,
} from '../src/release-artifact-inventory-builder';
import type { ArtifactSurface } from '../src/release-set-validator';

const surfaces: readonly ArtifactSurface[] = [
  'package_export',
  'clean_build',
  'dynamic_registry',
  'installer_asset',
  'release_manifest',
  'runtime_entry',
];

function reports(): ArtifactSurfaceReport[] {
  return surfaces.map((surface) => ({
    schemaVersion: '1.0',
    releaseId: 'specforge-v6-current',
    candidateId: 'candidate-sha256',
    surface,
    producer: `${surface}-producer`,
    complete: true,
    items: surface === 'package_export'
      ? [{
        id: '@specforge/types',
        surface,
        path: 'packages/types/package.json',
        sha256: 'a'.repeat(64),
        dependencies: [],
      }]
      : [],
  }));
}

describe('buildReleaseArtifactInventory', () => {
  it('assembles exactly six complete producer reports into one normalized inventory', () => {
    const result = buildReleaseArtifactInventory(reports());

    expect(result.ok).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.document?.complete).toBe(true);
    expect(result.document?.enumeratedSurfaces).toEqual([
      'clean_build',
      'dynamic_registry',
      'installer_asset',
      'package_export',
      'release_manifest',
      'runtime_entry',
    ]);
    expect(result.document?.items).toHaveLength(1);
  });

  it('fails closed when one surface producer is missing', () => {
    const result = buildReleaseArtifactInventory(
      reports().filter((report) => report.surface !== 'release_manifest'),
    );

    expect(result.ok).toBe(false);
    expect(result.errors).toContain('artifact_surface:release_manifest:producer_missing');
  });

  it('fails closed when one surface has duplicate producers', () => {
    const source = reports();
    const result = buildReleaseArtifactInventory([...source, source[0]]);

    expect(result.ok).toBe(false);
    expect(result.errors).toContain('artifact_surface:package_export:producer_duplicate');
  });

  it('fails closed when a producer reports incomplete enumeration', () => {
    const source = reports();
    source[2] = { ...source[2], complete: false };
    const result = buildReleaseArtifactInventory(source);

    expect(result.ok).toBe(false);
    expect(result.errors).toContain('artifact_surface:dynamic_registry:producer_incomplete');
  });

  it('fails closed when producer reports target different candidates', () => {
    const source = reports();
    source[5] = { ...source[5], candidateId: 'other-candidate' };
    const result = buildReleaseArtifactInventory(source);

    expect(result.ok).toBe(false);
    expect(result.errors).toContain(
      'artifact_surface:runtime_entry:candidate_id:other-candidate:expected:candidate-sha256',
    );
  });

  it('fails closed when a producer inserts an item from another surface', () => {
    const source = reports();
    source[1] = {
      ...source[1],
      items: [{
        id: '@specforge/types',
        surface: 'package_export',
        path: 'packages/types/package.json',
        sha256: 'b'.repeat(64),
        dependencies: [],
      }],
    };
    const result = buildReleaseArtifactInventory(source);

    expect(result.ok).toBe(false);
    expect(result.errors).toContain(
      'artifact_surface:clean_build:item_surface_mismatch:package_export',
    );
  });

  it('returns stable malformed-report errors instead of throwing', () => {
    const result = buildReleaseArtifactInventory([{}]);

    expect(result.ok).toBe(false);
    expect(result.errors).toContain('artifact_surface_report:0:releaseId:invalid');
    expect(result.errors).toContain('artifact_surface_report:0:items:invalid');
  });
});
