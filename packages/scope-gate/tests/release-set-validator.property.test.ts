import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import {
  ReleaseSetValidator,
  type ApprovedReleaseItem,
  type ArtifactInventory,
  type ArtifactItem,
  type ArtifactSurface,
} from '../src/release-set-validator';

const surfaces: readonly ArtifactSurface[] = [
  'package_export',
  'clean_build',
  'dynamic_registry',
  'installer_asset',
  'release_manifest',
  'runtime_entry',
];

const current: ApprovedReleaseItem = {
  id: 'current:item',
  classification: 'CURRENT_RELEASE_CORE',
  requiredSurfaces: ['clean_build', 'release_manifest', 'runtime_entry'],
  dependencies: [],
  authoritySources: ['requirements.md#REQ-31'],
};

const currentArtifacts: ArtifactItem[] = current.requiredSurfaces.map((surface) => ({
  id: current.id,
  surface,
  path: `${surface}/${current.id}`,
  dependencies: [],
}));

function completeInventory(items: readonly ArtifactItem[]): ArtifactInventory {
  return { items, enumeratedSurfaces: surfaces, complete: true };
}

describe('ReleaseSetValidator properties', () => {
  it('adding any excluded item to any production surface always fails', () => {
    fc.assert(
      fc.property(
        fc.constantFrom('BUILT_NOT_ENABLED', 'LEGACY_ONLY', 'HISTORICAL_EVIDENCE_ONLY'),
        fc.constantFrom(...surfaces),
        fc.stringMatching(/^[a-z][a-z0-9_-]{0,20}$/),
        (classification, surface, suffix) => {
          const excluded: ApprovedReleaseItem = {
            id: `excluded:${suffix}`,
            classification,
            requiredSurfaces: [],
            dependencies: [],
            authoritySources: ['module-disposition-matrix.md'],
          };
          const artifact: ArtifactItem = {
            id: excluded.id,
            surface,
            path: `${surface}/${excluded.id}`,
            dependencies: [],
          };

          const verdict = new ReleaseSetValidator().validate(
            [current, excluded],
            completeInventory([...currentArtifacts, artifact]),
          );

          expect(verdict.status).toBe('failed');
          expect(verdict.unexpectedExcluded).toContain(`${excluded.id}@${surface}`);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('removing any required surface always fails', () => {
    fc.assert(
      fc.property(fc.constantFrom(...current.requiredSurfaces), (removedSurface) => {
        const remaining = currentArtifacts.filter((item) => item.surface !== removedSurface);
        const verdict = new ReleaseSetValidator().validate([current], completeInventory(remaining));

        expect(verdict.status).toBe('failed');
        expect(verdict.missingRequired).toContain(`${current.id}@${removedSurface}`);
      }),
      { numRuns: 100 },
    );
  });

  it('never changes verdict bytes when artifact order changes', () => {
    fc.assert(
      fc.property(
        fc.shuffledSubarray(currentArtifacts, {
          minLength: currentArtifacts.length,
          maxLength: currentArtifacts.length,
        }),
        (permutation) => {
          const validator = new ReleaseSetValidator();
          const canonical = validator.validate([current], completeInventory(currentArtifacts));
          const reordered = validator.validate([current], completeInventory(permutation));

          expect(JSON.stringify(reordered)).toBe(JSON.stringify(canonical));
        },
      ),
      { numRuns: 100 },
    );
  });
});
