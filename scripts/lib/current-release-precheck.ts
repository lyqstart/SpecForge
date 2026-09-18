import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { buildReleaseArtifactInventory } from '../../packages/scope-gate/src/release-artifact-inventory-builder';
import { produceCleanBuildSurfaceReport, producePackageExportSurfaceReport } from '../../packages/scope-gate/src/node-release-surface-producers';
import { produceOwnerSnapshotSurfaceReports } from '../../packages/scope-gate/src/owner-snapshot-surface-producers';
import { projectReleaseAuthority } from '../../packages/scope-gate/src/release-authority-projection';
import { runScopeReleasePrecheck, type ScopeReleasePrecheckResult } from '../../packages/scope-gate/src/scope-release-precheck';
import { produceReleaseManifest, produceRuntimeEntrySurfaceReport } from './release-manifest-producer';
import { produceRepositoryOwnerSnapshotReports } from './release-owner-snapshot-producers';

export interface CurrentReleasePrecheckOptions {
  candidateRoot: string;
  releaseId: string;
  candidateId: string;
}

export interface CurrentReleasePrecheckRunResult {
  passed: boolean;
  producerErrors: readonly string[];
  inventoryErrors: readonly string[];
  result?: ScopeReleasePrecheckResult;
}

const PRODUCT_SPECIFICATION_PATH = 'docs/product-specification/specforge-product-specification.md';

export async function runCurrentReleasePrecheck(
  options: CurrentReleasePrecheckOptions,
): Promise<CurrentReleasePrecheckRunResult> {
  const candidateRoot = resolve(options.candidateRoot);
  const productSpecification = await readFile(
    resolve(candidateRoot, ...PRODUCT_SPECIFICATION_PATH.split('/')),
    'utf8',
  );
  const authority = projectReleaseAuthority({
    releaseId: options.releaseId,
    productSpecification: {
      path: PRODUCT_SPECIFICATION_PATH,
      content: productSpecification,
    },
  });

  const producerOptions = {
    candidateRoot,
    releaseId: options.releaseId,
    candidateId: options.candidateId,
  };
  const [packageExport, cleanBuild, owners, manifest] = await Promise.all([
    producePackageExportSurfaceReport(producerOptions),
    produceCleanBuildSurfaceReport(producerOptions),
    produceRepositoryOwnerSnapshotReports(producerOptions),
    produceReleaseManifest(producerOptions),
  ]);
  const ownerSurfaces = produceOwnerSnapshotSurfaceReports(owners.reports);
  const runtime = await produceRuntimeEntrySurfaceReport(producerOptions);
  const producerErrors = [...new Set([
    ...authority.errors,
    ...packageExport.errors,
    ...cleanBuild.errors,
    ...owners.errors,
    ...ownerSurfaces.errors,
    ...manifest.errors,
    ...runtime.errors,
  ])].sort((left, right) => left.localeCompare(right));

  const inventory = buildReleaseArtifactInventory([
    packageExport.report,
    cleanBuild.report,
    ...(ownerSurfaces.reports ?? []),
    manifest.report,
    runtime.report,
  ]);
  if (!authority.document || !inventory.document) {
    return {
      passed: false,
      producerErrors,
      inventoryErrors: inventory.errors,
    };
  }

  const result = runScopeReleasePrecheck(authority.document, inventory.document);
  return {
    passed: producerErrors.length === 0 && result.status === 'passed',
    producerErrors,
    inventoryErrors: inventory.errors,
    result,
  };
}
