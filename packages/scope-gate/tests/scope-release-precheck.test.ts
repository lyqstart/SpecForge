import { describe, expect, it } from 'vitest';
import {
  runScopeReleasePrecheck,
  type ArtifactInventoryDocument,
  type ReleaseAuthorityDocument,
} from '../src';

const authority: ReleaseAuthorityDocument = {
  schemaVersion: '1.0',
  releaseId: 'specforge-v6-current',
  complete: true,
  sources: [
    {
      role: 'v6_requirements',
      path: '.kiro/specs/v6-architecture-overview/requirements.md',
      sha256: 'a'.repeat(64),
    },
    {
      role: 'v6_design',
      path: '.kiro/specs/v6-architecture-overview/design.md',
      sha256: 'b'.repeat(64),
    },
    {
      role: 'module_disposition_matrix',
      path: 'docs/implementation/architecture-consistency/current-release-module-and-change-disposition-matrix.md',
      sha256: 'c'.repeat(64),
    },
  ],
  items: [
    {
      id: '@specforge/types',
      classification: 'CURRENT_RELEASE_SUPPORTING',
      requiredSurfaces: ['package_export'],
      dependencies: [],
      authoritySources: ['.kiro/specs/v6-architecture-overview/design.md'],
    },
    {
      id: 'workflow:bugfix_spec',
      classification: 'BUILT_NOT_ENABLED',
      requiredSurfaces: [],
      dependencies: [],
      authoritySources: [
        'docs/implementation/architecture-consistency/current-release-module-and-change-disposition-matrix.md',
      ],
    },
  ],
};

const inventory: ArtifactInventoryDocument = {
  schemaVersion: '1.0',
  releaseId: 'specforge-v6-current',
  candidateId: 'candidate-sha256',
  producer: 'clean-release-candidate-builder',
  complete: true,
  enumeratedSurfaces: [
    'package_export',
    'clean_build',
    'dynamic_registry',
    'installer_asset',
    'release_manifest',
    'runtime_entry',
  ],
  items: [
    {
      id: '@specforge/types',
      surface: 'package_export',
      path: 'packages/types/package.json',
      sha256: 'd'.repeat(64),
      dependencies: [],
    },
  ],
};

describe('runScopeReleasePrecheck', () => {
  it('passes only when authority, evidence, and release-set comparison all pass', () => {
    const result = runScopeReleasePrecheck(authority, inventory);

    expect(result.status).toBe('passed');
    expect(result.errorCode).toBeUndefined();
    expect(result.authorityErrors).toEqual([]);
    expect(result.inventoryErrors).toEqual([]);
    expect(result.verdict.status).toBe('passed');
  });

  it('reports SCOPE_AUTHORITY_CONFLICT before evaluating untrusted inventory', () => {
    const result = runScopeReleasePrecheck({
      ...authority,
      sources: authority.sources.filter((source) => source.role !== 'v6_design'),
    }, inventory);

    expect(result.status).toBe('failed');
    expect(result.errorCode).toBe('SCOPE_AUTHORITY_CONFLICT');
    expect(result.authorityErrors).toContain('authority_role:v6_design:missing');
  });

  it('reports SCOPE_EVIDENCE_INSUFFICIENT for incomplete producer enumeration', () => {
    const result = runScopeReleasePrecheck(authority, {
      ...inventory,
      complete: false,
    });

    expect(result.status).toBe('failed');
    expect(result.errorCode).toBe('SCOPE_EVIDENCE_INSUFFICIENT');
    expect(result.inventoryErrors).toContain('inventory:producer_reported_incomplete');
  });

  it('reports SCOPE_BOUNDARY_VIOLATION when an excluded item is shipped', () => {
    const result = runScopeReleasePrecheck(authority, {
      ...inventory,
      items: [
        ...inventory.items,
        {
          id: 'workflow:bugfix_spec',
          surface: 'dynamic_registry',
          path: 'release/workflows/bugfix_spec.json',
          sha256: 'e'.repeat(64),
          dependencies: [],
        },
      ],
    });

    expect(result.status).toBe('failed');
    expect(result.errorCode).toBe('SCOPE_BOUNDARY_VIOLATION');
    expect(result.verdict.unexpectedExcluded).toEqual([
      'workflow:bugfix_spec@dynamic_registry',
    ]);
  });

  it('reports RELEASE_SET_INCOMPLETE when a required surface is absent', () => {
    const result = runScopeReleasePrecheck(authority, {
      ...inventory,
      items: [],
    });

    expect(result.status).toBe('failed');
    expect(result.errorCode).toBe('RELEASE_SET_INCOMPLETE');
    expect(result.verdict.missingRequired).toEqual([
      '@specforge/types@package_export',
    ]);
  });
});
