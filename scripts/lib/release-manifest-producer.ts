import { createHash } from 'node:crypto';
import type { Dirent } from 'node:fs';
import { mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';

import type { ArtifactSurfaceReport } from '../../packages/scope-gate/src/release-artifact-inventory-builder';
import type { ArtifactItem } from '../../packages/scope-gate/src/release-set-validator';
import {
  SHARED_COMPONENT_REGISTRY,
  resolveRegistryEntryPath,
  resolveRegistryReleaseItemIds,
  resolveRegistrySourcePath,
} from './registry';
import type { ComponentEntry, ManagedComponentType } from './types';

export interface ReleaseManifestArtifact {
  id: string;
  path: string;
  targetPath?: string;
  sha256: string;
  size: number;
  type: ManagedComponentType | 'package' | 'installer';
}

export interface ReleaseInstallFile {
  sourcePath: string;
  targetPath: string;
  sha256: string;
  size: number;
  type: ManagedComponentType;
}

export interface ReleaseManifestDocument {
  schemaVersion: '1.0';
  releaseId: string;
  candidateId: string;
  version: string;
  complete: boolean;
  artifacts: readonly ReleaseManifestArtifact[];
  installFiles: readonly ReleaseInstallFile[];
}

export interface ReleaseManifestProducerOptions {
  candidateRoot: string;
  releaseId: string;
  candidateId: string;
  platform?: NodeJS.Platform;
  registry?: readonly ComponentEntry[];
  outputPath?: string;
}

export interface ReleaseManifestProductionResult {
  document: ReleaseManifestDocument;
  report: ArtifactSurfaceReport;
  errors: readonly string[];
  manifestPath: string;
}

export interface RuntimeEntryProducerOptions {
  candidateRoot: string;
  releaseId: string;
  candidateId: string;
  manifestPath?: string;
}

export interface RuntimeEntryProductionResult {
  report: ArtifactSurfaceReport;
  errors: readonly string[];
}

export interface ReleaseInstallSetOptions {
  candidateRoot: string;
  manifestPath?: string;
  expectedReleaseId?: string;
  expectedCandidateId?: string;
}

export interface ReleaseInstallSetResult {
  ok: boolean;
  releaseId: string;
  candidateId: string;
  version: string;
  files: readonly ReleaseInstallFile[];
  errors: readonly string[];
}

const DEFAULT_MANIFEST_PATH = 'release/release-manifest.json';
const HANDSHAKE_PRODUCER_PATH = 'packages/daemon-core/src/daemon/HandshakeManager.ts';

function sha256(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function toPosix(value: string): string {
  return value.split(sep).join('/');
}

function candidateRelative(candidateRoot: string, absolutePath: string): string {
  return toPosix(relative(resolve(candidateRoot), resolve(absolutePath)));
}

function isCandidateRelativePath(value: string): boolean {
  const normalized = value.replaceAll('\\', '/');
  return Boolean(normalized)
    && !normalized.startsWith('/')
    && !/^[a-zA-Z]:\//.test(normalized)
    && !normalized.split('/').includes('..');
}

function resolveCandidatePath(candidateRoot: string, relativePath: string): string | undefined {
  if (!isCandidateRelativePath(relativePath)) return undefined;
  const root = resolve(candidateRoot);
  const absolute = resolve(root, ...relativePath.replaceAll('\\', '/').split('/'));
  const rel = relative(root, absolute);
  if (!rel || rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel)) return undefined;
  return absolute;
}

function sortedUnique(values: Iterable<string>): string[] {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}

async function readBoundArtifact(
  candidateRoot: string,
  path: string,
  errorPrefix: string,
  errors: string[],
): Promise<{ bytes: Buffer; size: number } | undefined> {
  const absolute = resolveCandidatePath(candidateRoot, path);
  if (!absolute) {
    errors.push(`${errorPrefix}:path_invalid:${path}`);
    return undefined;
  }
  try {
    const info = await stat(absolute);
    if (!info.isFile()) {
      errors.push(`${errorPrefix}:source_not_file:${path}`);
      return undefined;
    }
    const bytes = await readFile(absolute);
    if (bytes.length === 0) {
      errors.push(`${errorPrefix}:source_empty:${path}`);
      return undefined;
    }
    return { bytes, size: info.size };
  } catch {
    errors.push(`${errorPrefix}:source_missing:${path}`);
    return undefined;
  }
}

async function packageArtifacts(
  candidateRoot: string,
  errors: string[],
): Promise<ReleaseManifestArtifact[]> {
  const packagesPath = resolve(candidateRoot, 'packages');
  let entries: Dirent<string>[];
  try {
    entries = await readdir(packagesPath, { withFileTypes: true });
  } catch {
    errors.push('release_manifest:packages_directory_missing');
    return [];
  }

  const artifacts: ReleaseManifestArtifact[] = [];
  for (const entry of [...entries].sort((left, right) => left.name.localeCompare(right.name))) {
    if (!entry.isDirectory()) continue;
    const manifestPath = `packages/${entry.name}/package.json`;
    const manifestArtifact = await readBoundArtifact(
      candidateRoot,
      manifestPath,
      'release_manifest',
      errors,
    );
    if (!manifestArtifact) continue;

    let manifest: Record<string, unknown>;
    try {
      const value = JSON.parse(manifestArtifact.bytes.toString('utf8')) as unknown;
      if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error();
      manifest = value as Record<string, unknown>;
    } catch {
      errors.push(`release_manifest:package_json_invalid:${manifestPath}`);
      continue;
    }
    const name = typeof manifest.name === 'string' ? manifest.name.trim() : '';
    const main = typeof manifest.main === 'string' ? manifest.main.trim().replaceAll('\\', '/') : '';
    const types = typeof manifest.types === 'string' ? manifest.types.trim().replaceAll('\\', '/') : '';
    if (!name) {
      errors.push(`release_manifest:package_name_invalid:${manifestPath}`);
      continue;
    }
    if (!main.startsWith('dist/') || !types.startsWith('dist/')) {
      errors.push(`release_manifest:package_build_paths_invalid:${name}`);
      continue;
    }
    const mainPath = `packages/${entry.name}/${main}`;
    const typesPath = `packages/${entry.name}/${types}`;
    const mainArtifact = await readBoundArtifact(candidateRoot, mainPath, 'release_manifest', errors);
    const typesArtifact = await readBoundArtifact(candidateRoot, typesPath, 'release_manifest', errors);
    if (!mainArtifact || !typesArtifact) continue;
    artifacts.push({
      id: name,
      path: mainPath,
      sha256: sha256(mainArtifact.bytes),
      size: mainArtifact.size,
      type: 'package',
    });
  }
  if (artifacts.length === 0 && errors.length === 0) {
    errors.push('release_manifest:package_artifact_set_empty');
  }
  return artifacts;
}

function report(
  options: Pick<ReleaseManifestProducerOptions, 'releaseId' | 'candidateId'>,
  surface: 'release_manifest' | 'runtime_entry',
  producer: string,
  items: readonly ArtifactItem[],
  errors: readonly string[],
): ArtifactSurfaceReport {
  return {
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
  };
}

export async function produceReleaseManifest(
  options: ReleaseManifestProducerOptions,
): Promise<ReleaseManifestProductionResult> {
  const candidateRoot = resolve(options.candidateRoot);
  const platform = options.platform ?? process.platform;
  const registry = options.registry ?? SHARED_COMPONENT_REGISTRY;
  const outputPath = options.outputPath ?? DEFAULT_MANIFEST_PATH;
  const errors: string[] = [];
  const artifacts = await packageArtifacts(candidateRoot, errors);
  const installFiles: ReleaseInstallFile[] = [];

  for (const entry of registry) {
    const sourcePath = resolveRegistrySourcePath(entry, platform);
    const source = await readBoundArtifact(candidateRoot, sourcePath, 'release_manifest', errors);
    if (!source) continue;
    const targetPath = resolveRegistryEntryPath(entry, platform).replaceAll('\\', '/');
    installFiles.push({
      sourcePath,
      targetPath,
      sha256: sha256(source.bytes),
      size: source.size,
      type: entry.type,
    });
    for (const id of resolveRegistryReleaseItemIds(entry, platform)) {
      artifacts.push({
        id,
        path: sourcePath,
        targetPath,
        sha256: sha256(source.bytes),
        size: source.size,
        type: entry.type,
      });
    }
  }

  const installerPath = 'scripts/sf-installer.ts';
  const installer = await readBoundArtifact(candidateRoot, installerPath, 'release_manifest', errors);
  if (installer) {
    artifacts.push({
      id: 'release:installer',
      path: installerPath,
      sha256: sha256(installer.bytes),
      size: installer.size,
      type: 'installer',
    });
  }

  const packagePath = resolveCandidatePath(candidateRoot, 'package.json');
  let version = '';
  if (!packagePath) {
    errors.push('release_manifest:package_json_path_invalid');
  } else {
    try {
      const rootManifest = JSON.parse(await readFile(packagePath, 'utf8')) as Record<string, unknown>;
      version = typeof rootManifest.version === 'string' ? rootManifest.version.trim() : '';
    } catch {
      errors.push('release_manifest:root_package_json_invalid');
    }
  }
  if (!version) errors.push('release_manifest:version_missing');

  const seenIds = new Set<string>();
  for (const artifact of artifacts) {
    if (seenIds.has(artifact.id)) errors.push(`release_manifest:item_duplicate:${artifact.id}`);
    seenIds.add(artifact.id);
  }
  const seenTargets = new Set<string>();
  for (const file of installFiles) {
    if (seenTargets.has(file.targetPath)) {
      errors.push(`release_manifest:install_target_duplicate:${file.targetPath}`);
    }
    seenTargets.add(file.targetPath);
  }
  artifacts.sort((left, right) => `${left.id}:${left.path}`.localeCompare(`${right.id}:${right.path}`));
  installFiles.sort((left, right) => left.targetPath.localeCompare(right.targetPath));

  const normalizedErrors = sortedUnique(errors);
  const document: ReleaseManifestDocument = {
    schemaVersion: '1.0',
    releaseId: options.releaseId,
    candidateId: options.candidateId,
    version,
    complete: normalizedErrors.length === 0,
    artifacts,
    installFiles,
  };

  const absoluteOutput = resolveCandidatePath(candidateRoot, outputPath);
  if (!absoluteOutput) {
    const finalErrors = sortedUnique([...normalizedErrors, `release_manifest:output_path_invalid:${outputPath}`]);
    document.complete = false;
    return {
      document,
      report: report(options, 'release_manifest', 'release-manifest-producer', [], finalErrors),
      errors: finalErrors,
      manifestPath: outputPath,
    };
  }
  await mkdir(dirname(absoluteOutput), { recursive: true });
  await writeFile(absoluteOutput, `${JSON.stringify(document, null, 2)}\n`, 'utf8');
  const manifestBytes = await readFile(absoluteOutput);
  const manifestItems: ArtifactItem[] = artifacts.map((artifact) => ({
    id: artifact.id,
    surface: 'release_manifest',
    path: artifact.path,
    sha256: artifact.sha256,
    dependencies: [],
  }));
  manifestItems.push({
    id: 'release:release-manifest',
    surface: 'release_manifest',
    path: candidateRelative(candidateRoot, absoluteOutput),
    sha256: sha256(manifestBytes),
    dependencies: [],
  });

  return {
    document,
    report: report(
      options,
      'release_manifest',
      'release-manifest-producer',
      manifestItems,
      normalizedErrors,
    ),
    errors: normalizedErrors,
    manifestPath: candidateRelative(candidateRoot, absoluteOutput),
  };
}

function parseManifest(value: unknown): ReleaseManifestDocument | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined;
  const record = value as Record<string, unknown>;
  if (
    record.schemaVersion !== '1.0'
    || typeof record.releaseId !== 'string'
    || typeof record.candidateId !== 'string'
    || typeof record.version !== 'string'
    || typeof record.complete !== 'boolean'
    || !Array.isArray(record.artifacts)
    || !Array.isArray(record.installFiles)
  ) return undefined;
  const artifacts: ReleaseManifestArtifact[] = [];
  for (const raw of record.artifacts) {
    if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return undefined;
    const artifact = raw as Record<string, unknown>;
    if (
      typeof artifact.id !== 'string'
      || typeof artifact.path !== 'string'
      || typeof artifact.sha256 !== 'string'
      || typeof artifact.size !== 'number'
      || typeof artifact.type !== 'string'
      || (artifact.targetPath !== undefined && typeof artifact.targetPath !== 'string')
    ) return undefined;
    artifacts.push(artifact as unknown as ReleaseManifestArtifact);
  }
  const installFiles: ReleaseInstallFile[] = [];
  for (const raw of record.installFiles) {
    if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return undefined;
    const file = raw as Record<string, unknown>;
    if (
      typeof file.sourcePath !== 'string'
      || typeof file.targetPath !== 'string'
      || typeof file.sha256 !== 'string'
      || typeof file.size !== 'number'
      || typeof file.type !== 'string'
    ) return undefined;
    installFiles.push(file as unknown as ReleaseInstallFile);
  }
  return { ...record, artifacts, installFiles } as unknown as ReleaseManifestDocument;
}

