import { createHash } from 'node:crypto';
import type { Dirent } from 'node:fs';
import { readFile, readdir, stat } from 'node:fs/promises';
import { isAbsolute, relative, resolve, sep } from 'node:path';
import type { ArtifactSurfaceReport } from './release-artifact-inventory-builder';
import type { ArtifactItem, ArtifactSurface } from './release-set-validator';

export interface NodeReleaseSurfaceProducerOptions {
  candidateRoot: string;
  releaseId: string;
  candidateId: string;
}

export interface SurfaceReportProductionResult {
  report: ArtifactSurfaceReport;
  errors: readonly string[];
}

interface CandidatePackage {
  name: string;
  dir: string;
  manifestPath: string;
  manifestBytes: Buffer;
  main: string;
  types: string;
  dependencies: string[];
  packageExportIds: string[];
  cleanBuildIds: string[];
}

function sha256(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function toPosix(value: string): string {
  return value.split(sep).join('/');
}

function candidateRelative(candidateRoot: string, absolutePath: string): string {
  return toPosix(relative(resolve(candidateRoot), resolve(absolutePath)));
}

function isWithin(parent: string, child: string): boolean {
  const rel = relative(resolve(parent), resolve(child));
  return rel !== '' && !rel.startsWith(`..${sep}`) && rel !== '..' && !isAbsolute(rel);
}

function internalDependencies(manifest: Record<string, unknown>): string[] {
  const names = new Set<string>();
  for (const field of ['dependencies', 'optionalDependencies', 'peerDependencies'] as const) {
    const value = manifest[field];
    if (typeof value !== 'object' || value === null || Array.isArray(value)) continue;
    for (const name of Object.keys(value)) {
      if (name.startsWith('@specforge/')) names.add(name);
    }
  }
  return [...names].sort((left, right) => left.localeCompare(right));
}

function releaseMetadata(
  manifest: Record<string, unknown>,
  packageName: string,
  errors: string[],
): { packageExportIds: string[]; cleanBuildIds: string[] } {
  const raw = manifest.specforgeRelease;
  if (raw === undefined) return { packageExportIds: [], cleanBuildIds: [] };
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    errors.push(`package_export:${packageName}:release_metadata_invalid`);
    return { packageExportIds: [], cleanBuildIds: [] };
  }
  const record = raw as Record<string, unknown>;
  const parseIds = (field: 'packageExportIds' | 'cleanBuildIds'): string[] => {
    const value = record[field];
    if (value === undefined) return [];
    if (!Array.isArray(value)) {
      errors.push(`package_export:${packageName}:${field}_invalid`);
      return [];
    }
    const ids: string[] = [];
    for (const id of value) {
      if (typeof id !== 'string' || !id.trim()) {
        errors.push(`package_export:${packageName}:${field}_item_invalid`);
        continue;
      }
      ids.push(id.trim());
    }
    if (new Set(ids).size !== ids.length) {
      errors.push(`package_export:${packageName}:${field}_duplicate`);
    }
    return [...new Set(ids)].sort((left, right) => left.localeCompare(right));
  };
  return {
    packageExportIds: parseIds('packageExportIds'),
    cleanBuildIds: parseIds('cleanBuildIds'),
  };
}

