import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  projectReleaseAuthority,
  type ReleaseAuthorityProjectionInput,
} from '../src/release-authority-projection';

const START = '<!-- SPECFORGE_RELEASE_AUTHORITY_ITEMS:START -->';
const END = '<!-- SPECFORGE_RELEASE_AUTHORITY_ITEMS:END -->';

function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function matrixBlock(overrides: Record<string, unknown> = {}): string {
  const payload = {
    schemaVersion: '1.0',
    releaseId: 'specforge-v6-current',
    complete: true,
    items: [
      {
        id: '@specforge/types',
        classification: 'CURRENT_RELEASE_SUPPORTING',
        requiredSurfaces: ['package_export'],
        dependencies: [],
        authoritySources: [
          '.kiro/specs/v6-architecture-overview/design.md',
          'docs/implementation/architecture-consistency/current-release-module-and-change-disposition-matrix.md',
        ],
      },
    ],
    ...overrides,
  };
  return `matrix-before\n${START}\n\u0060\u0060\u0060json\n${JSON.stringify(payload)}\n\u0060\u0060\u0060\n${END}\nmatrix-after\n`;
}

function input(matrixContent = matrixBlock()): ReleaseAuthorityProjectionInput {
  return {
    releaseId: 'specforge-v6-current',
    requirements: {
      path: '.kiro/specs/v6-architecture-overview/requirements.md',
      content: 'requirements-current-bytes\n',
    },
    design: {
      path: '.kiro/specs/v6-architecture-overview/design.md',
      content: 'design-current-bytes\n',
    },
    matrix: {
      path: 'docs/implementation/architecture-consistency/current-release-module-and-change-disposition-matrix.md',
      content: matrixContent,
    },
  };
}

describe('projectReleaseAuthority', () => {
  it('expands explicit ID groups into individual approved release items', () => {
    const result = projectReleaseAuthority(input(matrixBlock({
      items: undefined,
      itemGroups: [
        {
          ids: ['@specforge/types', '@specforge/configuration'],
          classification: 'CURRENT_RELEASE_SUPPORTING',
          requiredSurfaces: ['package_export'],
          dependencies: [],
          authoritySources: [
            '.kiro/specs/v6-architecture-overview/design.md',
            'docs/implementation/architecture-consistency/current-release-module-and-change-disposition-matrix.md',
          ],
        },
      ],
    })));

    expect(result.ok).toBe(true);
    expect(result.document?.items.map((item) => item.id)).toEqual([
      '@specforge/configuration',
      '@specforge/types',
    ]);
  });

  it('rejects payloads that mix individual items and item groups', () => {
    const result = projectReleaseAuthority(input(matrixBlock({
      itemGroups: [{
        ids: ['@specforge/configuration'],
        classification: 'CURRENT_RELEASE_SUPPORTING',
        requiredSurfaces: ['package_export'],
        dependencies: [],
        authoritySources: ['.kiro/specs/v6-architecture-overview/design.md'],
      }],
    })));

    expect(result.ok).toBe(false);
    expect(result.errors).toContain('authority_projection:item_encoding_ambiguous');
  });

  it('rejects an empty explicit ID group', () => {
    const result = projectReleaseAuthority(input(matrixBlock({
      items: undefined,
      itemGroups: [{
        ids: [],
        classification: 'CURRENT_RELEASE_SUPPORTING',
        requiredSurfaces: ['package_export'],
        dependencies: [],
        authoritySources: ['.kiro/specs/v6-architecture-overview/design.md'],
      }],
    })));

    expect(result.ok).toBe(false);
    expect(result.errors).toContain('authority_projection:item_group:0:ids_empty');
  });

  it('derives one complete document and binds all three source byte hashes', () => {
    const source = input();
    const result = projectReleaseAuthority(source);

    expect(result.ok).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.document?.complete).toBe(true);
    expect(result.document?.items.map((item) => item.id)).toEqual(['@specforge/types']);
    expect(result.document?.sources).toEqual([
      {
        role: 'module_disposition_matrix',
        path: source.matrix.path,
        sha256: sha256(source.matrix.content),
      },
      {
        role: 'v6_design',
        path: source.design.path,
        sha256: sha256(source.design.content),
      },
      {
        role: 'v6_requirements',
        path: source.requirements.path,
        sha256: sha256(source.requirements.content),
      },
    ]);
  });

  it('fails closed when the matrix machine block is missing', () => {
    const result = projectReleaseAuthority(input('matrix without machine projection\n'));

    expect(result.ok).toBe(false);
    expect(result.errors).toContain('authority_projection:marker_pair_missing');
  });

  it('fails closed when the matrix contains duplicate machine blocks', () => {
    const block = matrixBlock();
    const result = projectReleaseAuthority(input(block + block));

    expect(result.ok).toBe(false);
    expect(result.errors).toContain('authority_projection:marker_pair_not_unique');
  });

  it('fails closed when the machine payload is malformed JSON', () => {
    const result = projectReleaseAuthority(input(`${START}\n\u0060\u0060\u0060json\n{bad\n\u0060\u0060\u0060\n${END}\n`));

    expect(result.ok).toBe(false);
    expect(result.errors).toContain('authority_projection:json_invalid');
  });

  it('fails closed when the projected release differs from the requested release', () => {
    const result = projectReleaseAuthority(input(matrixBlock({ releaseId: 'other-release' })));

    expect(result.ok).toBe(false);
    expect(result.errors).toContain(
      'authority_projection:release_id:other-release:expected:specforge-v6-current',
    );
  });

  it('fails closed when the matrix declares an incomplete projection', () => {
    const result = projectReleaseAuthority(input(matrixBlock({ complete: false })));

    expect(result.ok).toBe(false);
    expect(result.errors).toContain('authority:producer_reported_incomplete');
  });
});