export async function loadVerifiedReleaseInstallSet(
  options: ReleaseInstallSetOptions,
): Promise<ReleaseInstallSetResult> {
  const candidateRoot = resolve(options.candidateRoot);
  const manifestPath = options.manifestPath ?? DEFAULT_MANIFEST_PATH;
  const errors: string[] = [];
  const absoluteManifest = resolveCandidatePath(candidateRoot, manifestPath);
  let manifest: ReleaseManifestDocument | undefined;

  if (!absoluteManifest) {
    errors.push(`release_install_set:manifest_path_invalid:${manifestPath}`);
  } else {
    try {
      manifest = parseManifest(JSON.parse(await readFile(absoluteManifest, 'utf8')) as unknown);
    } catch {
      errors.push(`release_install_set:manifest_invalid:${manifestPath}`);
    }
  }
  if (!manifest) {
    if (errors.length === 0) errors.push(`release_install_set:manifest_invalid:${manifestPath}`);
    return {
      ok: false,
      releaseId: '',
      candidateId: '',
      version: '',
      files: [],
      errors: sortedUnique(errors),
    };
  }

  if (!manifest.complete) errors.push('release_install_set:manifest_incomplete');
  if (!manifest.releaseId.trim()) errors.push('release_install_set:release_id_missing');
  if (!manifest.candidateId.trim()) errors.push('release_install_set:candidate_id_missing');
  if (!manifest.version.trim()) errors.push('release_install_set:version_missing');
  if (options.expectedReleaseId && manifest.releaseId !== options.expectedReleaseId) {
    errors.push(
      `release_install_set:release_id:${manifest.releaseId}:expected:${options.expectedReleaseId}`,
    );
  }
  if (options.expectedCandidateId && manifest.candidateId !== options.expectedCandidateId) {
    errors.push(
      `release_install_set:candidate_id:${manifest.candidateId}:expected:${options.expectedCandidateId}`,
    );
  }
  if (manifest.installFiles.length === 0) errors.push('release_install_set:files_empty');

  const byTarget = new Map<string, ReleaseInstallFile>();
  for (const file of manifest.installFiles) {
    if (!isCandidateRelativePath(file.sourcePath)) {
      errors.push(`release_install_set:source_path_invalid:${file.sourcePath}`);
      continue;
    }
    if (!isCandidateRelativePath(file.targetPath)) {
      errors.push(`release_install_set:target_path_invalid:${file.targetPath}`);
      continue;
    }
    if (!/^[a-f0-9]{64}$/.test(file.sha256)) {
      errors.push(`release_install_set:sha256_invalid:${file.targetPath}`);
    }
    if (!Number.isSafeInteger(file.size) || file.size <= 0) {
      errors.push(`release_install_set:size_invalid:${file.targetPath}`);
    }
    if (byTarget.has(file.targetPath)) {
      errors.push(`release_install_set:target_duplicate:${file.targetPath}`);
    }
    byTarget.set(file.targetPath, file);

    const current = await readBoundArtifact(
      candidateRoot,
      file.sourcePath,
      'release_install_set',
      errors,
    );
    if (!current) continue;
    if (sha256(current.bytes) !== file.sha256 || current.size !== file.size) {
      errors.push(`release_install_set:hash_mismatch:${file.targetPath}`);
    }
  }

  for (const artifact of manifest.artifacts) {
    if (!artifact.targetPath) continue;
    const physical = byTarget.get(artifact.targetPath);
    if (!physical) {
      errors.push(`release_install_set:logical_target_missing:${artifact.id}`);
      continue;
    }
    if (
      physical.sourcePath !== artifact.path
      || physical.sha256 !== artifact.sha256
      || physical.size !== artifact.size
      || physical.type !== artifact.type
    ) {
      errors.push(`release_install_set:logical_target_mismatch:${artifact.id}`);
    }
  }

  const normalizedErrors = sortedUnique(errors);
  return {
    ok: normalizedErrors.length === 0,
    releaseId: manifest.releaseId,
    candidateId: manifest.candidateId,
    version: manifest.version,
    files: [...manifest.installFiles].sort((left, right) => (
      left.targetPath.localeCompare(right.targetPath)
    )),
    errors: normalizedErrors,
  };
}

