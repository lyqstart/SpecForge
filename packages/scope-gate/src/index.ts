/**
 * @specforge/scope-gate
 *
 * Current-release build and release-evidence validation only. This package is
 * not a business-runtime scope registry and does not expose runtime feature
 * flags for capabilities outside the V6.0 release boundary.
 */

export { ReleaseSetValidator } from './release-set-validator';
export type {
  ReleaseClassification,
  ArtifactSurface,
  ApprovedReleaseItem,
  ArtifactItem,
  ArtifactInventory,
  ScopeVerdict,
} from './release-set-validator';

export {
  normalizeArtifactInventory,
  normalizeReleaseAuthority,
} from './release-evidence-normalizer';
export type {
  ArtifactInventoryDocument,
  NormalizedArtifactInventory,
  NormalizedReleaseAuthority,
  ReleaseAuthorityDocument,
  ReleaseAuthorityRole,
  ReleaseAuthoritySource,
} from './release-evidence-normalizer';

export { projectReleaseAuthority } from './release-authority-projection';
export type {
  AuthoritySourceBytes,
  ReleaseAuthorityProjectionInput,
  ReleaseAuthorityProjectionResult,
} from './release-authority-projection';

export { buildReleaseArtifactInventory } from './release-artifact-inventory-builder';
export type {
  ArtifactSurfaceReport,
  ReleaseArtifactInventoryBuildResult,
} from './release-artifact-inventory-builder';

export {
  produceCleanBuildSurfaceReport,
  producePackageExportSurfaceReport,
} from './node-release-surface-producers';
export type {
  NodeReleaseSurfaceProducerOptions,
  SurfaceReportProductionResult,
} from './node-release-surface-producers';

export { buildReleaseOwnerSnapshot } from './release-owner-snapshot';
export type {
  OwnerReleaseSnapshotReport,
  OwnerSnapshotItem,
  OwnerSnapshotSource,
  ReleaseOwnerId,
  ReleaseOwnerSnapshotBuildResult,
  ReleaseOwnerSnapshotDocument,
} from './release-owner-snapshot';

export { produceOwnerSnapshotSurfaceReports } from './owner-snapshot-surface-producers';
export type {
  OwnerSnapshotSurfaceProductionResult,
} from './owner-snapshot-surface-producers';

export { runScopeReleasePrecheck } from './scope-release-precheck';
export type {
  ScopeReleaseErrorCode,
  ScopeReleasePrecheckResult,
} from './scope-release-precheck';
