import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';

export interface ProductIdentity {
  version: string;
  releaseId: string;
  tagPrefix: string;
  versionEpoch: number;
}

interface RootPackageJson {
  version?: unknown;
  specforgeRelease?: {
    releaseId?: unknown;
    tagPrefix?: unknown;
    versionEpoch?: unknown;
  };
}

const SEMVER_PATTERN = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;

async function readJson(path: string): Promise<unknown> {
  return JSON.parse(await readFile(path, 'utf8'));
}

export async function loadProductIdentity(candidateRoot: string): Promise<ProductIdentity> {
  const rootPackage = await readJson(join(candidateRoot, 'package.json')) as RootPackageJson;
  const release = rootPackage.specforgeRelease;

  if (typeof rootPackage.version !== 'string' || !SEMVER_PATTERN.test(rootPackage.version)) {
    throw new Error('PRODUCT_IDENTITY_INVALID_VERSION');
  }
  if (typeof release?.releaseId !== 'string' || release.releaseId.trim() === '') {
    throw new Error('PRODUCT_IDENTITY_INVALID_RELEASE_ID');
  }
  if (typeof release.tagPrefix !== 'string' || release.tagPrefix.trim() === '') {
    throw new Error('PRODUCT_IDENTITY_INVALID_TAG_PREFIX');
  }
  if (!Number.isInteger(release.versionEpoch) || Number(release.versionEpoch) < 1) {
    throw new Error('PRODUCT_IDENTITY_INVALID_VERSION_EPOCH');
  }

  return {
    version: rootPackage.version,
    releaseId: release.releaseId,
    tagPrefix: release.tagPrefix,
    versionEpoch: Number(release.versionEpoch),
  };
}

export async function assertWorkspaceVersionAlignment(
  candidateRoot: string,
  expectedVersion: string,
): Promise<void> {
  const packagesRoot = join(candidateRoot, 'packages');
  const entries = await readdir(packagesRoot, { withFileTypes: true });
  const mismatches: string[] = [];

  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    if (!entry.isDirectory()) continue;
    const packagePath = join(packagesRoot, entry.name, 'package.json');
    try {
      const packageJson = await readJson(packagePath) as { version?: unknown };
      if (packageJson.version !== expectedVersion) {
        mismatches.push(`${entry.name}:${String(packageJson.version)}`);
      }
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== 'ENOENT') throw error;
    }
  }

  if (mismatches.length > 0) {
    throw new Error(
      `WORKSPACE_VERSION_MISMATCH:expected:${expectedVersion}:actual:${mismatches.join(',')}`,
    );
  }
}

export function expectedProductTag(identity: ProductIdentity): string {
  return `${identity.tagPrefix}${identity.version}`;
}
