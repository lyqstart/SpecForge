import { describe, expect, it } from 'vitest';
import {
  normalizeArtifactInventory,
  normalizeReleaseAuthority,
  type ArtifactInventoryDocument,
  type ReleaseAuthorityDocument,
} from '../src/release-evidence-normalizer';

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
      requiredSurfaces: ['release_manifest', 'clean_build', 'package_export'],
      dependencies: [],
      authoritySources: [
        '.kiro/specs/v6-architecture-overview/design.md',
        'docs/implementation/architecture-consistency/current-release-module-and-change-disposition-matrix.md',
      ],
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
    'runtime_entry',
    'release_manifest',
    'installer_asset',
    'dynamic_registry',
    'clean_build',
    'package_export',
  ],
  items: [
    {
      id: '@specforge/types',
      surface: 'release_manifest',
      path: 'release/manifest.json',
      sha256: 'd'.repeat(64),
      dependencies: [],
    },
    {
      id: '@specforge/types',
      surface: 'package_export',
      path: 'packages/types/package.json',
      sha256: 'e'.repeat(64),
      dependencies: [],
    },
    {
      id: '@specforge/types',
      surface: 'clean_build',
      path: 'packages/types/dist/src/index.js',
      sha256: 'f'.repeat(64),
      dependencies: [],
    },
  ],
};

describe('normalizeReleaseAuthority', () => {
  it('fails closed when the projection producer reports incomplete authority', () => {
    const result = normalizeReleaseAuthority({
      ...authority,
      complete: false,
    });

    expect(result.ok).toBe(false);
    expect(result.errors).toContain('authority:producer_reported_incomplete');
  });

  it('returns a stable malformed-document error instead of throwing', () => {
    const result = normalizeReleaseAuthority({ schemaVersion: '1.0' });

    expect(result.ok).toBe(false);
    expect(result.errors).toContain('authority_document:releaseId:invalid');
    expect(result.errors).toContain('authority_document:sources:invalid');
    expect(result.errors).toContain('authority_document:items:invalid');
  });

  it('accepts exactly the three declared authorities and returns byte-stable ordering', () => {
    const first = normalizeReleaseAuthority(authority);
    const second = normalizeReleaseAuthority({
      ...authority,
      sources: [...authority.sources].reverse(),
      items: [...authority.items].reverse(),
    });

    expect(first).toEqual(second);
    expect(first.ok).toBe(true);
    expect(first.errors).toEqual([]);
    expect(first.items.map((item) => item.id)).toEqual([
      '@specforge/types',
      'workflow:bugfix_spec',
    ]);
    expect(first.items[0].requiredSurfaces).toEqual([
      'clean_build',
      'package_export',
      'release_manifest',
    ]);
  });

  it('fails closed when one authority role is missing', () => {
    const result = normalizeReleaseAuthority({
      ...authority,
      sources: authority.sources.filter((source) => source.role !== 'v6_design'),
    });

    expect(result.ok).toBe(false);
    expect(result.errors).toContain('authority_role:v6_design:missing');
  });

  it('rejects duplicate IDs even when classifications match', () => {
    const result = normalizeReleaseAuthority({
      ...authority,
      items: [...authority.items, authority.items[0]],
    });

    expect(result.ok).toBe(false);
    expect(result.errors).toContain('authority_item:@specforge/types:duplicate');
  });

  it('rejects a current item without a production surface', () => {
    const result = normalizeReleaseAuthority({
      ...authority,
      items: [{ ...authority.items[0], requiredSurfaces: [] }],
    });

    expect(result.ok).toBe(false);
    expect(result.errors).toContain('authority_item:@specforge/types:required_surfaces_missing');
  });

  it('rejects an item that cites a non-declared authority path', () => {
    const result = normalizeReleaseAuthority({
      ...authority,
      items: [{ ...authority.items[0], authoritySources: ['README.md'] }],
    });

    expect(result.ok).toBe(false);
    expect(result.errors).toContain('authority_item:@specforge/types:undeclared_source:README.md');
  });
});

describe('normalizeArtifactInventory', () => {
  it('returns a stable malformed-document error instead of throwing', () => {
    const result = normalizeArtifactInventory({ schemaVersion: '1.0' }, authority.releaseId);

    expect(result.ok).toBe(false);
    expect(result.errors).toContain('inventory_document:releaseId:invalid');
    expect(result.errors).toContain('inventory_document:items:invalid');
    expect(result.inventory.complete).toBe(false);
  });

  it('accepts complete producer evidence and returns deterministic ordering', () => {
    const result = normalizeArtifactInventory(inventory, authority.releaseId);

    expect(result.ok).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.inventory.complete).toBe(true);
    expect(result.inventory.items.map((item) => `${item.id}@${item.surface}`)).toEqual([
      '@specforge/types@clean_build',
      '@specforge/types@package_export',
      '@specforge/types@release_manifest',
    ]);
  });

  it('fails closed when the producer did not enumerate every surface', () => {
    const result = normalizeArtifactInventory({
      ...inventory,
      enumeratedSurfaces: inventory.enumeratedSurfaces.filter(
        (surface) => surface !== 'dynamic_registry',
      ),
    }, authority.releaseId);

    expect(result.ok).toBe(false);
    expect(result.errors).toContain('inventory_surface:dynamic_registry:not_enumerated');
  });

  it('fails closed for a release/candidate authority mismatch', () => {
    const result = normalizeArtifactInventory(inventory, 'different-release');

    expect(result.ok).toBe(false);
    expect(result.errors).toContain(
      'inventory_release_id:specforge-v6-current:expected:different-release',
    );
  });

  it('rejects absolute and parent-traversal candidate paths', () => {
    const result = normalizeArtifactInventory({
      ...inventory,
      items: [
        { ...inventory.items[0], path: '../outside/manifest.json' },
        { ...inventory.items[1], path: 'C:/outside/package.json' },
      ],
    }, authority.releaseId);

    expect(result.ok).toBe(false);
    expect(result.errors).toContain('inventory_item:@specforge/types@release_manifest:path_not_candidate_relative');
    expect(result.errors).toContain('inventory_item:@specforge/types@package_export:path_not_candidate_relative');
  });
});