async function readCandidatePackages(candidateRoot: string): Promise<{
  packages: CandidatePackage[];
  errors: string[];
}> {
  const root = resolve(candidateRoot);
  const packagesDir = resolve(root, 'packages');
  let entries: Dirent<string>[];
  try {
    entries = await readdir(packagesDir, { withFileTypes: true });
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    return {
      packages: [],
      errors: [
        code === 'ENOENT'
          ? 'package_export:packages_directory_missing'
          : `package_export:packages_directory_unreadable:${code ?? 'unknown'}`,
      ],
    };
  }

  const packages: CandidatePackage[] = [];
  const errors: string[] = [];
  const packageNames = new Set<string>();
  for (const entry of [...entries].sort((left, right) => left.name.localeCompare(right.name))) {
    if (!entry.isDirectory()) continue;
    const packageDir = resolve(packagesDir, entry.name);
    const manifestPath = resolve(packageDir, 'package.json');
    let manifestBytes: Buffer;
    try {
      manifestBytes = await readFile(manifestPath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        errors.push(`package_export:packages/${entry.name}/package.json:unreadable`);
      }
      continue;
    }

    let manifest: unknown;
    try {
      manifest = JSON.parse(manifestBytes.toString('utf8')) as unknown;
    } catch {
      errors.push(`package_export:packages/${entry.name}/package.json:json_invalid`);
      continue;
    }
    if (typeof manifest !== 'object' || manifest === null || Array.isArray(manifest)) {
      errors.push(`package_export:packages/${entry.name}/package.json:object_required`);
      continue;
    }
    const record = manifest as Record<string, unknown>;
    if (typeof record.name !== 'string' || !record.name.trim()) {
      errors.push(`package_export:packages/${entry.name}/package.json:name_invalid`);
      continue;
    }
    const name = record.name.trim();
    if (packageNames.has(name)) {
      errors.push(`package_export:${name}:duplicate_package_name`);
      continue;
    }
    packageNames.add(name);
    const metadata = releaseMetadata(record, name, errors);

    if (typeof record.main !== 'string' || !record.main.trim()) {
      errors.push(`package_export:${name}:main_invalid`);
    }
    if (typeof record.types !== 'string' || !record.types.trim()) {
      errors.push(`package_export:${name}:types_invalid`);
    }
    packages.push({
      name,
      dir: packageDir,
      manifestPath,
      manifestBytes,
      main: typeof record.main === 'string' ? record.main.trim() : '',
      types: typeof record.types === 'string' ? record.types.trim() : '',
      dependencies: internalDependencies(record),
      packageExportIds: metadata.packageExportIds,
      cleanBuildIds: metadata.cleanBuildIds,
    });
  }
  if (packages.length === 0 && errors.length === 0) {
    errors.push('package_export:package_manifest_set_empty');
  }
  return { packages, errors };
}

function makeReport(
  options: NodeReleaseSurfaceProducerOptions,
  surface: ArtifactSurface,
  producer: string,
  items: readonly ArtifactItem[],
  errors: readonly string[],
): SurfaceReportProductionResult {
  return {
    report: {
      schemaVersion: '1.0',
      releaseId: options.releaseId,
      candidateId: options.candidateId,
      surface,
      producer,
      complete: errors.length === 0,
      items: [...items].sort((left, right) => {
        const leftKey = `${left.id}:${left.path}`;
        const rightKey = `${right.id}:${right.path}`;
        return leftKey.localeCompare(rightKey);
      }),
    },
    errors: [...new Set(errors)].sort((left, right) => left.localeCompare(right)),
  };
}

export async function producePackageExportSurfaceReport(
  options: NodeReleaseSurfaceProducerOptions,
): Promise<SurfaceReportProductionResult> {
  const candidate = await readCandidatePackages(options.candidateRoot);
  const items: ArtifactItem[] = candidate.packages.flatMap((pkg) => (
    [pkg.name, ...pkg.packageExportIds].map((id) => ({
      id,
      surface: 'package_export' as const,
      path: candidateRelative(options.candidateRoot, pkg.manifestPath),
      sha256: sha256(pkg.manifestBytes),
      dependencies: pkg.dependencies,
    }))
  ));
  return makeReport(
    options,
    'package_export',
    'node-package-export-surface-producer',
    items,
    candidate.errors,
  );
}

