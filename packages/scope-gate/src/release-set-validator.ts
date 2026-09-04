export type ReleaseClassification =
  | 'CURRENT_RELEASE_CORE'
  | 'CURRENT_RELEASE_SUPPORTING'
  | 'BUILT_NOT_ENABLED'
  | 'LEGACY_ONLY'
  | 'HISTORICAL_EVIDENCE_ONLY';

export type ArtifactSurface =
  | 'package_export'
  | 'clean_build'
  | 'dynamic_registry'
  | 'installer_asset'
  | 'release_manifest'
  | 'runtime_entry';

export interface ApprovedReleaseItem {
  id: string;
  classification: ReleaseClassification;
  requiredSurfaces: readonly ArtifactSurface[];
  dependencies: readonly string[];
  authoritySources: readonly string[];
}

export interface ArtifactItem {
  id: string;
  surface: ArtifactSurface;
  path: string;
  sha256?: string;
  dependencies: readonly string[];
}

export interface ArtifactInventory {
  items: readonly ArtifactItem[];
  enumeratedSurfaces: readonly ArtifactSurface[];
  complete: boolean;
}

export interface ScopeVerdict {
  status: 'passed' | 'failed';
  missingRequired: readonly string[];
  unexpectedExcluded: readonly string[];
  invalidDependencies: readonly string[];
  incompleteEvidence: readonly string[];
}

const ALL_ARTIFACT_SURFACES: readonly ArtifactSurface[] = [
  'package_export',
  'clean_build',
  'dynamic_registry',
  'installer_asset',
  'release_manifest',
  'runtime_entry',
];

const CURRENT_CLASSIFICATIONS = new Set<ReleaseClassification>([
  'CURRENT_RELEASE_CORE',
  'CURRENT_RELEASE_SUPPORTING',
]);

function sortedUnique(values: Iterable<string>): string[] {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}

function isCurrent(item: ApprovedReleaseItem): boolean {
  return CURRENT_CLASSIFICATIONS.has(item.classification);
}

/**
 * Pure release-time comparator. It does not read configuration, feature flags,
 * permissions, the source tree, or runtime state to infer release scope.
 */
export class ReleaseSetValidator {
  validate(
    approved: readonly ApprovedReleaseItem[],
    inventory: ArtifactInventory,
  ): ScopeVerdict {
    const missingRequired: string[] = [];
    const unexpectedExcluded: string[] = [];
    const invalidDependencies: string[] = [];
    const incompleteEvidence: string[] = [];
    const approvedById = new Map<string, ApprovedReleaseItem>();

    for (const item of approved) {
      const normalizedId = item.id.trim();
      if (!normalizedId) {
        incompleteEvidence.push('authority:empty_id');
        continue;
      }

      const existing = approvedById.get(normalizedId);
      if (existing) {
        incompleteEvidence.push(
          existing.classification === item.classification
            ? `authority:${normalizedId}:duplicate_item`
            : `authority:${normalizedId}:conflicting_classification`,
        );
        continue;
      }

      approvedById.set(normalizedId, { ...item, id: normalizedId });
    }

    if (!inventory.complete) {
      incompleteEvidence.push('inventory:incomplete');
    }

    const enumeratedSurfaces = new Set(inventory.enumeratedSurfaces);
    for (const surface of ALL_ARTIFACT_SURFACES) {
      if (!enumeratedSurfaces.has(surface)) {
        incompleteEvidence.push(`surface:${surface}:not_enumerated`);
      }
    }

    const actualKeys = new Set<string>();
    for (const artifact of inventory.items) {
      const artifactId = artifact.id.trim();
      const key = `${artifactId}@${artifact.surface}`;
      actualKeys.add(key);

      const authorityItem = approvedById.get(artifactId);
      if (!authorityItem || !isCurrent(authorityItem)) {
        unexpectedExcluded.push(key);
      }

      for (const dependency of artifact.dependencies) {
        const dependencyItem = approvedById.get(dependency);
        if (!dependencyItem || !isCurrent(dependencyItem)) {
          invalidDependencies.push(`${artifactId}->${dependency}`);
        }
      }
    }

    for (const item of approvedById.values()) {
      if (!isCurrent(item)) {
        continue;
      }

      for (const surface of item.requiredSurfaces) {
        const key = `${item.id}@${surface}`;
        if (!actualKeys.has(key)) {
          missingRequired.push(key);
        }
      }

      for (const dependency of item.dependencies) {
        const dependencyItem = approvedById.get(dependency);
        if (!dependencyItem || !isCurrent(dependencyItem)) {
          invalidDependencies.push(`${item.id}->${dependency}`);
        }
      }
    }

    const verdict: ScopeVerdict = {
      status: 'passed',
      missingRequired: sortedUnique(missingRequired),
      unexpectedExcluded: sortedUnique(unexpectedExcluded),
      invalidDependencies: sortedUnique(invalidDependencies),
      incompleteEvidence: sortedUnique(incompleteEvidence),
    };

    if (
      verdict.missingRequired.length > 0
      || verdict.unexpectedExcluded.length > 0
      || verdict.invalidDependencies.length > 0
      || verdict.incompleteEvidence.length > 0
    ) {
      verdict.status = 'failed';
    }

    return verdict;
  }
}
