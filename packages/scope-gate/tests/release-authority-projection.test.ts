import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  projectReleaseAuthority,
  type ReleaseAuthorityProjectionInput,
} from '../src/release-authority-projection';

const START = '<!-- SPECFORGE_RELEASE_AUTHORITY_ITEMS:START -->';
const END = '<!-- SPECFORGE_RELEASE_AUTHORITY_ITEMS:END -->';
const PRODUCT_SPEC_PATH = 'docs/product-specification/specforge-product-specification.md';

function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function productSpecBlock(overrides: Record<string, unknown> = {}): string {
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
        authoritySources: [PRODUCT_SPEC_PATH],
      },
    ],
    ...overrides,
  };
  return `product-spec-before\n${START}\n\u0060\u0060\u0060json\n${JSON.stringify(payload)}\n\u0060\u0060\u0060\n${END}\nproduct-spec-after\n`;
}

function input(content = productSpecBlock()): ReleaseAuthorityProjectionInput {
  return {
    releaseId: 'specforge-v6-current',
    productSpecification: {
      path: PRODUCT_SPEC_PATH,
      content,
    },
  };
}

describe('projectReleaseAuthority', () => {
  it('expands explicit ID groups into individual approved release items', () => {
    const result = projectReleaseAuthority(input(productSpecBlock({
      items: undefined,
      itemGroups: [
        {
          ids: ['@specforge/types', '@specforge/configuration'],
          classification: 'CURRENT_RELEASE_SUPPORTING',
          requiredSurfaces: ['package_export'],
          dependencies: [],
          authoritySources: [PRODUCT_SPEC_PATH],
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
    const result = projectReleaseAuthority(input(productSpecBlock({
      itemGroups: [{
        ids: ['@specforge/configuration'],
        classification: 'CURRENT_RELEASE_SUPPORTING',
        requiredSurfaces: ['package_export'],
        dependencies: [],
        authoritySources: [PRODUCT_SPEC_PATH],
      }],
    })));

    expect(result.ok).toBe(false);
    expect(result.errors).toContain('authority_projection:item_encoding_ambiguous');
  });

  it('rejects an empty explicit ID group', () => {
    const result = projectReleaseAuthority(input(productSpecBlock({
      items: undefined,
      itemGroups: [{
        ids: [],
        classification: 'CURRENT_RELEASE_SUPPORTING',
        requiredSurfaces: ['package_export'],
        dependencies: [],
        authoritySources: [PRODUCT_SPEC_PATH],
      }],
    })));

    expect(result.ok).toBe(false);
    expect(result.errors).toContain('authority_projection:item_group:0:ids_empty');
  });

  it('derives one complete document bound only to the product specification bytes', () => {
    const source = input();
    const result = projectReleaseAuthority(source);

    expect(result.ok).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.document?.complete).toBe(true);
    expect(result.document?.items.map((item) => item.id)).toEqual(['@specforge/types']);
    expect(result.document?.sources).toEqual([
      {
        role: 'product_specification',
        path: source.productSpecification.path,
        sha256: sha256(source.productSpecification.content),
      },
    ]);
  });

  it('fails closed when the product specification machine block is missing', () => {
    const result = projectReleaseAuthority(input('product spec without machine projection\n'));

    expect(result.ok).toBe(false);
    expect(result.errors).toContain('authority_projection:marker_pair_missing');
  });

  it('fails closed when the product specification contains duplicate machine blocks', () => {
    const block = productSpecBlock();
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
    const result = projectReleaseAuthority(input(productSpecBlock({ releaseId: 'other-release' })));

    expect(result.ok).toBe(false);
    expect(result.errors).toContain(
      'authority_projection:release_id:other-release:expected:specforge-v6-current',
    );
  });

  it('fails closed when the product specification declares an incomplete projection', () => {
    const result = projectReleaseAuthority(input(productSpecBlock({ complete: false })));

    expect(result.ok).toBe(false);
    expect(result.errors).toContain('authority:producer_reported_incomplete');
  });
});