export async function produceCleanBuildSurfaceReport(
  options: NodeReleaseSurfaceProducerOptions,
): Promise<SurfaceReportProductionResult> {
  const candidate = await readCandidatePackages(options.candidateRoot);
  const errors = candidate.errors.map((error) => error.replace(/^package_export:/, 'clean_build:'));
  const items: ArtifactItem[] = [];

  for (const pkg of candidate.packages) {
    let mainArtifact: ArtifactItem | undefined;
    for (const [kind, declaredPath] of [['main', pkg.main], ['types', pkg.types]] as const) {
      const normalized = declaredPath.replaceAll('\\', '/');
      if (!normalized.startsWith('dist/')) {
        errors.push(`clean_build:${pkg.name}:${kind}_not_dist:${normalized || '<missing>'}`);
        continue;
      }
      const artifactPath = resolve(pkg.dir, ...normalized.split('/'));
      if (!isWithin(pkg.dir, artifactPath)) {
        errors.push(`clean_build:${pkg.name}:${kind}_path_escape:${normalized}`);
        continue;
      }
      let info;
      try {
        info = await stat(artifactPath);
      } catch {
        errors.push(
          `clean_build:${pkg.name}:${kind}_missing:${candidateRelative(options.candidateRoot, artifactPath)}`,
        );
        continue;
      }
      if (!info.isFile()) {
        errors.push(`clean_build:${pkg.name}:${kind}_not_file:${normalized}`);
        continue;
      }
      const bytes = await readFile(artifactPath);
      const item: ArtifactItem = {
        id: pkg.name,
        surface: 'clean_build',
        path: candidateRelative(options.candidateRoot, artifactPath),
        sha256: sha256(bytes),
        dependencies: pkg.dependencies,
      };
      items.push(item);
      if (kind === 'main') mainArtifact = item;
    }
    if (mainArtifact) {
      for (const id of pkg.cleanBuildIds) {
        items.push({ ...mainArtifact, id });
      }
    }
  }

  const rootManifestPath = resolve(options.candidateRoot, 'package.json');
  try {
    const rootManifest = JSON.parse(await readFile(rootManifestPath, 'utf8')) as unknown;
    if (typeof rootManifest !== 'object' || rootManifest === null || Array.isArray(rootManifest)) {
      errors.push('clean_build:root_package_json_object_required');
    } else {
      const release = (rootManifest as Record<string, unknown>).specforgeRelease;
      const cleanBuildFiles = typeof release === 'object' && release !== null && !Array.isArray(release)
        ? (release as Record<string, unknown>).cleanBuildFiles
        : undefined;
      if (cleanBuildFiles !== undefined && !Array.isArray(cleanBuildFiles)) {
        errors.push('clean_build:root_release_files_invalid');
      } else if (Array.isArray(cleanBuildFiles)) {
        const seenIds = new Set<string>();
        for (const raw of cleanBuildFiles) {
          if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
            errors.push('clean_build:root_release_file_invalid');
            continue;
          }
          const entry = raw as Record<string, unknown>;
          const id = typeof entry.id === 'string' ? entry.id.trim() : '';
          const declaredPath = typeof entry.path === 'string'
            ? entry.path.trim().replaceAll('\\', '/')
            : '';
          if (!id || !declaredPath) {
            errors.push('clean_build:root_release_file_fields_invalid');
            continue;
          }
          if (seenIds.has(id)) errors.push(`clean_build:root_release_file_duplicate:${id}`);
          seenIds.add(id);
          const artifactPath = resolve(options.candidateRoot, ...declaredPath.split('/'));
          if (!isWithin(options.candidateRoot, artifactPath)) {
            errors.push(`clean_build:${id}:path_escape:${declaredPath}`);
            continue;
          }
          let info;
          try {
            info = await stat(artifactPath);
          } catch {
            errors.push(`clean_build:${id}:missing:${declaredPath}`);
            continue;
          }
          if (!info.isFile()) {
            errors.push(`clean_build:${id}:not_file:${declaredPath}`);
            continue;
          }
          const bytes = await readFile(artifactPath);
          items.push({
            id,
            surface: 'clean_build',
            path: declaredPath,
            sha256: sha256(bytes),
            dependencies: [],
          });
        }
      }
    }
  } catch {
    errors.push('clean_build:root_package_json_invalid');
  }

  return makeReport(
    options,
    'clean_build',
    'node-clean-build-surface-producer',
    items,
    errors,
  );
}