export async function produceRuntimeEntrySurfaceReport(
  options: RuntimeEntryProducerOptions,
): Promise<RuntimeEntryProductionResult> {
  const candidateRoot = resolve(options.candidateRoot);
  const manifestPath = options.manifestPath ?? DEFAULT_MANIFEST_PATH;
  const errors: string[] = [];
  const items: ArtifactItem[] = [];
  const absoluteManifest = resolveCandidatePath(candidateRoot, manifestPath);
  let manifestBytes: Buffer | undefined;
  let manifest: ReleaseManifestDocument | undefined;

  if (!absoluteManifest) {
    errors.push(`runtime_entry:manifest_path_invalid:${manifestPath}`);
  } else {
    try {
      manifestBytes = await readFile(absoluteManifest);
      manifest = parseManifest(JSON.parse(manifestBytes.toString('utf8')) as unknown);
    } catch {
      errors.push(`runtime_entry:manifest_invalid:${manifestPath}`);
    }
  }
  if (!manifest) {
    if (errors.length === 0) errors.push(`runtime_entry:manifest_invalid:${manifestPath}`);
  } else {
    if (!manifest.complete) errors.push('runtime_entry:manifest_incomplete');
    if (manifest.releaseId !== options.releaseId) {
      errors.push(`runtime_entry:release_id:${manifest.releaseId}:expected:${options.releaseId}`);
    }
    if (manifest.candidateId !== options.candidateId) {
      errors.push(`runtime_entry:candidate_id:${manifest.candidateId}:expected:${options.candidateId}`);
    }
    const byId = new Map<string, ReleaseManifestArtifact>();
    for (const artifact of manifest.artifacts) {
      if (byId.has(artifact.id)) errors.push(`runtime_entry:manifest_item_duplicate:${artifact.id}`);
      byId.set(artifact.id, artifact);
    }
    const requiredManifestIds = [
      'plugin:sf_specforge',
      'release:installer',
      'runtime:specforge',
      'runtime:specforged',
      'thin-plugin:daemon-start',
      'thin-plugin:event-reporting',
      'thin-plugin:recovery-display',
    ];
    for (const id of requiredManifestIds) {
      const artifact = byId.get(id);
      if (!artifact) {
        errors.push(`runtime_entry:manifest_item_missing:${id}`);
        continue;
      }
      const current = await readBoundArtifact(candidateRoot, artifact.path, 'runtime_entry', errors);
      if (!current) continue;
      if (sha256(current.bytes) !== artifact.sha256 || current.size !== artifact.size) {
        errors.push(`runtime_entry:hash_mismatch:${id}`);
        continue;
      }
      items.push({
        id,
        surface: 'runtime_entry',
        path: artifact.path,
        sha256: artifact.sha256,
        dependencies: [],
      });
    }
  }

  if (manifestBytes && absoluteManifest) {
    items.push({
      id: 'release:release-manifest',
      surface: 'runtime_entry',
      path: candidateRelative(candidateRoot, absoluteManifest),
      sha256: sha256(manifestBytes),
      dependencies: [],
    });
  }

  const handshake = await readBoundArtifact(
    candidateRoot,
    HANDSHAKE_PRODUCER_PATH,
    'runtime_entry',
    errors,
  );
  if (handshake) {
    items.push({
      id: 'runtime:handshake',
      surface: 'runtime_entry',
      path: HANDSHAKE_PRODUCER_PATH,
      sha256: sha256(handshake.bytes),
      dependencies: [],
    });
  }

  const normalizedErrors = sortedUnique(errors);
  return {
    report: report(
      options,
      'runtime_entry',
      'release-runtime-entry-surface-producer',
      items,
      normalizedErrors,
    ),
    errors: normalizedErrors,
  };
}
