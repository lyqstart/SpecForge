import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { relative, resolve, sep } from 'node:path';
import type {
  OwnerReleaseSnapshotReport,
  OwnerSnapshotItem,
  OwnerSnapshotSource,
} from '../../packages/scope-gate/src/release-owner-snapshot';
import { ToolDispatcher } from '../../packages/daemon-core/src/tools/index';
import { WorkflowLoader } from '../../packages/workflow-runtime/src/engine/WorkflowLoader';
import {
  SHARED_COMPONENT_REGISTRY,
  resolveRegistryReleaseItemIds,
  resolveRegistrySourcePath,
} from './registry';

export interface RepositoryOwnerSnapshotOptions {
  candidateRoot: string;
  releaseId: string;
  candidateId: string;
}

export interface RepositoryOwnerSnapshotProductionResult {
  reports: readonly OwnerReleaseSnapshotReport[];
  errors: readonly string[];
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

async function bindSource(
  candidateRoot: string,
  relativePath: string,
  owner: string,
  errors: string[],
): Promise<OwnerSnapshotSource | undefined> {
  const absolutePath = resolve(candidateRoot, ...relativePath.split('/'));
  try {
    const bytes = await readFile(absolutePath);
    return { path: relativePath, sha256: sha256(bytes) };
  } catch {
    errors.push(`owner_snapshot_producer:${owner}:source_missing:${relativePath}`);
    return undefined;
  }
}

function report(
  options: RepositoryOwnerSnapshotOptions,
  owner: OwnerReleaseSnapshotReport['owner'],
  producer: string,
  sources: readonly OwnerSnapshotSource[],
  items: readonly OwnerSnapshotItem[],
  errors: readonly string[],
): OwnerReleaseSnapshotReport {
  return {
    schemaVersion: '1.0',
    releaseId: options.releaseId,
    candidateId: options.candidateId,
    owner,
    producer,
    complete: errors.length === 0,
    sources: [...sources].sort((left, right) => left.path.localeCompare(right.path)),
    items: [...items].sort((left, right) => left.id.localeCompare(right.id)),
  };
}

async function produceDaemonToolReport(
  options: RepositoryOwnerSnapshotOptions,
): Promise<{ report: OwnerReleaseSnapshotReport; errors: string[] }> {
  const errors: string[] = [];
  const sourcePaths = [
    'packages/daemon-core/src/tools/ToolDispatcher.ts',
    'packages/daemon-core/src/tools/index.ts',
  ];
  const handlersDir = resolve(options.candidateRoot, 'packages/daemon-core/src/tools/handlers');
  try {
    const entries = await readdir(handlersDir, { withFileTypes: true });
    sourcePaths.push(
      ...entries
        .filter((entry) => entry.isFile() && entry.name.endsWith('.ts'))
        .map((entry) => `packages/daemon-core/src/tools/handlers/${entry.name}`),
    );
  } catch {
    errors.push('owner_snapshot_producer:daemon_tool_registry:handlers_directory_unreadable');
  }

  const sources = (await Promise.all(
    [...new Set(sourcePaths)].map((path) => bindSource(
      options.candidateRoot,
      path,
      'daemon_tool_registry',
      errors,
    )),
  )).filter((source): source is OwnerSnapshotSource => source !== undefined);

  const dispatcher = new ToolDispatcher({} as never);
  const items = dispatcher.listRegisteredTools()
    .sort((left, right) => left.localeCompare(right))
    .map((toolName): OwnerSnapshotItem => ({
      id: `tool:${toolName}`,
      sourcePath: 'packages/daemon-core/src/tools/index.ts',
      dependencies: [],
    }));
  if (items.length === 0) {
    errors.push('owner_snapshot_producer:daemon_tool_registry:item_set_empty');
  }

  return {
    report: report(
      options,
      'daemon_tool_registry',
      'daemon-tool-registry-owner-snapshot',
      sources,
      items,
      errors,
    ),
    errors,
  };
}

async function produceWorkflowReport(
  options: RepositoryOwnerSnapshotOptions,
): Promise<{ report: OwnerReleaseSnapshotReport; errors: string[] }> {
  const errors: string[] = [];
  const workflowDir = resolve(options.candidateRoot, 'configs/workflows/builtin');
  const loader = new WorkflowLoader();
  const definitions = await loader.loadBuiltinWorkflows(workflowDir);
  const sources: OwnerSnapshotSource[] = [];
  const sourceById = new Map<string, string>();
  for (const definition of definitions) {
    const fileName = `${definition.id}.json`;
    const relativePath = `configs/workflows/builtin/${fileName}`;
    const source = await bindSource(
      options.candidateRoot,
      relativePath,
      'workflow_registry',
      errors,
    );
    if (!source) continue;
    sources.push(source);
    try {
      const parsed = JSON.parse(
        (await readFile(resolve(workflowDir, fileName))).toString('utf8'),
      ) as Record<string, unknown>;
      if (typeof parsed.id !== 'string' || parsed.id !== definition.id) {
        errors.push(`owner_snapshot_producer:workflow_registry:id_invalid:${relativePath}`);
      } else if (sourceById.has(parsed.id)) {
        errors.push(`owner_snapshot_producer:workflow_registry:id_duplicate:${parsed.id}`);
      } else {
        sourceById.set(parsed.id, relativePath);
      }
    } catch {
      errors.push(`owner_snapshot_producer:workflow_registry:json_invalid:${relativePath}`);
    }
  }

  const items = definitions.flatMap((definition): OwnerSnapshotItem[] => {
    const sourcePath = sourceById.get(definition.id);
    if (!sourcePath) return [];
    return [{ id: `workflow:${definition.id}`, sourcePath, dependencies: [] }];
  });
  if (items.length === 0) {
    errors.push('owner_snapshot_producer:workflow_registry:item_set_empty');
  }

  return {
    report: report(
      options,
      'workflow_registry',
      'workflow-runtime-owner-snapshot',
      sources,
      items,
      errors,
    ),
    errors,
  };
}

async function produceInstallerReport(
  options: RepositoryOwnerSnapshotOptions,
): Promise<{ report: OwnerReleaseSnapshotReport; errors: string[] }> {
  const errors: string[] = [];
  const sources: OwnerSnapshotSource[] = [];
  const items: OwnerSnapshotItem[] = [];
  const registrySource = await bindSource(
    options.candidateRoot,
    'scripts/lib/registry.ts',
    'installer_registry',
    errors,
  );
  if (registrySource) sources.push(registrySource);

  for (const entry of SHARED_COMPONENT_REGISTRY) {
    const sourcePath = resolveRegistrySourcePath(entry);
    const source = await bindSource(
      options.candidateRoot,
      sourcePath,
      'installer_registry',
      errors,
    );
    if (!source) continue;
    sources.push(source);
    for (const id of resolveRegistryReleaseItemIds(entry)) {
      items.push({ id, sourcePath, dependencies: [] });
    }
  }
  if (items.length === 0) {
    errors.push('owner_snapshot_producer:installer_registry:item_set_empty');
  }

  return {
    report: report(
      options,
      'installer_registry',
      'installer-registry-owner-snapshot',
      sources,
      items,
      errors,
    ),
    errors,
  };
}

export async function produceRepositoryOwnerSnapshotReports(
  options: RepositoryOwnerSnapshotOptions,
): Promise<RepositoryOwnerSnapshotProductionResult> {
  const produced = await Promise.all([
    produceDaemonToolReport(options),
    produceWorkflowReport(options),
    produceInstallerReport(options),
  ]);
  return {
    reports: produced.map((entry) => entry.report),
    errors: [...new Set(produced.flatMap((entry) => entry.errors))]
      .sort((left, right) => left.localeCompare(right)),
  };
}
