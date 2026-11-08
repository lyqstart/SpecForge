import { describe, expect, it } from 'vitest';
import {
  ReleaseSetValidator,
  type ApprovedReleaseItem,
  type ArtifactInventory,
  type ArtifactItem,
} from '../src/release-set-validator';

const approved: ApprovedReleaseItem[] = [
  {
    id: '@specforge/daemon-core',
    classification: 'CURRENT_RELEASE_CORE',
    requiredSurfaces: ['package_export', 'clean_build', 'installer_asset', 'release_manifest', 'runtime_entry'],
    dependencies: ['@specforge/types'],
    authoritySources: ['requirements.md#REQ-31', 'design.md#0.3'],
  },
  {
    id: '@specforge/types',
    classification: 'CURRENT_RELEASE_SUPPORTING',
    requiredSurfaces: ['package_export', 'clean_build', 'release_manifest'],
    dependencies: [],
    authoritySources: ['design.md#0.3'],
  },
  {
    id: 'workflow:bugfix_spec',
    classification: 'BUILT_NOT_ENABLED',
    requiredSurfaces: [],
    dependencies: [],
    authoritySources: ['module-disposition-matrix.md#4.1'],
  },
  {
    id: 'legacy:project-layout',
    classification: 'LEGACY_ONLY',
    requiredSurfaces: [],
    dependencies: [],
    authoritySources: ['ADR-013'],
  },
  {
    id: 'history:error-ledger',
    classification: 'HISTORICAL_EVIDENCE_ONLY',
    requiredSurfaces: [],
    dependencies: [],
    authoritySources: ['REQ-31.8'],
  },
];

const actual: ArtifactItem[] = [
  { id: '@specforge/daemon-core', surface: 'package_export', path: 'packages/daemon-core/package.json', dependencies: ['@specforge/types'] },
  { id: '@specforge/daemon-core', surface: 'clean_build', path: 'dist/daemon-core/index.js', dependencies: ['@specforge/types'] },
  { id: '@specforge/daemon-core', surface: 'installer_asset', path: 'release/bin/specforged', dependencies: ['@specforge/types'] },
  { id: '@specforge/daemon-core', surface: 'release_manifest', path: 'release/manifest.json', dependencies: ['@specforge/types'] },
  { id: '@specforge/daemon-core', surface: 'runtime_entry', path: 'release/bin/specforged', dependencies: ['@specforge/types'] },
  { id: '@specforge/types', surface: 'package_export', path: 'packages/types/package.json', dependencies: [] },
  { id: '@specforge/types', surface: 'clean_build', path: 'dist/types/index.js', dependencies: [] },
  { id: '@specforge/types', surface: 'release_manifest', path: 'release/manifest.json', dependencies: [] },
];

function inventory(items: ArtifactItem[] = actual, complete = true): ArtifactInventory {
  return {
    items,
    enumeratedSurfaces: [
      'package_export',
      'clean_build',
      'dynamic_registry',
      'installer_asset',
      'release_manifest',
      'runtime_entry',
    ],
    complete,
  };
}

describe('ReleaseSetValidator', () => {
  it('passes only when every required current-release surface is present and excluded items are absent', () => {
    const verdict = new ReleaseSetValidator().validate(approved, inventory());

    expect(verdict).toEqual({
      status: 'passed',
      missingRequired: [],
      unexpectedExcluded: [],
      invalidDependencies: [],
      incompleteEvidence: [],
    });
  });

  it.each(['BUILT_NOT_ENABLED', 'LEGACY_ONLY', 'HISTORICAL_EVIDENCE_ONLY'] as const)(
    'fails when a %s item appears on any production artifact surface',
    (classification) => {
      const excluded = approved.find((item) => item.classification === classification)!;
      const verdict = new ReleaseSetValidator().validate(approved, inventory([
        ...actual,
        { id: excluded.id, surface: 'release_manifest', path: 'release/manifest.json', dependencies: [] },
      ]));

      expect(verdict.status).toBe('failed');
      expect(verdict.unexpectedExcluded).toEqual([`${excluded.id}@release_manifest`]);
    },
  );

  it('fails when a required current-release surface is missing', () => {
    const withoutDaemonRuntime = actual.filter(
      (item) => !(item.id === '@specforge/daemon-core' && item.surface === 'runtime_entry'),
    );

    const verdict = new ReleaseSetValidator().validate(approved, inventory(withoutDaemonRuntime));

    expect(verdict.status).toBe('failed');
    expect(verdict.missingRequired).toEqual(['@specforge/daemon-core@runtime_entry']);
  });

  it('fails when a current item depends on an excluded item', () => {
    const withExcludedDependency = approved.map((item) =>
      item.id === '@specforge/daemon-core'
        ? { ...item, dependencies: [...item.dependencies, 'workflow:bugfix_spec'] }
        : item,
    );

    const verdict = new ReleaseSetValidator().validate(withExcludedDependency, inventory());

    expect(verdict.status).toBe('failed');
    expect(verdict.invalidDependencies).toEqual([
      '@specforge/daemon-core->workflow:bugfix_spec',
    ]);
  });

  it('fails closed when inventory completeness or surface enumeration is not proven', () => {
    const verdict = new ReleaseSetValidator().validate(approved, {
      items: actual,
      enumeratedSurfaces: ['package_export', 'clean_build'],
      complete: false,
    });

    expect(verdict.status).toBe('failed');
    expect(verdict.incompleteEvidence).toEqual([
      'inventory:incomplete',
      'surface:dynamic_registry:not_enumerated',
      'surface:installer_asset:not_enumerated',
      'surface:release_manifest:not_enumerated',
      'surface:runtime_entry:not_enumerated',
    ]);
  });

  it('rejects conflicting duplicate authority classifications instead of choosing one', () => {
    const conflicting = [
      ...approved,
      {
        ...approved[0],
        classification: 'LEGACY_ONLY' as const,
      },
    ];

    const verdict = new ReleaseSetValidator().validate(conflicting, inventory());

    expect(verdict.status).toBe('failed');
    expect(verdict.incompleteEvidence).toEqual([
      'authority:@specforge/daemon-core:conflicting_classification',
    ]);
  });

  it('produces a deterministic, sorted verdict for identical sets in any input order', () => {
    const validator = new ReleaseSetValidator();
    const forward = validator.validate(approved, inventory(actual));
    const reverse = validator.validate([...approved].reverse(), inventory([...actual].reverse()));

    expect(JSON.stringify(reverse)).toBe(JSON.stringify(forward));
  });
});
