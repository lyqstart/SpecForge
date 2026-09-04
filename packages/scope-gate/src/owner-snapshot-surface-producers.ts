import type { ArtifactSurfaceReport } from './release-artifact-inventory-builder';
import {
  buildReleaseOwnerSnapshot,
  type OwnerReleaseSnapshotReport,
  type ReleaseOwnerId,
} from './release-owner-snapshot';
import type { ArtifactItem, ArtifactSurface } from './release-set-validator';

export interface OwnerSnapshotSurfaceProductionResult {
  reports?: readonly ArtifactSurfaceReport[];
  errors: readonly string[];
}

const DYNAMIC_INSTALLER_PREFIXES = ['agent:', 'skill:', 'tool:'] as const;

function itemsForOwnerSurface(
  owner: OwnerReleaseSnapshotReport,
  surface: ArtifactSurface,
  include: (id: string) => boolean,
): ArtifactItem[] {
  const hashes = new Map(owner.sources.map((source) => [source.path, source.sha256]));
  return owner.items
    .filter((item) => include(item.id))
    .map((item) => ({
      id: item.id,
      surface,
      path: item.sourcePath,
      sha256: hashes.get(item.sourcePath),
      dependencies: [...item.dependencies],
    }));
}

function ownerById(
  reports: readonly OwnerReleaseSnapshotReport[],
  owner: ReleaseOwnerId,
): OwnerReleaseSnapshotReport {
  const report = reports.find((candidate) => candidate.owner === owner);
  if (!report) throw new Error(`validated owner snapshot missing ${owner}`);
  return report;
}

function sortedItems(items: readonly ArtifactItem[]): ArtifactItem[] {
  return [...items].sort((left, right) => {
    const leftKey = `${left.id}:${left.path}`;
    const rightKey = `${right.id}:${right.path}`;
    return leftKey.localeCompare(rightKey);
  });
}

function uniqueItemsById(items: readonly ArtifactItem[]): ArtifactItem[] {
  const unique = new Map<string, ArtifactItem>();
  for (const item of items) {
    if (!unique.has(item.id)) unique.set(item.id, item);
  }
  return [...unique.values()];
}

/**
 * Converts canonical owner reports into the two release evidence surfaces they
 * directly own. Membership is never inferred from authority or feature flags.
 */
export function produceOwnerSnapshotSurfaceReports(
  inputs: readonly unknown[],
): OwnerSnapshotSurfaceProductionResult {
  const snapshot = buildReleaseOwnerSnapshot(inputs);
  if (!snapshot.ok || !snapshot.document) {
    return { errors: snapshot.errors };
  }

  const daemon = ownerById(snapshot.document.owners, 'daemon_tool_registry');
  const workflow = ownerById(snapshot.document.owners, 'workflow_registry');
  const installer = ownerById(snapshot.document.owners, 'installer_registry');

  const dynamicItems = sortedItems(uniqueItemsById([
    ...itemsForOwnerSurface(daemon, 'dynamic_registry', () => true),
    ...itemsForOwnerSurface(workflow, 'dynamic_registry', () => true),
    ...itemsForOwnerSurface(
      installer,
      'dynamic_registry',
      (id) => DYNAMIC_INSTALLER_PREFIXES.some((prefix) => id.startsWith(prefix)),
    ),
  ]));
  const installerItems = sortedItems(
    itemsForOwnerSurface(installer, 'installer_asset', () => true),
  );

  return {
    reports: [
      {
        schemaVersion: '1.0',
        releaseId: snapshot.document.releaseId,
        candidateId: snapshot.document.candidateId,
        surface: 'dynamic_registry',
        producer: 'owner-snapshot-dynamic-registry-surface-producer',
        complete: true,
        items: dynamicItems,
      },
      {
        schemaVersion: '1.0',
        releaseId: snapshot.document.releaseId,
        candidateId: snapshot.document.candidateId,
        surface: 'installer_asset',
        producer: 'owner-snapshot-installer-asset-surface-producer',
        complete: true,
        items: installerItems,
      },
    ],
    errors: [],
  };
}
